/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2019, Joyent, Inc.
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
var ip6addr = require('ip6addr');
var mod_boot_files = require('./boot-files');
var mod_bootparams = require('./bootparams');
var mod_cache = require('./cache');
var mod_clients = require('./clients');
var sprintf = require('sprintf').sprintf;
var uuid = require('node-uuid');



// --- DHCPD object and methods



/**
 * DHCPD constructor
 */
function DHCPD(opts) {
    this.config = opts.config;
    this.log = opts.log;
    this.adminPoolCache = opts.adminPoolCache;

    if (opts.napi) {
        this.napi = opts.napi;
    } else {
        this.napi = mod_clients.createNAPIclient(this.config);
    }

    if (opts.cnapi) {
        this.cnapi = opts.cnapi;
    } else {
        this.cnapi = mod_clients.createCNAPIclient(this.config);
    }
    this.cacheSentinel = new mod_cache.CacheSentinel(
        {log: this.log, cnapi: this.cnapi, napi: this.napi,
         adminUuid: this.config.adminUuid, cacheConfig: this.config.cache,
         adminPoolCache: this.adminPoolCache});
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
        self.sock.setTTL(128);  // Only for unicast replies.
        self.sock.setBroadcast(true);
        self.log.info('dhcpd started on %s:%d',
            self.config.listenIp, self.config.port);
    });
    this.sock.bind(this.config.port, this.config.listenIp);
    this.cacheSentinel.start();
};


/**
 * Handles an incoming DHCP message, sending out a response if necessary.
 */
