/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Joyent, Inc.
 */

/*
 * Main entry-point for the booter dhcpd server
 */

var bunyan = require('bunyan');
var fs = require('fs');
var dhcpd = require('./lib/dhcpd');
var stdSerializers = require('sdc-bunyan-serializers');
var AdminPoolCache = require('./lib/admin-pool-cache');
var mod_clients = require('./lib/clients');



var log = bunyan.createLogger({
    name: 'dhcpd',
    level: 'debug',
    serializers: stdSerializers.serializers
});

try {
    var configFile = __dirname + '/config.json';
    var config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    var napi = mod_clients.createNAPIclient(config);

    log.info('Loaded config from "%s"', configFile);

    var poolCache = AdminPoolCache.create({
        napi: napi,
        log: log,
        cacheDir: config.poolCache.dir,
        cacheUpdateIntervalSeconds: config.poolCache.updateIntervalSeconds
    });

    var server = dhcpd.createServer({
        log: log,
        config: config,
        napi: napi,
        adminPoolCache: poolCache
    });

    /*
     * Update the pool cache before we start the dhcpd server.
     */
    poolCache.update(function (err) {
        if (err) {
            log.error('Failed initial admin pool cache update', err);
            throw err;
        } else {
            log.info('Initial cache update completed.  Starting DHCP server.');
            server.start();
        }
    });
} catch (err) {
    log.error(err);
    process.exit(1);
}
