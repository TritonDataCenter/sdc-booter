/*
 * Copyright (c) 2013 Joyent Inc., All rights reserved.
 *
 * DHCP server daemon: uses networking information and boot parameters from
 * SDC APIs to create DHCP replies suitable for booting SDC Compute Nodes.
 *
 */

var assert = require('assert');
var bootparams = require('./bootparams');
var fs = require('fs');
var dgram = require('dgram');
var dhcp = require('./dhcp');
var menulst = require('./menulst');
var sprintf = require('sprintf').sprintf;
var util = require('util');
var uuid = require('node-uuid');
var vasync = require('vasync');



// --- DHCPD object and methods



/**
 * DHCPD constructor
 */
function DHCPD(opts) {
    var self = this;
    this.log = opts.log;
    this.config = opts.config;

    this.sock = dgram.createSocket('udp4', function (msg, peer) {
        self.handleMessage(msg, peer);
    });

    this.napi = bootparams.createNAPIclient(this.config);
    this.cnapi = bootparams.createCNAPIclient(this.config);
}


/**
 * Starts the server
 */
DHCPD.prototype.start = function () {
    var self = this;
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
    var packet = dhcp.DHCPPacket.parse(msg);
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
        log.info(packet.dump(), 'Request packet');
    }

    var msgType = dhcp.DHCP_MESSAGE_TYPE[packet.options[53]];
    if (msgType != 'DHCPDISCOVER' && msgType != 'DHCPREQUEST') {
        log.info('message type="%s": not responding', msgType);
        return;
    }

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
        log.info('request from unexpected class "%s": not responding', classId);
        return;
    }

    var packetOpts;
    var params;

    vasync.pipeline({
    'funcs': [
        // Get the boot params from NAPI / CNAPI
        function _params(arg, cb) {
            bootparams.getBootParams({
                cacheDir: util.format('%s/cache', self.config.tftpRoot),
                adminUuid: self.config.adminUuid,
                mac: mac,
                napi: self.napi,
                cnapi: self.cnapi,
                log: log
            }, function (err, res) {
                    if (err) {
                        return cb(err);
                    }
                    params = res;
                    return cb(null);
            });
        },

        // Write out the menu.lst
        function _menulst(arg, cb) {
            packetOpts = self.buildResponse(packet, log);
            menulst.writeMenuLst(
                mac, params, self.config.tftpRoot, log,
                function (err) {
                    if (err) {
                        return cb(err);
                    }

                    return cb(null);
                });
        },

        // Send back the reply
        function _reply(arg, cb) {
            self.sendReply(packet, packetOpts, params, log, cb);
        }

    ] }, function (err, res) {
        if (err) {
            log.error(err, 'Error while processing boot params');
        } else {
            log.info('Reply sent');
        }
    });
};


/*
 * Sends the DHCP reply
 */
DHCPD.prototype.sendReply = function (packet, packetOpts, params, log,
    callback) {
    var mac = packet.chaddr;
    var port = 68;
    var broadcastAddr = '255.255.255.255';

    packetOpts['yiaddr'] = params.ip;
    packetOpts.options['1'] = params.netmask;
    if (params.resolvers && params.resolvers.length) {
        packetOpts.options['6'] = params.resolvers;
    }

    var outPacket = dhcp.DHCPPacket.build_reply(packet, packetOpts);
    var outRaw = outPacket.raw();
    if (log.debug()) {
        log.debug(outPacket.dump(), 'Packet options');
    }

    log.info('Sending broadcast ("%s:%d") reply to MAC "%s"',
            broadcastAddr, port, mac);

    this.sock.send(outRaw, 0, outRaw.length, port, broadcastAddr,
        function (err, bytes) {
        if (err) {
            log.error(err, 'Error sending reply to "%s"', mac);
            return callback(err);
        } else {
            log.info('Sent reply to "%s" (%d bytes)', mac, bytes);
            return callback(null);
        }
    });
};


/*
 * Builds the DHCP response options
 */
DHCPD.prototype.buildResponse = function (packet, log) {
    var msgType = dhcp.DHCP_MESSAGE_TYPE[packet.options[53]];
    var responseType = msgType == 'DHCPDISCOVER' ? 'DHCPOFFER' : 'DHCPACK';
    var mac = packet.chaddr;

    var packetOpts = {
        'siaddr': this.config.serverIp,
        'file': 'pxegrub',
        'options': {
            '1': this.config.netmask,
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

    log.info('message type="%s", response type="%s"',
        msgType, responseType);

    return packetOpts;
};



// --- Exports



/**
 * Creates the dhcpd server
 */
function createServer(opts) {
    assert.ok(opts, 'Must supply options');
    assert.ok(opts.hasOwnProperty('log'), 'Must supply logger');
    assert.ok(opts.hasOwnProperty('configFile'), 'Must supply configFile');

    var log = opts.log;
    log.info('Loading config from "%s"', opts.configFile);
    var config = JSON.parse(fs.readFileSync(opts.configFile, 'utf-8'));

    var required = ['listenIp', 'tftpRoot', 'defaultGateway', 'serverIp',
        'leaseTime', 'netmask', 'port'];
    for (var r in required) {
        var req = required[r];
        assert.ok(config.hasOwnProperty(req),
            'config: "' + req + '" value required');
    }

    return new DHCPD({
        log: log,
        config: config
    });
}



module.exports = {
    createServer: createServer
};
