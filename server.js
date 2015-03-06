/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * Main entry-point for the booter dhcpd server
 */

var bunyan = require('bunyan');
var dhcpd = require('./lib/dhcpd');
var stdSerializers = require('sdc-bunyan-serializers');


var log = bunyan.createLogger({
    name: 'dhcpd',
    level: 'debug',
    serializers: stdSerializers.serializers
});

try {
    var server = dhcpd.createServer({
        log: log,
        configFile: __dirname + '/config.json'
    });
    server.start();
} catch (err) {
    log.error(err);
    process.exit(1);
}
