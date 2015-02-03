/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * test code for dealing the the dhcpd server
 */

var assert = require('assert-plus');
var mod_dhcpd;
var mod_log = require('./log');



// --- Globals



var ADMIN_UUID = '930896af-bf8c-48d4-885c-6573a94b1853';
var SERVER;



function createServer() {
    if (SERVER) {
        return;
    }

    if (!mod_dhcpd) {
        mod_dhcpd = require('../../lib/dhcpd');
    }

    SERVER = mod_dhcpd.createServer({
        config: serverConfig(),
        log: mod_log.child({ component: 'test-server' })
    });
}


function bootData(opts, callback) {
    assert.object(opts, 'opts');
    assert.string(opts.mac, 'opts.mac');
    createServer();

    SERVER.cnapi = opts.cnapi;
    SERVER.napi = opts.napi;
    opts.log = mod_log.child({ mac: opts.mac });

    SERVER.bootData(opts, callback);
}


function serverConfig() {
    return {
        adminUuid: ADMIN_UUID,
        cnapi: {
            url: 'http://fake-cnapi.coal.joyent.us'
        },
        defaultGateway: '10.99.99.7',
        leaseTime: 2592000,
        listenIp: '0.0.0.0',
        napi: {
            url: 'http://fake-napi.coal.joyent.us'
        },
        netmask: '255.255.255.0',
        port: 10067,
        resolvers: [],
        serverIp: '10.99.99.9',
        tftpRoot: '/tmp/tftpRoot'
    };
}



module.exports = {
    adminUuid: ADMIN_UUID,
    config: serverConfig,
    bootData: bootData
};
