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
    dateformat = require('dateformat'),
    act = require('./action');

var DEBUG       = true; // TODO: move to cmdline/env var
var SOCKET      = '/tmp/vmdhcpd.sock';
var SERVER_PORT = 67;
var SOCK        = '/tmp/vmadmd.sock';
var LISTENERS   = {};
var FILTER      = 'udp dst port 67 and ip broadcast';
var LEASE_TIME  = process.env['dhcp_lease_time'];

// dhcp_lease_time is exported in the vmdhcpd script
if (!LEASE_TIME) {
    LEASE_TIME = 6000;
}

// Sends arguments to console.log with UTC datestamp prepended.
function log()
{
    var args = [];
    var now = new Date();

    // create new array of arguments from 'arguments' object, after timestamp
    args.push(now.format('UTC:[yyyy-mm-dd HH:MM:ss.l Z]:'));
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }

    console.log.apply(this, args);
}

function checkVMopts(payload) {
    var pre = "vmadm payload did not contain the key: ";
    if (!payload.hasOwnProperty('data')) {
        return pre + 'data';
    }
    var keys = ['ip', 'gateway', 'netmask'];
    for (var i in keys) {
        var key = keys[i];
        if (!payload.data.hasOwnProperty(key)) {
          return pre + key;
        }
    }
    return;
}

function handlePacket(data, sock, host) {
    var in_packet = dhcp.DHCPPacket.parse(data);
    var pre = "[" + in_packet.chaddr + "] ";
    in_packet.dump(function (msg) {
      log(pre + msg);
    });

    act.sendAction('mac', { "mac": in_packet.chaddr }, SOCK,
        function(err, result) {
        if (err) {
          log(pre + msg);
          return;
        }

        log(pre + "vmadmd returned:" + sys.inspect(result));
        var checkRes = checkVMopts(result);
        if (checkRes != null) {
            log(pre + checkRes + '.  Not responding to DHCP request.');
            return;
        }

        var packet_opts = {
              'siaddr': host
            , 'yiaddr': result.data.ip
            , 'options':
              { '1': result.data.netmask
              , '3': result.data.gateway
              // XXX: get this from somewhere?
              , '6': '8.8.8.8.'
              // XXX: anything else, eg: hostname?
              , '54': host
              }
          };
        log(pre + "packet opts:" + sys.inspect(packet_opts));

        // decide what to do based on message type (option 53)
        switch (dhcp.DHCP_MESSAGE_TYPE[in_packet.options[53]]) {
            case 'DHCPDISCOVER':
                log(pre + "< DHCPDISCOVER");
                packet_opts['options']['53'] = 'DHCPOFFER';
                log(pre + "> DHCPOFFER");
                break;
            case 'DHCPREQUEST':
                log(pre + "< DHCPREQUEST");
                packet_opts['options']['53'] = 'DHCPACK';
                packet_opts['options']['51'] = LEASE_TIME;
                log(pre + "> DHCPACK");
                break;
            default:
                log(pre + "< Unhandled DHCP message [" + in_packet.options[53] +
                    "]: " + dhcp.DHCP_MESSAGE_TYPE[in_packet.options[53]]);
                return;
                break;
        }

        out_packet = dhcp.DHCPPacket.build_reply(in_packet, packet_opts);
        var out = out_packet.raw();

        res = sock.send(out, 0, out.length, 68, '255.255.255.255', function (err, bytes) {
            if (err) throw err;
            log(pre + "Wrote " + bytes + " bytes to socket.");
        });

        out_packet.dump(function (msg) {
            log(pre + msg);
        });
    });
}


