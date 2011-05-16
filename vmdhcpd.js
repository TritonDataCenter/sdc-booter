#!/usr/bin/env node
/*
 * Copyright (c) 2011 Joyent Inc., All rights reserved.
 *
 */

var sys = require('sys'),
    net  = require('net'),
    dgram = require('dgram'),
    pcap = require("pcap"),
    dhcp = require('./dhcp'),
    config = require('./config').config,
    act = require('./action'),
    slog = require('sys').log;

var DEBUG       = true; // TODO: move to cmdline/env var
var LEASE_TIME  = config.leaseTime;
var SERVER_PORT = 67;
var SOCK        = '/tmp/vmadmd.sock';

var LISTENERS = {};

//XXX: on startup, validate that we have all of the options in config.js!!!

var filter = 'udp dst port 67 and ip broadcast';


function checkVMopts(payload) {
    var pre = "vmadm payload did not contain the key: ";
    if (!payload.hasOwnProperty('results')) {
        return pre + 'results';
    }
    var keys = ['ip', 'gateway', 'netmask'];
    for (var i in keys) {
        var key = keys[i];
        if (!payload.results.hasOwnProperty(key)) {
          return pre + key;
        }
    }
    return;
}

function handlePacket(data, sock, host) {
    var in_packet = dhcp.DHCPPacket.parse(data);
    var pre = "[" + in_packet.chaddr + "] ";
    in_packet.dump(function (msg) {
      slog(pre + msg);
    });

    act.sendAction('net', { "mac": in_packet.chaddr }, SOCK,
        function(err, result) {
        if (err) {
          slog(pre + msg);
          return;
        }

        slog(pre + "vmadmd returned:" + sys.inspect(result));
        var checkRes = checkVMopts(result);
        if (checkRes != null) {
            slog(pre + checkRes + '.  Not responding to DHCP request.');
            return;
        }

        var packet_opts = {
              'siaddr': host
            , 'yiaddr': result.results.ip
            , 'options':
              { '1': result.results.netmask
              , '3': result.results.gateway
              // XXX: get this from somewhere?
              , '6': '8.8.8.8.'
              // XXX: anything else, eg: hostname?
              , '54': host
              }
          };
        slog(pre + "packet opts:" + sys.inspect(packet_opts));

        // decide what to do based on message type (option 53)
        switch (dhcp.DHCP_MESSAGE_TYPE[in_packet.options[53]]) {
            case 'DHCPDISCOVER':
                slog(pre + "< DHCPDISCOVER");
                packet_opts['options']['53'] = 'DHCPOFFER';
                slog(pre + "> DHCPOFFER");
                break;
            case 'DHCPREQUEST':
                slog(pre + "< DHCPREQUEST");
                packet_opts['options']['53'] = 'DHCPACK';
                packet_opts['options']['51'] = LEASE_TIME;
                slog(pre + "> DHCPACK");
                break;
            default:
                slog(pre + "< Unhandled DHCP message [" + in_packet.options[53] +
                    "]: " + dhcp.DHCP_MESSAGE_TYPE[in_packet.options[53]]);
                return;
                break;
        }

        out_packet = dhcp.DHCPPacket.build_reply(in_packet, packet_opts);
        var out = out_packet.raw();

        res = sock.send(out, 0, out.length, 68, '255.255.255.255', function (err, bytes) {
            if (err) throw err;
            slog(pre + "Wrote " + bytes + " bytes to socket.");
        });

        out_packet.dump(function (msg) {
            slog(pre + msg);
        });
    });
}


function startListening(host, iface, callback) {
  // XXX: is there a way to map between interface / ip in node?
  var sock = dgram.createSocket('udp4');
  sock.on('listening', function() {
      sock.setTTL(128);
      sock.setBroadcast(true);
      slog('Listening on '+ host + ':' + SERVER_PORT);
  });

  try {
    sock.bind(SERVER_PORT, host);
  } catch(err) {
    return callback(err);
  }

  try {
    var pcap_session = pcap.createSession(iface, filter);
  } catch(err) {
    return callback(err);
  }
  slog("Started PCAP session, interface='" + iface + "', lib='" + pcap.lib_version +"', filter='" + filter +"'");

  pcap_session.on('packet', function (raw_packet) {
      slog('pcap: packet received on ' + iface);
      var packet = pcap.decode.packet(raw_packet);
      if (0) {
        slog("Packet: " + pcap.print.packet(packet));
      }

      var data = packet.link.ip.udp.data;
      if (data) {
        slog("UDP packet received: " + sys.inspect(packet.link.ip.udp));
        handlePacket(data, sock, host);
      } else {
        slog('WARNING: UDP packet received but no data: ' + pcap.print.packet(packet));
      }
  });

  LISTENERS[iface] = {
    'socket': sock,
    'pcap': pcap_session,
    'ip': host,
  };

  callback(null, "Listening on interface '" + iface + "', ip '" + host + "'");
}

// XXX: Shamelessly stolen from vmadmd!
function startDaemon()
{
    if (DEBUG) {
        slog('==> startDaemon()');
    }
    if (!LEASE_TIME) {
        throw('ERROR: must specify lease time in config.js!');
    }

    net.createServer(function (stream) {
        var chunks, buffer = '';
        stream.setEncoding('utf8');
        stream.on('connect', function () {
            slog('==> connection on fd', stream.fd);
        });
        stream.on('data', function (chunk) {
            var request;
            /*
             * command messages are sent as JSON\n\n, we split then keep the
             * last chunk in the array in the buffer for next time.
             */

            function responder(err, results, update)
            {
                var res = {};
                if (request.hasOwnProperty('id')) {
                    res.id = request.id;
                }
                if (err) {
                    res.errors = err;
                } else {
                    if (update) {
                        res.update = update;
                    }
                    if (results) {
                        res.results = results;
                    }
                }
                stream.write(JSON.stringify(res) + '\n');
            }

            buffer += chunk.toString();
            chunks = buffer.split('\n\n');
            while (chunks.length > 1) {
                try {
                    request = JSON.parse(chunks.shift());
                } catch (err) {
                    slog('FAIL: Unable to parse input:', err);
                    stream.write(JSON.stringify({'errors': 'Invalid Input'}) +
                    '\n');
                    continue;
                }
                handleMessage(request, responder);
            }
            buffer = chunks.pop();
        });
        stream.on('end', function () {
            stream.end();
        });
    }).listen('/tmp/vmdhcpd.sock');
}

function handleMessage(obj, callback)
{
    var result = {};

    slog('==> handleMessage(', obj, ')');

    switch (obj.action) {
    case 'listen':
        var iface = obj.payload['interface'];
        var ip = obj.payload['ip'];
        if (!iface) {
          return callback("Must specify interface");
        } else if (!ip) {
          callback("Must specify ip");
        } else if (!net.isIPv4(ip)) {
          callback("IP '" + ip + "' is an invalid IPv4 address");
        } else {
          startListening(ip, iface, callback);
        }
        break;
    default:
        callback('Unknown Command');
        break;
    }
}

startDaemon();

