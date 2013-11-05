/*
 * Copyright (c) 2013 Joyent Inc., All rights reserved.
 *
 * Gets information from NAPI and CNAPI for booting SDC compute nodes.
 */

var assert = require('assert-plus');
var CNAPI = require('sdc-clients').CNAPI;
var fs = require('fs');
var NAPI = require('sdc-clients').NAPI;
var util = require('util');
var vasync = require('vasync');



// --- Internal functions



/**
 * Create options for the given client
 */
function createClientOpts(config, api, log) {
    assert.object(config, 'config');
    assert.object(config[api], 'config.' + api);
    assert.string(config[api].url, 'config.' + api + '.url');

    var opts = {
        url: config[api].url
    };

    ['username', 'password'].forEach(function (p) {
        if (config[api][p]) {
            opts[p] = config[api][p];
        }
    });

    if (config.hasOwnProperty('agent')) {
        opts.agent = config.agent;
    }

    if (log) {
        opts.log = log;
    }

    return opts;
}


/**
 * Stores the boot params in the on-disk cache
 */
function storeInCache(options, callback) {
    var dir = options.dir;
    var log = options.log;
    var mac = options.mac;
    var params = options.params;

    vasync.pipeline({
        'funcs': [
            function _mkdir(_, cb) {
                fs.mkdir(dir, function (err) {
                    if (err) {
                        if (err.code === 'EEXIST') {
                            return cb();
                        }

                        log.error(err,
                            'storeInCache: Error creating directory "%s"', dir);
                    }

                    return cb(err);
                });
            },

            function _writeFile(_, cb) {
                var file = util.format('%s/%s.json', dir, mac);
                fs.writeFile(file, JSON.stringify(params, null, 2),
                    function (err) {
                    if (err) {
                        log.error(err, 'storeInCache: Error writing "%s"',
                            file);
                        return cb(err);
                    }

                    log.debug('storeInCache: MAC "%s": cached params to "%s"',
                        mac, file);
                    return cb();
                });
            }
        ]
    }, function (err) {
        return callback(err, options.params);
    });
}


/**
 * Gets the boot params for a MAC from the on-disk cache
 */
function getFromCache(options, callback) {
    var dir = options.dir;
    var log = options.log;
    var mac = options.mac;
    var originalErr = options.err;

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
        return callback(null, params);
    });
}


/**
 * Shuffle the contents of the array based on the Fisher-Yates or Knuth shuffle.
 */
function shuffle(array) {
    var m = array.length, t, i;

    while (m) {
        i = Math.floor(Math.random() * m--);
        t = array[m];
        array[m] = array[i];
        array[i] = t;
    }

    return array;
}


// --- Exported functions



/**
 * Creates a NAPI client
 */
function createNAPIclient(config, log) {
    return new NAPI(createClientOpts(config, 'napi', log));
}


/**
 * Creates a CNAPI client
 */
function createCNAPIclient(config, log) {
    return new CNAPI(createClientOpts(config, 'cnapi', log));
}


/**
 * Get enough data to boot a node on the admin network. For new hosts,
 * this is just the IP, netmask
 */
