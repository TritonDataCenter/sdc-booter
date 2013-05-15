/*
 * Copyright (c) 2012, Joyent, Inc. All rights reserved.
 *
 * Main entry-point for the booter dhcpd server
 */

var dhcpd = require('./lib/dhcpd');

var bunyan = require('bunyan');


var log = bunyan.createLogger({
        name: 'dhcpd',
        level: 'debug',
        serializers: {
                err: bunyan.stdSerializers.err,
                req: bunyan.stdSerializers.req
        }
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
