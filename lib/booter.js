/*
 * Copyright (c) 2012 Joyent Inc., All rights reserved.
 *
 * Simple command-line client for booter's API interactions
 *
 */

var fs = require('fs');
var path = require('path');

var bunyan = require('bunyan');

var bootparams = require('./bootparams');
var menu = require('./menulst');



/*
 * Main entry point
 */
function main() {
  var config;
  try {
    var configFile = path.normalize(__dirname + '/../config.json');
    config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
  } catch(err) {
    console.error("Error reading config file '%s': %s", configFile, err.message);
    process.exit(1);
  }

  var napi = bootparams.createNAPIclient(config);
  var cnapi = bootparams.createCNAPIclient(config);
  var log = bunyan.createLogger({
      name: 'booter',
      level: 'error',
      //level: 'info',
      //level: 'debug',
      serializers: {
          err: bunyan.stdSerializers.err,
          req: bunyan.stdSerializers.req,
      }
  });

  switch (process.argv[2]) {
  case 'ping-napi':
    napi.ping(standardHandler);
    break;
  case 'get-nic':
    var mac = getArg("MAC address");
    napi.getNic(mac, standardHandler);
    break;
  case 'bootparams':
    var mac = getArg("MAC address");
    bootparams.getBootParams(mac, napi, cnapi, log, standardHandler);
    break;
  case 'bootparams-cnapi':
    var uuid = getArg("CN UUID (or default)");
    cnapi.getBootParams(uuid, standardHandler);
    break;
  case 'menu-lst':
    var mac = getArg("MAC address");
    bootparams.getBootParams(mac, napi, cnapi, log, function(err, res) {
      if (err) {
        return console.error(err.code + ': ' + err.message);
      }
      return console.log(menu.buildMenuLst(mac, res));
    });
    break;
  case 'boot-gpxe':
    var mac = getArg("MAC address");
    bootparams.getBootParams(mac, napi, cnapi, log, function(err, res) {
      if (err) {
        return console.error(err.code + ': ' + err.message);
      }
      return console.log(menu.buildGpxeCfg(mac, res));
    });
    break;
  default:
    usage();
    break;
  }
}


/*
 * Gets the named argument
 */
function getArg(name) {
  var arg = process.argv[3];
  if (!arg) {
    exit("%s required!", name);
  }
  return arg;
}


/*
 * Exits with a message.
 */
function exit() {
  console.error.apply(null, Array.prototype.slice.apply(arguments));
  process.exit(1);
}


/*
 * Prints usage
 */
function usage() {
  console.log('Usage: ' + path.basename(process.argv[1]).replace('.js', '') +
      ' <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('');
  console.log('bootparams <MAC address>');
  console.log('bootparams-cnapi <CN UUID | default>');
  console.log('boot-gpxe <MAC address>');
  console.log('get-nic <MAC address>');
  console.log('menu-lst <MAC address>');
  console.log('ping-napi');
  console.log('');
  console.log('lastlog');
  console.log('log');
  console.log('tail');
}


/*
 * Generic handler for callbacks: prints out an error if there is one,
 * stringifies the JSON otherwise.
 */
function standardHandler(err, res) {
  if (err) {
    return console.error(err.code + ': ' + err.message);
  }
  return console.log(JSON.stringify(res, null, 2));
}


main();
