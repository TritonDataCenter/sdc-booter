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


// Validate options returned from vmadmd
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


// Handle a DHCP request: query vmadmd for networking information for the
// MAC address making the request.  If vmadmd knows about that MAC, send
// a DHCP reply with info from vmadmd.  If not, send nothing.
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


// Starts listening on the given interface. This starts a pcap session
// listening for DHCP requests, and a socket for replying to those
// requests
function startListening(iface, callback) {
  try {
    var pcap_session = pcap.createSession(iface, FILTER);
  } catch(err) {
    log("ERROR: Could not start PCAP session on interface='" + iface + "', lib='" +
        pcap.lib_version + "', filter='" + FILTER + "': " + sys.inspect(err));
    return callback(err);
  }
  log("Started PCAP session on interface='" + iface + "', lib='" +
      pcap.lib_version + "', filter='" + FILTER + "'");

  var devs = pcap_session.findalldevs();
  var addr = null;

  for (var i in devs) {
    if (devs[i].name == iface) {
      addr = devs[i].addresses[0].addr;
      break;
    }
  }

  if (!addr) {
      var str = "Could not find address for interface '" + iface + "'";
      log("Error: " + str + ": devices:" + sys.inspect(devs));
      return callback(str);
  }

  var sock = dgram.createSocket('udp4');
  sock.on('listening', function() {
      sock.setTTL(128);
      sock.setBroadcast(true);
      log('Listening on '+ addr + ':' + SERVER_PORT);
  });

  try {
    sock.bind(SERVER_PORT, addr);
  } catch(err) {
    log("Error binding socket '" + addr + ":" + SERVER_PORT + "': " + sys.inspect(err));
    return callback(err);
  }


  pcap_session.on('packet', function (raw_packet) {
      log('pcap: packet received on ' + iface);
      var packet = pcap.decode.packet(raw_packet);
      if (0) {
        log("Packet: " + pcap.print.packet(packet));
      }

      var data = packet.link.ip.udp.data;
      if (data) {
        log("UDP packet received: " + sys.inspect(packet.link.ip.udp));
        handlePacket(data, sock, addr);
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
    delete(LISTENERS[iface].pcap);
    this.close();
  });


  LISTENERS[iface] = {
    'socket': sock,
    'pcap': pcap_session,
    'ip': addr,
  };

  callback(null, "Listening on interface '" + iface + "', ip '" + addr + "'");
}


// Starts listening on the given interface. This starts a pcap session
function stopListening(iface, callback) {
    if (!LISTENERS.hasOwnProperty(iface)) {
      log("stop request for unknown interface '" + iface + "'");
      return callback("Unknown interface '" + iface + "'");
    }
    var listener = LISTENERS[iface];

    delete(LISTENERS[iface]);
    listener.socket.close();
    // The pcap session may have been removed by the empty read handler above
    // (eg: if the interface has already been unplumbed)
    if (listener.hasOwnProperty('pcap')) {
      listener.pcap.close();
    }
    return callback(null, "Stopped listening on interface '" + iface +
        "', ip '" + listener.ip + "'");
}


// Lists interfaces that are being listened on
function listInterfaces(verbose, callback) {
  var ifaces = [];
  for (var i in LISTENERS) {
    if (LISTENERS.hasOwnProperty(i)) {
      var line = [i];
      if (verbose) {
        line.push(LISTENERS[i].ip);
      }
      ifaces.push(line);
    }
  }
  return callback(null, ifaces);
}


// Starts listening on the command socket for commands from the vmdhcp
// commandline utility.
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


// Handles a message sent on the command socket
function handleMessage(obj, callback)
{
    var result = {};

    log('==> handleMessage(', obj, ')');

    switch (obj.action) {
    case 'start':
        var iface = obj.payload['interface'];
        if (!iface) {
          return callback("Must specify interface");
        } else {
          startListening(iface, callback);
        }
        break;
    case 'stop':
        var iface = obj.payload['interface'];
        if (!iface) {
          return callback("Must specify interface");
        } else {
          stopListening(iface, callback);
        }
        break;
    case 'list':
        var verbose = obj.payload['verbose'];
        listInterfaces(verbose, callback);
        break;
    default:
        callback('Unknown Command');
        break;
    }
}

startDaemon();

