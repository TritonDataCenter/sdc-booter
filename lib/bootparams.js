/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2020 Joyent, Inc.
 * Copyright 2024 MNX Cloud, Inc.
 */

/*
 * Gets information from NAPI and CNAPI for booting SDC compute nodes.
 */

const assert = require('assert-plus');
const jsprim = require('jsprim');
const mod_clients = require('./clients');
const mod_json = require('./json-file');
const util = require('util');
const vasync = require('vasync');
const verror = require('verror');


const fmt = util.format;

// --- Internal functions



/**
 * Return an object mapping MAC addresses to the names of their parent
 * aggregations
 */
function macsToAggrs(aggrs) {
    var macAg = {};

    aggrs.forEach(function (ag) {
        ag.macs.forEach(function (mac) {
            macAg[mac] = ag.name;
        });
    });

    return macAg;
}


/**
 * Gets the boot params for a MAC from the on-disk cache
 */
function getFromCache(opts, callback) {
    assert.object(opts, 'opts');
    assert.string(opts.dir, 'opts.dir');
    assert.object(opts.log, 'opts.log');
    assert.string(opts.mac, 'opts.mac');
    assert.optionalObject(opts.err, 'opts.err');

    var log = opts.log;
    var dir = opts.dir;
    var mac = opts.mac;
    var originalErr = opts.err;

    mod_json.read({
        dir: dir,
        name: fmt('%s.json', mac),
        log: log
    }, function (err, data) {
        if (err) {
            callback(originalErr);
            return;
        }

        log.debug(data, 'getFromCache: got cached params from "%s/%s.json"',
            dir, mac);

        callback(null, { bootParams: data });
    });
}

function poolContainsTag(pool, tag) {
    return (pool &&
        pool.hasOwnProperty('nic_tags_present') &&
        pool.nic_tags_present.indexOf(tag) !== -1);
}


// --- Exported functions



/**
 * Get enough data to boot a node on the admin network.
 */
