/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Joyent, Inc.
 */

/*
 * test code for dealing the the dhcpd server
 */

var assert = require('assert-plus');
var vasync = require('vasync');
var mod_log = require('./log');
var mod_boot_files;
var mod_dhcpd;
var adminPoolCache;



// --- Globals



var ADMIN_UUID = '930896af-bf8c-48d4-885c-6573a94b1853';
var SERVER = {};



function createServer(config) {
    var log = mod_log.child({ component: 'test-server' });

    if (!mod_boot_files) {
        mod_boot_files = require('../../lib/boot-files');
    }

    if (!mod_dhcpd) {
        mod_dhcpd = require('../../lib/dhcpd');
    }

    if (!adminPoolCache) {
        adminPoolCache = require('../../lib/admin-pool-cache');
    }

    var cache = adminPoolCache.create({
        napi: config.opts.napi,
        log: log,
        cacheDir: config.poolCache.dir,
        cacheUpdateIntervalSeconds: config.poolCache.updateIntervalSeconds
    });

    var dhcp = mod_dhcpd.createServer({
        config: config,
        log: log,
        adminPoolCache: cache,
        napi: config.opts.napi,
        cnapi: config.opts.cnapi
    });

    SERVER.dhcp = dhcp;
    SERVER.cache = cache;
    SERVER.log = log;
}

function bootData(opts, callback) {
    assert.object(opts, 'opts');
    assert.string(opts.mac, 'opts.mac');

    var config = serverConfig();
    config.opts = opts;

    createServer(config);
    SERVER.cache.update(function (error) {
        if (error) {
            callback(error, null);
            return;
        }

        mod_boot_files.writeAll({
            config: config,
            cnapi: opts.cnapi,
            log: mod_log.child({ mac: opts.mac }),
            mac: opts.mac,
            napi: opts.napi,
            adminPoolCache: SERVER.cache,
            nic_tag: opts.nic_tag
        }, function (err, res) {
            callback(err, res);
        });
    });
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
        overlay: {
            enabled: true,
            defaultOverlayMTU: 1400,
            defaultUnderlayMTU: 1500,
            portolan: 'portolan.coal.joyent.us',
            overlayNicTag: 'sdc_overlay',
            underlayNicTag: 'sdc_underlay'
        },
        port: 10067,
        resolvers: [],
        serverIp: '10.99.99.9',
        tftpRoot: '/tmp/tftpRoot',
        // For testing of other server components, intervals set to a high value
        // that will not fire during a unit test run of any reasonable length.
        cache: {
            dir: '/tmp/tftpRoot/cache',
            refreshIntervalSeconds: 3000,
            purgeIntervalSeconds: 36000,
            maxCacheFileAgeSeconds: 604800,
            refreshConcurrency: 1
        },
        poolCache: {
            updateIntervalSeconds: 60,
            dir: '/tmp/tftpRoot/poolcache'
        }
    };
}



module.exports = {
    adminUuid: ADMIN_UUID,
    config: serverConfig,
    bootData: bootData
};
