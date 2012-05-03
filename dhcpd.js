#!/usr/bin/env node
/*
 * Copyright (c) 2011 Joyent Inc., All rights reserved.
 *
 * Simple DHCP server daemon.
 *
 */

var dgram = require('dgram'),
     slog = require('sys').log,
       fs = require('fs'),
     dhcp = require('./lib/dhcp'),
  menulst = require('./lib/menulst'),
     MAPI = require('sdc-clients').MAPI,
  sprintf = require('./lib/sprintf'),
   config = require('./config').config;

var lookupBootParams = require('./lib/mapi').lookupBootParams;

var SERVER_HOST = config.listenIp;
var DHCP_HOST   = config.dhcpIp;
var DEFAULT_GW  = config.defaultGateway || "";
var SERVER_PORT = 67;
var TFTPROOT    = config.tftpRoot;
var LEASE_TIME  = config.leaseTime;
var NETMASK     = config.netmask;

var sessions = {};
var sock = null;
var mapi = new MAPI({
	url: config.mapiUrl,
	username: config.user,
	password: config.password
});

function build_packet_opts(key, msg_type) {
    var response_type = msg_type == 'DHCPDISCOVER' ? 'DHCPOFFER' : 'DHCPACK';

    slog(key + "< " + msg_type);

    var packet_opts = {
        'siaddr': DHCP_HOST
      , 'file': 'pxegrub'
      , 'options':
        { '1': NETMASK
        , '51': LEASE_TIME
        , '53': response_type
        , '54': DHCP_HOST
        }
    };
    if (DEFAULT_GW != "") {
        packet_opts['options']['3']=DEFAULT_GW;
    }

    slog(key + "> " + response_type);
    return packet_opts;
}

sock = dgram.createSocket("udp4", function (msg, peer) {
    var in_packet = dhcp.DHCPPacket.parse(msg);
    var key = "[" + in_packet.chaddr + "] ";
    var user_class;
    slog(key + "src_address=" + peer.address + ":" + peer.port);

    // Print the whole packet in hex
    if (0) {
        for(var i=0; i<msg.length; i+=4) {
            slog(sprintf.sprintf("[%03d]: 0x%02x 0x%02x 0x%02x 0x%02x", i, msg[i], msg[i+1], msg[i+2], msg[i+3]));
        }
    }

    in_packet.dump(function (msg) {
      slog(key + msg);
    });

    // decide what to do based on message type (option 53)
    var msg_type = dhcp.DHCP_MESSAGE_TYPE[in_packet.options[53]];
    switch (msg_type) {
        case 'DHCPDISCOVER':
        case 'DHCPREQUEST':
            packet_opts = build_packet_opts(key, msg_type);
            if (in_packet.options[77]) {
                user_class = new Buffer(in_packet.options[77]).toString();
                if (user_class === 'gPXE') {
                    packet_opts.file = 'boot.gpxe.01' +
                      in_packet.chaddr.split(':').join('').toUpperCase();
                    slog('Detected gPXE, setting file to "' +
                      packet_opts.file + '"');
                } else {
                    slog('Unknown user-class: "' + user_class + '", ignoring');
                }
            }
            break;
        default:
            slog(key + "< " + msg_type + ": not responding");
            return;
            break;
    }

    lookupBootParams(mapi, key, in_packet.chaddr, peer.address, function(params) {
      if (params == null) {
        slog(key + "No config returned from MAPI. Not sending reply");
        return;
      }

      menulst.writeMenuLst(in_packet.chaddr, params, TFTPROOT, function(err) {
        if (err) {
          slog(key + "Error writing menu.lst. Not sending reply");
          return;
        }

        packet_opts['yiaddr'] = params.ip;
        packet_opts.options['1'] = params.netmask;
        if (params.resolvers && params.resolvers.length) {
          packet_opts.options['6'] = params.resolvers;
        }

        out_packet = dhcp.DHCPPacket.build_reply(in_packet, packet_opts);
        var out = out_packet.raw();
        res = sock.send(out, 0, out.length, 68, '255.255.255.255', function (err, bytes) {
            if (err) throw err;
            slog(key + "Wrote " + bytes + " bytes to socket.");
        });

        out_packet.dump(function (msg) {
            slog(key + msg);
        });

      });
    });
});

sock.on('listening', function() {
    sock.setTTL(128);  // XXX Doesn't work! :( Bug in node?
    sock.setBroadcast(true);
    slog('Bound to '+ SERVER_HOST + ':' + SERVER_PORT);
});
sock.bind(SERVER_PORT, SERVER_HOST);

