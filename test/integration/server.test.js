/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2020 Joyent, Inc.
 */

/*
 * DHCP Server tests
 */

const bunyan = require('bunyan');
const client = require('dhcp').createClient;
const tape = require('tape');

const AdminPoolCache = require('../../lib/admin-pool-cache');
const server = require('../../lib/dhcpd').createServer;
const config = require('../config.coal.json');

var CLIENT;
var SERVER;
const log = bunyan.createLogger({
    name: 'sdc-booter-test',
    level: 'warn',
    stream: process.stderr
});

tape.test('DHCP Server test', function (suite) {
    suite.test('setup', function (t) {
        CLIENT = client({mac: '10:dd:b1:a2:57:bf'});
        const napi = require('../../lib/clients').createNAPIclient(config);
        SERVER = server({
            log: log,
            config: config,
            napi: napi,
            adminPoolCache: AdminPoolCache.create({
                napi: napi,
                log: log,
                cacheDir: config.poolCache.dir,
                cacheUpdateIntervalSeconds:
                    config.poolCache.updateIntervalSeconds
            })
        });
        SERVER.start();
        t.end();
    });

    suite.test('dhcp server', function (t) {
        CLIENT.on('message', function (data) {
            t.ok(data, 'message data');
            t.ok(data.yiaddr, 'message yiaddr');
            t.ok(data.siaddr, 'message siaddr');
            t.ok(data.options, 'message options');
        });

        CLIENT.on('error', function (err, _data) {
            t.ifError(err, 'err');
        });

        CLIENT.on('listening', function (_sock) {
            CLIENT.sendDiscover();
        });

        CLIENT.on('bound', function (state) {
            t.ok(state.address, 'IPv4 address');
            // console.log('State: ', state);
            t.end();
        });

        CLIENT.listen();
    });

    suite.test('teardown', function (t) {
        CLIENT.close();
        SERVER.sock.close();
        SERVER = null;
        t.end();
    });

    suite.end();
});
