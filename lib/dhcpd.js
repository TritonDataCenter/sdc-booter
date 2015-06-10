/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * DHCP server daemon: uses networking information and boot parameters from
 * SDC APIs to create DHCP replies suitable for booting SDC Compute Nodes.
 *
 */

var assert = require('assert-plus');
var fmt = require('util').format;
var fs = require('fs');
var dgram = require('dgram');
var dhcp = require('./dhcp');
var mod_boot_files = require('./boot-files');
var mod_clients = require('./clients');
var sprintf = require('sprintf').sprintf;
var uuid = require('node-uuid');



// --- DHCPD object and methods



/**
 * DHCPD constructor
 */
function DHCPD(opts) {
    this.config = opts.config;

    this.cnapi = mod_clients.createCNAPIclient(this.config);
    this.log = opts.log;
    this.napi = mod_clients.createNAPIclient(this.config);
}


/**
 * Starts the server
 */
DHCPD.prototype.start = function () {
    var self = this;

    this.sock = dgram.createSocket('udp4', function (msg, peer) {
        self.handleMessage(msg, peer);
    });

    this.sock.on('listening', function () {
        self.sock.setTTL(128);  // XXX Doesn't work! :( Bug in node?
        self.sock.setBroadcast(true);
        self.log.info('dhcpd started on %s:%d',
            self.config.listenIp, self.config.port);
    });
    this.sock.bind(this.config.port, this.config.listenIp);
};


/**
 * Handles an incoming DHCP message, sending out a response if necessary.
 */
DHCPD.prototype.handleMessage = function (msg, peer) {
    var self = this;
    var packet = dhcp.parse(msg);
    var mac = packet.chaddr;
    var log = this.log.child({ mac: mac, req_id: uuid()});
    log.info('source address="%s:%d"', peer.address, peer.port);

    // Print the whole packet in hex
    if (log.trace()) {
        for (var i = 0; i < msg.length; i += 4) {
            // XXX
            this.log.trace(sprintf('[%03d]: 0x%02x 0x%02x 0x%02x 0x%02x',
                i, msg[i], msg[i+1], msg[i+2], msg[i+3]));
        }
    }

    if (log.info()) {
        log.info(packet.toObject(), 'Request packet');
    }

    var msgType = dhcp.DHCP_MESSAGE_TYPE[packet.options[53]];
    if (msgType != 'DHCPDISCOVER' && msgType != 'DHCPREQUEST') {
        log.info('message type="%s": not responding', msgType);
        return;
    }

    /*
     * Our dhcpagent does not send class ID when booting a zone with DHCP. For
     * mock-cloud at least we want to be able to boot a zone with DHCP on the
     * admin network. To allow non-GZ clients we've added the
     * allowMissingClassID config option which defaults to false but can be set
     * true. This option can be removed if OS-2276 is implemented.
     */
    if (!self.config.allowMissingClassID) {
        /*
         * We only want to boot PXE clients and compute nodes.  We will ignore
         * anything else.  Every valid PXE client has the same class ID, and our
         * own DHCP client has a single well-known one.
         */
        if (!packet.options[60]) {
            log.info('request is missing class identifier: not responding');
            return;
        }

        var classId = new Buffer(packet.options[60]).toString();
        if (classId.substring(0, 9) !== 'PXEClient' &&
            classId.substring(0, 4) !== 'SUNW') {
            log.info('request from unexpected class "%s": not responding',
                classId);
            return;
        }
    } else {
        log.info('allowMissingClassID set, continuing without class '
            + 'identifier');
    }

    mod_boot_files.writeAll({
        cnapi: self.cnapi,
        config: self.config,
        log: log,
        mac: mac,
        napi: self.napi
    }, function _afterParams(pErr, params) {
        if (pErr) {
            log.error(pErr, 'error writing param files');
            return;
        }

        var packetOpts = self.buildPacketOpts(packet, params.bootParams, log);
        self.sendReply(packet, packetOpts, log, function (sendErr) {
            if (sendErr) {
                log.error(sendErr, 'Error sending reply');
                return;
            }

            log.info('Reply sent');
        });
    });
};


/*
 * Sends the DHCP reply
 */
