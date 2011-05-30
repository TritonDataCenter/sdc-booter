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
     dhcp = require('./dhcp'),
     Mapi = require('./mapi').Mapi,
  sprintf = require('./sprintf'),
   config = require('./config').config;

var SERVER_HOST = config.listenIp;
var DHCP_HOST   = config.dhcpIp;
var DEFAULT_GW  = config.defaultGateway || "";
var SERVER_PORT = 67;
var TFTPROOT    = config.tftpRoot;
var LEASE_TIME  = config.leaseTime;

var sessions = {};
var sock = null;
var mapi = new Mapi();

sock = dgram.createSocket("udp4", function (msg, peer) {
    var in_packet = dhcp.DHCPPacket.parse(msg);
    var key = "[" + in_packet.chaddr + "] ";
    slog(key + "address=" + peer.address + ":" + peer.port);

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
    switch (dhcp.DHCP_MESSAGE_TYPE[in_packet.options[53]]) {
        case 'DHCPDISCOVER':
            slog(key + "< DHCPDISCOVER");
            packet_opts = {
                'siaddr': DHCP_HOST
              , 'file': 'pxegrub'
              , 'options':
                { '1': '255.255.255.0'
                , '51': LEASE_TIME
                , '53': 'DHCPOFFER'
                , '54': DHCP_HOST
                //, '150': '/00-50-56-32-cd-2d/menu.lst'
                }
            };
            if (DEFAULT_GW != "") {
                packet_opts['options']['3']=DEFAULT_GW;
            }
            slog(key + "> DHCPOFFER");
            break;
        case 'DHCPREQUEST':
            slog(key + "< DHCPREQUEST");
            packet_opts = {
                'siaddr': DHCP_HOST
              , 'file': 'pxegrub'
              , 'options':
                { '1': '255.255.255.0'
                , '51': LEASE_TIME
                , '53': 'DHCPACK'
                , '54': DHCP_HOST
                //, '150': '/00-50-56-32-cd-2d/menu.lst'
              }
            };
            if (DEFAULT_GW != "") {
                packet_opts['options']['3']=DEFAULT_GW;
            }
            slog(key + "> DHCPACK");
            break;
        default:
            break;
    }

    mapi.writeMenuLst(in_packet.chaddr, TFTPROOT, function(config) {
      if (config == null) {
        slog(key + "No config returned from MAPI. Not sending reply");
        return;
      }
      packet_opts['yiaddr'] = config.ip;
      // XXX: rename to netmask
      packet_opts.options['1'] = config.subnet;

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

sock.on('listening', function() {
    sock.setTTL(128);  // XXX Doesn't work! :( Bug in node?
    sock.setBroadcast(true);
    slog('Bound to '+ SERVER_HOST + ':' + SERVER_PORT);
});
sock.bind(SERVER_PORT, SERVER_HOST);