DHCPD.prototype.handleMessage = function (msg, peer) {
    var self = this;
    var packet = dhcp.parse(msg);
    var mac = packet.chaddr;
    var log = this.log.child({ mac: mac, req_id: uuid()});
    var nictag;
    log.info('source address="%s:%d"', peer.address, peer.port);

    // Print the whole packet in hex
    if (log.trace()) {
        var str_buf;
        for (var i = 0; i < msg.length; i += 4) {
            str_buf = '';
            str_buf += sprintf('[%03d]:', i);

            for (var j = 0; j < Math.min(4, msg.length - i); j++) {
                str_buf += sprintf(' 0x%02x', msg[i + j]);
            }
            this.log.trace(str_buf);
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

    /*
     * This block decodes option 82 which has multiple sub-options.  If we
     * decide to extend booter to be a full fledged, DHCP server then we should
     * create decoders for each option in dhcp.js.  But at this time, option 82
     * is the only option we support that leverages suboptions (excepting the
     * widely misused option 77).
     *
     * [<option id>, <option length>, <variable length option data>]
     */
    if (packet.options[82] && Array.isArray(packet.options[82])) {
        log.info({option_82: packet.options[82]}, 'Found DHCP Option 82, '
            + 'getting sub-options');

        var relayopt = packet.options[82].slice();
        var suboptlen;
        var suboptid;
        var subopt;
        while (relayopt.length > 0) {
            try {
                /* Shift off the suboption id. */
                suboptid = relayopt.shift();

                /* Shift off the suboption length. */
                suboptlen = relayopt.shift();

                /* get suboption payload */
                subopt = relayopt.slice(0, suboptlen);

                /* strip suboption off of relay option */
                relayopt = relayopt.slice(suboptlen);

                /* We only support sub-option 1. */
                if (suboptid !== 1) {
                    log.warn('Option 82: found unsupported sub-option (%d), '
                        + 'skipping', suboptid);

                    continue;
                }

                nictag = new Buffer(subopt).toString();
                log.info('Found circuit-id from Option 82:', nictag);
            } catch (e) {
                log.error({error: e}, 'Error parsing option 82');
                break;
            }
        }
    }

    if (nictag &&
        nictag.toUpperCase().search(/^ADMIN_RACK_[A-Z0-9_-]+$/) !== 0) {

        nictag = 'admin_rack_' + nictag;
        log.info('Prepending "admin_rack_" to circuit-id, nictag is now:',
            nictag);
    }

    var _sendReplyWithParams = function (params) {
        var packetOpts = self.buildPacketOpts(packet, params.bootParams, log);
        self.sendReply(peer, packet, packetOpts, log, function (sendErr) {
                if (sendErr) {
                    log.error(sendErr, 'Error sending reply');
                    return;
                }

            log.info('Reply sent');
        });
    };

    /*
     * Booter handles only two types of DHCP messages: DHCPDISCOVER and
     * DHCPREQUEST (coming in that order).  On the initial DHCPDISCOVER,
     * external services (e.g. napi & cnapi) are consulted and boot files
     * written out.  On the followup DHCPREQUEST, the local cache is used
     * instead of consulting external servies.
     */
    if (msgType === 'DHCPDISCOVER') {
        mod_boot_files.writeAll({
            cnapi: self.cnapi,
            config: self.config,
            log: log,
            mac: mac,
            nic_tag: nictag,
            adminPoolCache: self.adminPoolCache,
            napi: self.napi
        }, function _afterParams(pErr, params) {
            if (pErr) {
                log.error(pErr, 'error writing param files');
                return;
            }
            _sendReplyWithParams(params);
        });
    } else {
        mod_bootparams.getFromCache({
            dir: self.config.cache.dir,
            log: log,
            mac: mac
        }, function _afterCache(err, params) {
            if (err) {
                log.error(err, 'unable to get params from cache');
                return;
            }
            _sendReplyWithParams(params);
        });
    }
};


/*
 * Sends the DHCP reply
 */
DHCPD.prototype.sendReply = function (peer, packet, packetOpts, log, callback) {
    var mac = packet.chaddr;
    var port = 68;
    var addr = '255.255.255.255';
    var msg = 'broadcast';

    var outPacket = dhcp.createReplyPacket(packet, packetOpts);
    var outBuf = outPacket.toBuffer();
    if (log.debug()) {
        log.debug(outPacket.toObject(), 'Packet options');
    }

    /*
     * Per 2131 sect 4.1, we should be able to use giaddr for the destination
     * address, but in practice that field is populated with the IP on which
     * the relay received the client's DHCPDISCOVER.  So instead we just reply
     * to the peer's source address.
     */
    if (packet.options[82]) {
        msg = 'unicast';
        addr = peer.address;
        port = peer.port;
    }

    log.info('Sending %s ("%s:%d") reply to MAC "%s"', msg, addr, port, mac);
    this.sock.send(outBuf, 0, outBuf.length, port, addr, function (err, bytes) {
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
    var serverIp = this.config.serverIp;
    var userClass = 'unknown';

    var packetOpts = {
        'siaddr': this.config.serverIp,
        'yiaddr': params.ip,
        'options': {
            '1': params.netmask || this.config.netmask,
            '51': this.config.leaseTime,
            '53': responseType,
            '54': serverIp
        }
    };

    function _findRouteToBooter(routes) {
        var dests = Object.keys(routes);
        for (var d in dests) {
            var dest = dests[d];
            var cidr = ip6addr.createCIDR(dest);
            if (cidr.contains(serverIp)) {
                return routes[dest];
            }
        }

        log.error({routes: routes},
            'Could not find route to booter in network\'s routes');

        return '';
    }

    /*
     * If option 82 (circuit id) and giaddr are both set that means the CN
     * is behind a DHCP relay and we need to provide it a different gateway IP.
     * If the nic's network is configured with a gateway, then we use that one.
     * If not we assume the route is already added to the napi network and we
     * pull it out of the routes object.  Note that the relay may have set
     * giaddr to the same IP as the client's gateway.  However, RFC 2131 sect
     * 4.1 states that the giaddr should be used as the destination IP for
     * dhcpd server reply traffic, so we can't depend on that.
     */
    if (packet.options[82] && packet.giaddr) {
        var giaddr = ip6addr.parse(packet.giaddr).toString();

        packetOpts['giaddr'] = giaddr;
        packetOpts['options']['3'] = params.gateway ? params.gateway :
            _findRouteToBooter(params.routes);
        packetOpts['options']['82'] = packet.options[82];
    } else if (this.config.defaultGateway) {
        packetOpts['options']['3'] = this.config.defaultGateway;
    }

    /*
     * Decide on our boot file to return: if the user class isn't iPXE, then we
     * presume this is a BIOS PXE client.  We want the client to chain load into
     * iPXE, and we'll peek at the client arch (RFC 4578 2.1) to decide whether
     * to provide the EFI or the legacy version. (It's still possible for legacy
     * clients to get pxegrub if so configured, but it's not the default.)
     *
     * Otherwise, we're seeing either the above chain-loaded instance of iPXE,
     * or it's from the client's USB key.  In response, we can provide the real
     * iPXE boot script.
     */
    packetOpts.file = this.config.chainloadGrub ? 'pxegrub' : 'undionly.kpxe';

    if (packet.options[77]) {
        userClass = new Buffer(packet.options[77]).toString();
    }

    if (userClass === 'iPXE') {
        packetOpts.file = 'boot.ipxe.01' +
            mac.split(':').join('').toUpperCase();
    } else if (packet.options[93]) {
        /*
         * Should be a big-endian uint16_t. By the RFC, the client may
         * specify more than one, however unlikely that seems.
         */
        if (packet.options[93].length < 2) {
             log.warn({option_93: packet.options[93]}, 'malformed option');
        } else {
            var arch = (packet.options[93][0] << 8) | packet.options[93][1];

            if (dhcp.DHCP_CLIENT_ARCH_TYPE[arch] === 'EFI x86-64') {
                packetOpts.file = 'snponly.efi';
            }
        }
    }

    log.info('Client user class "%s", file set to "%s"', userClass,
        packetOpts.file);

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
    assert.object(opts.adminPoolCache, 'opts.adminPoolCache');

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
        config: config,
        adminPoolCache: opts.adminPoolCache,
        napi: opts.napi
    });
}



module.exports = {
    createServer: createServer
};