function getBootParams(options, callback) {
    assert.object(options, 'options');
    assert.string(options.cacheDir, 'options.cacheDir');
    assert.string(options.adminUuid, 'options.adminUuid');
    assert.object(options.cnapi, 'options.cnapi');
    assert.object(options.log, 'options.log');
    assert.string(options.mac, 'options.mac');
    assert.object(options.napi, 'options.napi');

    var cacheDir = options.cacheDir;
    var adminUuid = options.adminUuid;
    var cnapi = options.cnapi;
    var log = options.log;
    var mac = options.mac;
    var napi = options.napi;

    var uuid;
    var bootNic = null;
    var nics = [];
    var params = null;

    vasync.pipeline({
        'funcs': [

            // Get nic data from NAPI for the given MAC
            function _getNic(_, cb) {
                napi.getNic(mac, function (err, res) {
                    if (err) {
                        if (err.statusCode == 404) {
                            log.debug('Did not find nic "%s" in NAPI', mac);
                            return cb(null);
                        }
                        log.error(err, 'Error getting nic "%s" from NAPI', mac);
                        return cb(err);
                    }

                    log.debug(res, 'Got nic from NAPI');
                    bootNic = res;
                    nics = [ bootNic ];
                    return cb(null);
                });
            },

            // If the nic exists in NAPI but it doesn't have an IP, give it one
            function _provisionIP(_, cb) {
                if (bootNic === null || bootNic.ip) {
                    return cb(null);
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
                    bootNic = res;
                    return cb(null);
                });
            },

            // If the nic doesn't exist in NAPI, provision it on the admin
            // network, which will give it an IP
            function _createNic(_, cb) {
                if (bootNic !== null) {
                    return cb(null);
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
                    bootNic = res;
                    return cb(null);
                });
            },

            // Get boot params from CNAPI if belongs_to_uuid is set to something
            // than the admin UUID
            function _bootParams(_, cb) {
                uuid = bootNic.belongs_to_uuid;
                if (uuid == adminUuid) {
                    uuid = 'default';
                    return cb(null);
                }

                cnapi.getBootParams(uuid, function (err, res) {
                    if (err) {
                        if (err.statusCode == 404) {
                            log.warn('Did not find bootparams for "%s" in '
                                + 'CNAPI: continuing anyway', uuid);
                            uuid = 'default';
                            return cb(null);
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
                        return cb(null);
                    }
                    params = res;
                    return cb(null);
                });
            },

            // Get default boot params from CNAPI if the nic's belongs_to_uuid
            // is set to the admin UUID.  This means that the nic doesn't
            // belong to a server that has successfully updated NAPI with its
            // sysinfo
            function _defaultBootParams(_, cb) {
                if (uuid != 'default') {
                    return cb(null);
                }

                cnapi.getBootParams(uuid, function (err, res) {
                    if (err) {
                        log.error(err,
                            'Error getting default bootparams from CNAPI');
                        return cb(err);
                    }

                    log.debug(res, 'Got default bootparams from CNAPI');
                    params = res;
                    return cb(null);
                });
            },

            // If we have a server UUID in belongs_to_uuid, get its nic tags
            // from NAPI
            function _nicTags(_, cb) {
                uuid = bootNic.belongs_to_uuid;
                if (uuid == adminUuid) {
                    return cb(null);
                }

                napi.getNics(uuid, function (err, res) {
                    if (err) {
                        log.error(err, 'Error getting nics for "%s" from NAPI',
                            uuid);
                        return cb(err);
                    }

                    log.debug(res, 'Got nics for "%s" from NAPI', uuid);
                    nics = nics.concat(res);
                    return cb(null);
                });
            }
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

        if (!bootNic.ip || !bootNic.netmask) {
            var nicErr = new Error('Error: boot nic has no IP or netmask');
            log.error({ err: nicErr, nic: bootNic },
                'Error with boot nic from NAPI');
            return callback(nicErr);
        }

        params.ip = bootNic.ip;
        params.netmask = bootNic.netmask;
        params.resolvers = shuffle(bootNic.resolvers);
        var overridden = {};
        var seen = {};

        // Allow kernel_args from CNAPI to override the nic tag values, but
        // dutifully complain about it
        if (params.kernel_args.hasOwnProperty('admin_nic')) {
            overridden['admin_nic'] = 1;
        }

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
                var tag = nic.nic_tags_provided[t] + '_nic';
                if (params.kernel_args.hasOwnProperty(tag)) {
                    overridden[tag] = 1;
                } else {
                    params.kernel_args[tag] = newMAC;
                }
            }
            seen[newMAC] = 1;
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
        return storeInCache({
            dir: cacheDir,
            log: log,
            mac: mac,
            params: params
        }, callback);
    });
}


module.exports = {
    createNAPIclient: createNAPIclient,
    createCNAPIclient: createCNAPIclient,
    getBootParams: getBootParams
};