DHCPD.prototype.sendReply = function (packet, packetOpts, log, callback) {
    var mac = packet.chaddr;
    var port = 68;
    var broadcastAddr = '255.255.255.255';

    var outPacket = dhcp.createReplyPacket(packet, packetOpts);
    var outBuf = outPacket.toBuffer();
    if (log.debug()) {
        log.debug(outPacket.toObject(), 'Packet options');
    }

    log.info('Sending broadcast ("%s:%d") reply to MAC "%s"',
        broadcastAddr, port, mac);

    this.sock.send(outBuf, 0, outBuf.length, port, broadcastAddr,
        function (err, bytes) {
        if (err) {
            log.error(err, 'Error sending reply to "%s"', mac);
        } else {
            log.info('Sent reply to "%s" (%d bytes)', mac, bytes);
        }

        return callback(err);
    });
};


/*
 * Builds the DHCP options
 */
DHCPD.prototype.buildPacketOpts = function (packet, params, log) {
    var msgType = dhcp.DHCP_MESSAGE_TYPE[packet.options[53]];
    var responseType = msgType == 'DHCPDISCOVER' ? 'DHCPOFFER' : 'DHCPACK';
    var mac = packet.chaddr;
    var resolvers = [];

    var packetOpts = {
        'siaddr': this.config.serverIp,
        'yiaddr': params.ip,
        'file': this.config.chainloadGrub ? 'pxegrub' : 'undionly.kpxe',
        'options': {
            '1': params.netmask || this.config.netmask,
            '51': this.config.leaseTime,
            '53': responseType,
            '54': this.config.serverIp
        }
    };

    if (this.config.defaultGateway) {
        packetOpts['options']['3'] = this.config.defaultGateway;
    }

    if (packet.options[77]) {
        var userClass = new Buffer(packet.options[77]).toString();
        if (userClass === 'gPXE' || userClass === 'iPXE') {
            packetOpts.file = 'boot.gpxe.01' +
                mac.split(':').join('').toUpperCase();
            log.info('Detected iPXE/gPXE, setting file to "%s"',
                    packetOpts.file);
        } else {
            log.warn('Unknown user-class: "%s", ignoring', userClass);
        }
    }

    if (params.resolvers && params.resolvers.length) {
        resolvers = params.resolvers;
    }

    if (this.config.resolvers) {
        resolvers = resolvers.concat(this.config.resolvers);
    }

    if (resolvers.length !== 0) {
        packetOpts.options['6'] = resolvers;
    }

    log.info({ packetOpts: packetOpts },
        'built packet opts: message type="%s", response type="%s"',
        msgType, responseType);

    return packetOpts;
};



// --- Exports



/**
 * Creates the dhcpd server
 */
function createServer(opts) {
    assert.object(opts, 'opts');
    assert.optionalObject(opts.config, 'opts.config');
    assert.optionalString(opts.configFile, 'opts.configFile');
    assert.object(opts.log, 'opts.log');

    var config;
    var log = opts.log;

    if (opts.config) {
        config = opts.config;

    } else {
        assert.string(opts.configFile, 'opts.configFile');
        log.info('Loading config from "%s"', opts.configFile);
        config = JSON.parse(fs.readFileSync(opts.configFile, 'utf-8'));
    }

    var requiredStrings = [ 'adminUuid', 'listenIp', 'tftpRoot',
        'defaultGateway', 'serverIp', 'netmask'];

    for (var r in requiredStrings) {
        var req = requiredStrings[r];
        assert.string(config[req], 'config.' + req);
    }

    assert.number(config.leaseTime, 'config.leaseTime');
    assert.number(config.port, 'config.port');

    assert.optionalArrayOfString(config.resolvers);
    assert.optionalBool(config.disableBootTimeFiles,
        'config.disableBootTimeFiles');
    assert.optionalBool(config.disableHash, 'config.disableHash');
    assert.optionalBool(config.ipxeHTTP, 'config.ipxeHTTP');
    assert.optionalBool(config.chainloadGrub, 'config.chainloadGrub');

    log.info({ config: config }, 'server config loaded');
    return new DHCPD({
        log: log,
        config: config
    });
}



module.exports = {
    createServer: createServer
};