function startListening(host, iface, callback) {
  // XXX: is there a way to map between interface / ip in node?
  var sock = dgram.createSocket('udp4');
  sock.on('listening', function() {
      sock.setTTL(128);
      sock.setBroadcast(true);
      log('Listening on '+ host + ':' + SERVER_PORT);
  });

  try {
    sock.bind(SERVER_PORT, host);
  } catch(err) {
    return callback(err);
  }

  try {
    var pcap_session = pcap.createSession(iface, FILTER);
  } catch(err) {
    return callback(err);
  }
  log("Started PCAP session, interface='" + iface + "', lib='" + pcap.lib_version +"', filter='" + FILTER +"'");

  pcap_session.on('packet', function (raw_packet) {
      log('pcap: packet received on ' + iface);
      var packet = pcap.decode.packet(raw_packet);
      if (0) {
        log("Packet: " + pcap.print.packet(packet));
      }

      var data = packet.link.ip.udp.data;
      if (data) {
        log("UDP packet received: " + sys.inspect(packet.link.ip.udp));
        handlePacket(data, sock, host);
      } else {
        log('WARNING: UDP packet received but no data: ' + pcap.print.packet(packet));
      }
  });

  // Detect an interface being unplumbed out from under us - when the interface
  // goes away, pcap will emit an empty read.  If the interface no longer shows
  // up in the device list, close the capture session.
  pcap_session.on('empty_read', function () {
    log("empty read on interface '" + iface + "'");
    var devs = this.findalldevs();

    for (var i in devs) {
      if (devs[i].address == iface) {
        log("interface '" + iface + "' still plumbed - not closing listeners");
        return;
      }
    }
    log("closing pcap session for interface '" + iface + "'");
    this.close();
    delete(LISTENERS[iface]);
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
        log('==> startDaemon()');
    }

    var socketListener  = net.createServer(function (stream) {
        var chunks, buffer = '';
        stream.setEncoding('utf8');
        stream.on('connect', function () {
            log('==> connection on fd', stream.fd);
        });
        stream.on('data', function (chunk) {
            var request;
            var string_response;

             // command messages are sent as JSON\n\n, we split then keep the
             // last chunk in the array in the buffer for next time.

            function responder(err, results, update)
            {
                var res = {};

                // if the request included an id, use the same id in responses
                if (request.hasOwnProperty('id')) {
                    res.id = request.id;
                }

                // the result will have a .type of one of the following:
                //
                //   {'failure','update','success'}
                //
                // it will also have a 'data' member with more details.
                if (err) {
                    res.type = 'failure';
                    res.data = err;
                } else {
                    if (update) {
                        res.type = 'update';
                        res.data = update;
                    } else {
                        res.type = 'success';
                        if (results) {
                            res.data = results;

                            // done with this job now.
                            if (request.hasOwnProperty('payload') &&
                                request.payload.hasOwnProperty('uuid') &&
                                VMS.hasOwnProperty(request.payload.uuid)) {

                                VMS[request.payload.uuid].action = null;
                            }
                        }
                    }
                }

                // Send the string form of the JSON to the client
                if (stream.writable) {
                    string_response = JSON.stringify(res);
                    log('SENDING:', string_response);
                    stream.write(string_response + '\n');
                }
            }

            // we need to handle messages that may be broken up into multiple
            // buffers, basically just keep reading and split results on '\n\n'
            buffer += chunk.toString();
            chunks = buffer.split('\n\n');
            while (chunks.length > 1) {
                try {
                    request = JSON.parse(chunks.shift());
                } catch (err) {
                    log('FAIL: Unable to parse input:', err);
                    if (stream.writable) {
                        string_response = JSON.stringify({'type': 'failure',
                            'data': 'Invalid Input'});
                        log('SENDING:', string_response);
                        stream.write(string_response + '\n');
                    }
                    continue;
                }
                handleMessage(request, responder);
            }
            buffer = chunks.pop();
        });
        stream.on('end', function () {
            stream.end();
        });
    });

    socketListener.on('listening', function() {
        log("==> Listening for commands on socket '" + SOCKET +"'");
        log("lease time='" + LEASE_TIME + "'");
    });
    socketListener.listen(SOCKET);
}

function handleMessage(obj, callback)
{
    var result = {};

    log('==> handleMessage(', obj, ')');

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

