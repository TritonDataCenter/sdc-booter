/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2018 Joyent, Inc.
 */

/*
 * Simple command-line client for booter's API interactions
 *
 */

var bootparams = require('./bootparams');
var bunyan = require('bunyan');
var fs = require('fs');
var menu = require('./menulst');
var mod_cache = require('./cache');
var mod_clients = require('./clients');
var path = require('path');



/*
 * Main entry point
 */
function main() {
    var config;
    try {
        var configFile = path.normalize(__dirname + '/../config.json');
        config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    } catch (err) {
        console.error('Error reading config file "%s": %s', configFile,
            err.message);
        process.exit(1);
    }

    config.agent = false;
    var napi = mod_clients.createNAPIclient(config);
    var cnapi = mod_clients.createCNAPIclient(config);
    var log = bunyan.createLogger({
        name: 'booter',
        level: 'error',
        serializers: {
            err: bunyan.stdSerializers.err,
            req: bunyan.stdSerializers.req
        }
    });

    switch (process.argv[2]) {
    case 'ping-napi':
        napi.ping(standardHandler);
        break;
    case 'get-nic':
        napi.getNic(getArg('MAC address'), standardHandler);
        break;
    case 'bootparams':
        bootparams.getBootParams({
            adminUuid: config.adminUuid,
            cacheDir: config.cache.dir,
            mac: getArg('MAC address'),
            napi: napi,
            cnapi: cnapi,
            log: log,
            pipelineTimeoutSeconds: -1
        }, standardHandler);
        break;
    case 'bootparams-cnapi':
        cnapi.getBootParams(getArg('CN UUID (or default)'), standardHandler);
        break;
    case 'menu-lst':
        bootparams.getBootParams({
            adminUuid: config.adminUuid,
            tftpRoot: config.tftpRoot,
            cacheDir: config.cache.dir,
            mac: getArg('MAC address'),
            napi: napi,
            cnapi: cnapi,
            log: log
        }, function (err, res) {
            if (err) {
                return console.error(err.code + ': ' + err.message);
            }

            return menu.buildMenuLst(res, function (lst) {
                return console.log(lst);
            });
        });
        break;
    case 'boot-gpxe':
        console.error('WARNING: boot-gpxe is deprecated; use boot-ipxe');
        /* jsl: FALLTHRU */
    case 'boot-ipxe':
        bootparams.getBootParams({
            adminUuid: config.adminUuid,
            tftpRoot: config.tftpRoot,
            cacheDir: config.cache.dir,
            mac: getArg('MAC address'),
            napi: napi,
            cnapi: cnapi,
            log: log
        }, function (err, res) {
            if (err) {
                return console.error(err.code + ': ' + err.message);
            }

            menu.buildIpxeCfg(res, function (cfg) {
                return console.log(cfg);
            });
        });
        break;
    case 'full-cache-refresh':
        var cacheSentinel = new mod_cache.CacheSentinel({
            log: log, cnapi: cnapi, napi: napi,
            adminUuid: config.adminUuid, cacheConfig: config.cache});
        cacheSentinel.refreshCache();
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
        exit('%s required!', name);
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
    console.log('boot-ipxe <MAC address>');
    console.log('full-cache-refresh');
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
