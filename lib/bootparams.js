/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * Gets information from NAPI and CNAPI for booting SDC compute nodes.
 */

var assert = require('assert-plus');
var fs = require('fs');
var mod_clients = require('./clients');
var mod_json = require('./json-file');
var util = require('util');
var vasync = require('vasync');



// --- Internal functions



/**
 * Return an object mapping foo_nic to aggregation name
 */
function aggrsToTags(aggrs) {
    var agTag = {};

    aggrs.forEach(function (ag) {
        if (ag.hasOwnProperty('nic_tags_provided')) {

            ag.nic_tags_provided.forEach(function (t) {
                agTag[t + '_nic'] = ag.name;
            });
        }
    });

    return agTag;
}


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
    var dir = opts.dir;
    var log = opts.log;
    var mac = opts.mac;
    var originalErr = opts.err;

    var file = util.format('%s/%s.json', dir, mac);
    fs.readFile(file, function (err, data) {
        if (err) {
            log.error(err,
                'getFromCache: MAC "%s": error getting cached params from "%s"',
                mac, file);
            return callback(originalErr);
        }

        var params;
        try {
            params = JSON.parse(data);
        } catch (err2) {
            log.error(err2,
                'getFromCache: MAC "%s": error parsing JSON from "%s"',
                mac, file);

            return callback(originalErr);
        }

        log.debug(params, 'getFromCache: MAC "%s": got cached params from "%s"',
            mac, file);
        return callback(null, { bootParams: params });
    });
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

    var cacheDir = opts.cacheDir;
    var adminUuid = opts.adminUuid;
    var cnapi = opts.cnapi;
    var log = opts.log;
    var mac = opts.mac;
    var napi = opts.napi;

    var uuid;
    var params = null;
    var vArg = {
        adminUuid: opts.adminUuid,
        bootNic: null,
        log: opts.log,
        napi: opts.napi
    };

    vasync.pipeline({
        arg: vArg,
        funcs: [

            // Get nic data from NAPI for the given MAC
            function _getNic(fArg, cb) {
                napi.getNic(mac, function (err, res) {
                    if (err) {
                        if (err.statusCode == 404) {
                            log.debug('Did not find nic "%s" in NAPI', mac);
                            return cb();
                        }
                        log.error(err, 'Error getting nic "%s" from NAPI', mac);
                        return cb(err);
                    }

                    log.debug(res, 'Got nic from NAPI');
                    fArg.bootNic = res;
                    fArg.nics = [ fArg.bootNic ];
                    return cb();
                });
            },

            // If the nic exists in NAPI but it doesn't have an IP, give it one
            function _provisionIP(fArg, cb) {
                if (fArg.bootNic === null || fArg.bootNic.ip) {
                    return cb();
                }

                var putParams = {
                    network_uuid: 'admin'
                };

                log.debug(putParams, 'Updating nic "%s" to add IP', mac);
                napi.updateNic(mac, putParams, function (err, res) {
                    if (err) {
                        log.error({ err: err, params: putParams},
                            'Error adding IP to nic "%s" on NAPI', mac);
                        return cb(err);
                    }

                    log.debug(res, 'Updated nic "%s" with IP "%s" in NAPI',
                        mac, res.ip);
                    fArg.bootNic = res;

                    fArg.nics = [ fArg.bootNic ];
                    return cb();
                });
            },

            // If the nic doesn't exist in NAPI, provision it on the admin
            // network, which will give it an IP
            function _createNic(fArg, cb) {
                if (fArg.bootNic !== null) {
                    return cb();
                }

                var postParams = {
                    owner_uuid: adminUuid,
                    belongs_to_uuid: adminUuid,
                    belongs_to_type: 'other',
                    mac: mac,
                    nic_tags_provided: [ 'admin' ]
                };
                napi.provisionNic('admin', postParams, function (err, res) {
                    if (err) {
                        log.error(err,
                            'Error provisioning admin nic "%s" on NAPI', mac);
                        return cb(err);
                    }

                    log.debug(res, 'Got provisioned nic from NAPI');
                    fArg.bootNic = res;
                    fArg.nics = [ fArg.bootNic ];

                    return cb();
                });
            },

            // Get boot params from CNAPI if belongs_to_uuid is set to something
            // than the admin UUID
            function _bootParams(fArg, cb) {
                uuid = fArg.bootNic.belongs_to_uuid;
                fArg.cn_uuid = fArg.bootNic.belongs_to_uuid;
                if (uuid == adminUuid) {
                    uuid = 'default';
                    return cb();
                }

                cnapi.getBootParams(uuid, function (err, res) {
                    if (err) {
                        if (err.statusCode == 404) {
                            log.warn('Did not find bootparams for "%s" in '
                                + 'CNAPI: continuing anyway', uuid);
                            uuid = 'default';
                            return cb();
                        }

                        log.error(err, 'Error getting %s bootparams from CNAPI',
                            uuid);
                        return cb(err);
                    }

                    log.debug(res, 'Got bootparams from CNAPI');

                    // If CNAPI didn't know about that UUID, we will need to
                    // get the default boot params instead.
                    if (Object.keys(res).length === 0) {
                        log.warn('empty bootparams: getting default '
                            + 'bootparams instead');
                        uuid = 'default';
                        return cb();
                    }
                    params = res;
                    return cb();
                });
            },

            // Get default boot params from CNAPI if the nic's belongs_to_uuid
            // is set to the admin UUID.  This means that the nic doesn't
            // belong to a server that has successfully updated NAPI with its
            // sysinfo
            function _defaultBootParams(fArg, cb) {
                if (uuid != 'default') {
                    return cb();
                }

                cnapi.getBootParams(uuid, function (err, res) {
                    if (err) {
                        log.error(err,
                            'Error getting default bootparams from CNAPI');
                        return cb(err);
                    }

                    log.debug(res, 'Got default bootparams from CNAPI');
                    params = res;
                    return cb();
                });
            },

            // If we have a server UUID in belongs_to_uuid, get its nics
            // and aggregations from NAPI
            mod_clients.napiGetNics,
            mod_clients.napiGetAggrs,
            mod_clients.napiGetNicTags
        ]
    }, function (err, res) {
        if (err) {
            return getFromCache({
                dir: cacheDir,
                err: err,
                log: log,
                mac: mac
            }, callback);
        }

        if (!vArg.bootNic.ip || !vArg.bootNic.netmask) {
            var nicErr = new Error('Error: boot nic has no IP or netmask');
            log.error({ err: nicErr, nic: vArg.bootNic },
                'Error with boot nic from NAPI');
            return callback(nicErr);
        }

        var adminNic = vArg.bootNic;
        var aggrTags = aggrsToTags(vArg.aggrs);
        var bootNic = vArg.bootNic;
        var macAggrs = macsToAggrs(vArg.aggrs);
        var nics = vArg.nics;
        var overridden = {};
        var seen = {};
        var tag;

        params.ip = bootNic.ip;
        params.netmask = bootNic.netmask;
        params.resolvers = bootNic.resolvers;

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

            for (var t in nic.nic_tags_provided) {
                tag = nic.nic_tags_provided[t] + '_nic';
                if (params.kernel_args.hasOwnProperty(tag)) {
                    overridden[tag] = 1;
                } else {
                    if (!macAggrs.hasOwnProperty(newMAC)) {
                        params.kernel_args[tag] = newMAC;
                    }
                }

                if (tag == 'admin_nic') {
                    adminNic = nic;
                }
            }

            seen[newMAC] = 1;
        }

        // Now go through and assign nic tags to aggregations
        for (tag in aggrTags) {
            if (!params.kernel_args.hasOwnProperty(tag)) {
                params.kernel_args[tag] = aggrTags[tag];
            }
        }

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
        if (!params.kernel_args.hasOwnProperty('admin_nic')) {
            params.kernel_args.admin_nic = bootNic.mac;
            seen[bootNic.mac] = 1;
        }

        if (Object.keys(overridden).length !== 0) {
            log.warn('kernel_args: overriding: %j', Object.keys(overridden));
        }

        log.info({ params: params, mac: mac }, 'Boot params generated');

        return mod_json.write({
            dir: cacheDir,
            log: log,
            name: mac,
            payload: params
        }, function (storeErr) {
            if (storeErr) {
                return callback(storeErr);
            }

            return callback(null, {
                adminNic: adminNic,
                aggrs: vArg.aggrs,
                bootParams: params,
                nics: nics,
                nictags: vArg.nictags
            });
        });
    });
}



module.exports = {
    getBootParams: getBootParams
};