function getBootParams(opts, callback) {
    assert.object(opts, 'opts');
    assert.string(opts.cacheDir, 'opts.cacheDir');
    assert.string(opts.adminUuid, 'opts.adminUuid');
    assert.object(opts.cnapi, 'opts.cnapi');
    assert.object(opts.log, 'opts.log');
    assert.string(opts.mac, 'opts.mac');
    assert.object(opts.napi, 'opts.napi');
    assert.optionalNumber(opts.pipelineTimeoutSeconds,
                          'opts.pipelineTimeoutSeconds');
    assert.object(opts.adminPoolCache, 'opts.adminPoolCache');
    assert.optionalObject(opts.platforms, 'opts.platforms');
    var cacheDir = opts.cacheDir;
    var adminUuid = opts.adminUuid;
    var cnapi = opts.cnapi;
    var log = opts.log;
    var mac = opts.mac;
    var napi = opts.napi;
    var adminPoolCache = opts.adminPoolCache;

    /*
     * getBootParams performs several calls to external services (e.g. napi &
     * cnapi).  If those services are too slow, iPXE on the CN will give up
     * before booter can respond, even though CacheSentinel has likely fetched
     * perfectly good recent values from those services already.  To avoid being
     * stuck in an infinite "too slow" retry loop, a timer is set which will
     * callback with the last cached values if a budget for all external calls
     * is exceeded.
     *
     * See the dhcp.h files in https://github.com/TritonDataCenter/ipxe> for
     * descriptions of relevant timeouts.  Since HEAD-2321 the longest our iPXE
     * will wait for a DHCPDISCOVER is 32 seconds.  The default timeout value
     * below is intended to give a generous pad of time between calling back
     * and getting * the reply packet to the CN before 32 seconds have elapsed.
     * "Bulk" * callers filling the cache should use -1 to disable this timer
     * and * allowing them to refresh the cache in the background even in the
     * face of * slow external services.
     */
    var pipelineTimeout;
    var pipelineTimeoutSeconds = opts.pipelineTimeoutSeconds || 28 * 1000;
    var pipelineTimedOut = false;
    if (pipelineTimeoutSeconds > 0) {
        pipelineTimeout = setTimeout(function _timeout() {
            pipelineTimedOut = true;
            var timeoutInfo = {adminUuid: adminUuid, mac: mac,
                               pipelineTimeoutSeconds: pipelineTimeoutSeconds};
            log.warn(
                timeoutInfo,
                'getBootParams timed out; calling back with cached result');
            getFromCache({
                dir: cacheDir,
                err: new verror.VError({info: timeoutInfo},
                                       'timeout during getBootParams pipeline'),
                log: log,
                mac: mac
            }, callback);
        }, pipelineTimeoutSeconds);
        pipelineTimeout.unref();
    }

    var uuid;
    var params = null;
    var vArg = {
        adminUuid: opts.adminUuid, // admin user not network
        bootNic: null,
        log: opts.log,
        napi: opts.napi,
        network_uuid: 'admin',
        adminPool: null,
        nic_tag: opts.nic_tag
    };

    if (opts.platforms) {
        vArg.platforms = opts.platforms;
    }

    vasync.pipeline({
        arg: vArg,
        funcs: [
            /*
             * Make sure we have the latest adminPoolCache data.  We use this
             * not only on initial admin nic provision (for a new CN), but also
             * for returning nics that may have changed nic tags since initial
             * provision and before the adminPoolCache has updated.
             *
             * If we encounter an error here we log it and move on, because we
             * may not even need the admin network pool info to boot this CN.
             */
            function _readAdminPoolCache(fArg, cb) {
                adminPoolCache.readCache(function (err, pool) {
                    if (err) {
                        log.error({err: err}, 'Error getting adminPoolCache');
                        cb();
                        return;
                    }

                    if (jsprim.isEmpty(pool) || !pool.nic_tags_present) {
                        cb();
                        return;
                    }

                    fArg.adminPool = pool;
                    cb();
                });
            },
            // Get nic data from NAPI for the given MAC
            function _getNic(fArg, cb) {
                napi.getNic(mac, function (err, res) {
                    if (err) {
                        if (err.statusCode === 404) {
                            log.debug('Did not find nic "%s" in NAPI', mac);
                            cb();
                            return;
                        }
                        log.error(err, 'Error getting nic "%s" from NAPI', mac);
                        cb(err);
                        return;
                    }

                    log.debug(res, 'Got nic from NAPI');
                    fArg.bootNic = res;
                    fArg.nics = [ fArg.bootNic ];
                    cb();
                });
            },

            /*
             * If the boot nic exists but doesn't have an ip, or if it doesn't
             * exist at all, check if we have specified an alternate admin
             * nictag, and if so look for it in the 'admin' network pool.  If
             * the tag exists in the 'admin' network pool, subsequent steps in
             * this chain will provision the nic and IP on a network from the
             * 'admin' network pool.
             */
            function _checkAdminPoolCache(fArg, cb) {
                if (fArg.bootNic !== null && fArg.bootNic.ip) {
                    cb();
                    return;
                }

                if (!fArg.nic_tag) {
                    fArg.nic_tag = 'admin';
                    cb();
                    return;
                }

                log.debug('bootNic was either not found in napi, or is ' +
                    'missing an IP.  Checking admin network pool for nictag.');

                if (poolContainsTag(fArg.adminPool, fArg.nic_tag)) {
                    fArg.network_uuid = fArg.adminPool.uuid;
                }

                cb();
            },

            // If the nic exists in NAPI but it doesn't have an IP, give it one
            function _provisionIP(fArg, cb) {
                if (fArg.bootNic === null || fArg.bootNic.ip) {
                    cb();
                    return;
                }

                assert(fArg.bootNic.network_uuid === undefined,
                    'network_uuid undefined');
                var putParams = {
                    network_uuid: fArg.network_uuid,
                    nic_tag: fArg.nic_tag
                };

                log.debug(putParams, 'Updating nic "%s" to add IP', mac);
                napi.updateNic(mac, putParams, function (err, res) {
                    if (err) {
                        log.error({err: err, params: putParams},
                            'Error adding IP to nic "%s" on NAPI', mac);
                        cb(err);
                        return;
                    }

                    log.debug(res, 'Updated nic "%s" with IP "%s" in NAPI',
                        mac, res.ip);
                    fArg.bootNic = res;

                    fArg.nics = [ fArg.bootNic ];
                    cb();
                });
            },

            // If the nic doesn't exist in NAPI, provision it on the admin
            // network (or pool), which will give it an IP
            function _createNic(fArg, cb) {
                if (fArg.bootNic !== null) {
                    cb();
                    return;
                }

                var postParams = {
                    owner_uuid: adminUuid,
                    belongs_to_uuid: adminUuid,
                    belongs_to_type: 'other',
                    mac: mac,
                    nic_tags_provided: [ fArg.nic_tag ],
                    nic_tag: fArg.nic_tag
                };

                log.info(postParams, 'Provisioning admin nic on network %s',
                    fArg.network_uuid);

                napi.provisionNic(fArg.network_uuid, postParams,
                    function (err, res) {
                    if (err) {
                        log.error(err,
                            'Error provisioning admin nic "%s" on NAPI', mac);
                        cb(err);
                        return;
                    }

                    log.debug(res, 'Got provisioned nic from NAPI');
                    fArg.bootNic = res;
                    fArg.nics = [ fArg.bootNic ];

                    cb();
                });
            },

            // In case we have a server not yet setup, there will be no MAC
            // associated to the server UUID, but it'll be present in server's
            // sysinfo and the mac with the colons replaced with dashes will be
            // the server hostname.
            function _getUnsetupServerUUID(fArg, cb) {
                fArg.cn_uuid = fArg.bootNic.belongs_to_uuid;
                uuid = fArg.bootNic.belongs_to_uuid;
                if (fArg.cn_uuid !== adminUuid) {
                    cb();
                    return;
                }
                const mac_dashed = mac.replace(/:/g, '-');

                cnapi.listServers({
                    hostname: mac_dashed
                }, function listServersCb(err, servers) {
                    if (err) {
                        log.error(err,
                            'Error getting servers with mac %s from CNAPI',
                            mac_dashed);
                        cb(err);
                        return;
                    }
                    if (servers.length) {
                        log.info({servers: servers}, 'Servers found');
                        fArg.cn_uuid = servers[0].uuid;
                        uuid = servers[0].uuid;
                    }
                    cb();
                });
            },
            // Get boot params from CNAPI if belongs_to_uuid is set to something
            // than the admin UUID
            function _bootParams(fArg, cb) {
                if (fArg.cn_uuid === adminUuid) {
                    uuid = 'default';
                    cb();
                    return;
                }

                cnapi.getBootParams(uuid, function (err, res) {
                    if (err) {
                        if (err.statusCode === 404) {
                            log.warn('Did not find bootparams for "%s" in '
                                + 'CNAPI: continuing anyway', uuid);
                            uuid = 'default';
                            cb();
                            return;
                        }

                        log.error(err, 'Error getting %s bootparams from CNAPI',
                            uuid);
                        cb(err);
                        return;
                    }

                    log.debug(res, 'Got bootparams from CNAPI');

                    // If CNAPI didn't know about that UUID, we will need to
                    // get the default boot params instead.
                    if (Object.keys(res).length === 0) {
                        log.warn('empty bootparams: getting default '
                            + 'bootparams instead');
                        uuid = 'default';
                        cb();
                        return;
                    }
                    params = res;
                    cb();
                });
            },

            // Get default boot params from CNAPI if the nic's belongs_to_uuid
            // is set to the admin UUID.  This means that the nic doesn't
            // belong to a server that has successfully updated NAPI with its
            // sysinfo
            function _defaultBootParams(_fArg, cb) {
                if (uuid !== 'default') {
                    cb();
                    return;
                }

                cnapi.getBootParams(uuid, function (err, res) {
                    if (err) {
                        log.error(err,
                            'Error getting default bootparams from CNAPI');
                        cb(err);
                        return;
                    }

                    log.debug(res, 'Got default bootparams from CNAPI');
                    params = res;
                    cb();
                });
            },

            // If we have a server UUID in belongs_to_uuid, get its nics
            // and aggregations from NAPI
            mod_clients.napiGetNics,
            mod_clients.napiGetAggrs,
            mod_clients.napiGetNicTags,

            function _getPlatforms(fArg, cb) {
                cnapi.listPlatforms({
                    os: true
                }, function onList(err, platforms) {
                    if (err) {
                        log.error(err,
                            'Error getting plaforms from CNAPI');
                        cb(err);
                        return;
                    }
                    fArg.platforms = platforms;
                    cb();
                });
            }
        ]
    }, function (err, res) {
        if (pipelineTimedOut) {
            log.warn('getBootParams pipeline timed out; pipeline cb no-op');
            return;
        }
        if (pipelineTimeout) {
            clearTimeout(pipelineTimeout);
        }

        if (err) {
            getFromCache({
                dir: cacheDir,
                err: err,
                log: log,
                mac: mac
            }, callback);
            return;
        }

        if (!vArg.bootNic.ip || !vArg.bootNic.netmask) {
            var nicErr = new Error('Error: boot nic has no IP or netmask');
            log.error({ err: nicErr, nic: vArg.bootNic },
                'Error with boot nic from NAPI');
            callback(nicErr);
            return;
        }

        var adminNic = vArg.bootNic;
        var adminPool = vArg.adminPool;
        var aggrs = vArg.aggrs;
        var bootNic = vArg.bootNic;
        var macAggrs = macsToAggrs(vArg.aggrs);
        var nics = vArg.nics;
        var overridden = {};
        var seen = {};
        var adminFound = false;
        var tag;

        params.ip = bootNic.ip;
        params.netmask = bootNic.netmask;
        params.resolvers = bootNic.resolvers;

        if (bootNic.gateway) {
            params.gateway = bootNic.gateway;
        }

        if (bootNic.routes) {
            params.routes = bootNic.routes;
        }

        // Allow kernel_args from CNAPI to override the nic tag values, but
        // dutifully complain about it
        if (params.kernel_args.hasOwnProperty('admin_nic')) {
            overridden['admin_nic'] = 1;
        }

        // Order of precedence for setting the foo_nic parameters:
        // 1) kernel_args from CNAPI: this means the operator explicitly
        //    wants to set a nic tag
        // 2) nic_tags_provided property on aggregations
        // 3) nic_tags_provided property on nics

        for (var n in nics) {
            var nic = nics[n];
            if (!nic.hasOwnProperty('mac') ||
                    !nic.hasOwnProperty('nic_tags_provided')) {
                continue;
            }

            var newMAC = nic.mac;
            if (seen.hasOwnProperty(newMAC)) {
                continue;
            }

            for (var tg in nic.nic_tags_provided) {
                var nictag = nic.nic_tags_provided[tg];
                tag = nictag + '_nic';

                if (params.kernel_args.hasOwnProperty(tag)) {
                    overridden[tag] = 1;
                } else {
                    if (!macAggrs.hasOwnProperty(newMAC)) {
                        params.kernel_args[tag] = newMAC;
                    }
                }

                /*
                 * Check for the nic tagged with 'admin' or any nic tagged with
                 * a network that is in the admin network pool.  We do the same
                 * below for aggrs.
                 */
                if (tag === 'admin_nic' ||
                    poolContainsTag(adminPool, nictag)) {
                        if (adminFound) {
                            log.warn({orig_admin: adminNic, new_admin: nic},
                                'second admin nic found');
                        }
                        adminNic = nic;
                        adminFound = true;
                }
            }

            seen[newMAC] = 1;
        }

        // Now go through and assign nic tags to aggregations
        aggrs.forEach(function (ag) {
            if (ag.hasOwnProperty('nic_tags_provided')) {
                ag.nic_tags_provided.forEach(function (t) {
                    var ntag = t + '_nic';

                    if (!params.kernel_args.hasOwnProperty(ntag)) {
                        params.kernel_args[ntag] = ag.name;
                    }

                    if (poolContainsTag(adminPool, t)) {
                        adminFound = true;
                    }
                });
            }
        });

        // Add aggregation boot parameters
        for (var a in vArg.aggrs) {
            var aggr = vArg.aggrs[a];
            params.kernel_args[aggr.name + '_aggr'] =
                '"' + aggr.macs.join(',') + '"';

            if (aggr.hasOwnProperty('lacp_mode')) {
                params.kernel_args[aggr.name + '_lacp_mode'] = aggr.lacp_mode;
            }
        }

        // If we don't have admin nic from NAPI, then set it to the nic
        // we booted from: this is likely the first boot
        if (!adminFound && !params.kernel_args.hasOwnProperty('admin_nic')) {
                params.kernel_args.admin_nic = bootNic.mac;
                seen[bootNic.mac] = 1;
        }

        if (Object.keys(overridden).length !== 0) {
            log.warn('kernel_args: overriding: %j', Object.keys(overridden));
        }

        log.info({ params: params, mac: mac }, 'Boot params generated');

        mod_json.write({
            dir: cacheDir,
            log: log,
            name: fmt('%s.json', mac),
            payload: params
        }, function (storeErr) {
            if (storeErr) {
                callback(storeErr);
                return;
            }

            callback(null, {
                adminNic: adminNic,
                aggrs: vArg.aggrs,
                bootParams: params,
                nics: nics,
                adminPool: adminPool,
                nictags: vArg.nictags,
                platforms: vArg.platforms
            });
        });
    });
}



module.exports = {
    getBootParams: getBootParams,
    getFromCache: getFromCache
};
