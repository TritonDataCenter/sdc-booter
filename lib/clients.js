/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * Clients for booter to communicate with various APIs
 */

var assert = require('assert-plus');
var CNAPI = require('sdc-clients').CNAPI;
var mod_vasync = require('vasync');
var NAPI = require('sdc-clients').NAPI;



// --- Internal



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
 * Returns true if (based on opts), the CN specified by opts.cn_uuid has
 * just booted.
 */
function justBooted(opts) {
    if (opts.cn_uuid === opts.adminUuid) {
        return true;
    }

    return false;
}



// --- Exports



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


/*
 * Get all aggregations belonging to the CN in opts.cn_uuid
 */
function napiGetAggrs(opts, callback) {
    opts.current = 'Getting aggregations';
    opts.aggrs = [];

    if (justBooted(opts)) {
        opts.log.info('CN has just booted: not getting aggrs');
        return callback();
    }

    opts.log.debug({ cn_uuid: opts.cn_uuid }, 'Getting aggrs');
    opts.napi.listAggrs({ belongs_to_uuid: opts.cn_uuid },
            function (err, list) {
        if (err) {
            opts.log.error(err, 'Error getting aggrs');
            return callback(err);
        }

        opts.aggrs = list;
        return callback();
    });
}

/**
 * Get all nics for the CN specified by opts.cn_uuid from napi and store
 * them in NAPI.
 *
 */
function napiGetNics(opts, callback) {
    opts.current = 'Getting nics';
    opts.nics = opts.nics || [];

    if (justBooted(opts)) {
        opts.log.info('CN has just booted: not getting nics');
        return callback();
    }

    opts.napi.getNics(opts.cn_uuid, function (err, res) {
        if (err) {
            opts.log.error({ err: err, cn_uuid: opts.cn_uuid },
                'Error getting nics from NAPI');
            return callback(err);
        }

        opts.log.debug({ nics: res, uuid: opts.cn_uuid }, 'Got nics from NAPI');

        var prevMacs = opts.nics.map(function (n) { return n.mac; });

        res.forEach(function (n) {
            if (prevMacs.indexOf(n.mac) === -1) {
                opts.nics.push(n);
                prevMacs.push(n.mac);
            }
        });

        return callback(null, opts.nics);
    });
}


/**
 * Get all nic tag names from nics (opts.nics) and aggrs (opts.aggrs) and fetch
 * them all from NAPI
 */
function napiGetNicTags(opts, callback) {
    var tags = [];

    opts.current = 'Getting nic tags';
    opts.nictags = [];

    function addTag(t) {
        if (t.indexOf('/') !== -1) {
            // Nic on a fabric: this shouldn't happen, but what's a little
            // paranoia among friends?
            return;
        }

        if (tags.indexOf(t) === -1) {
            tags.push(t);
        }
    }

    function addAllTags(netObj) {
        (netObj.nic_tags_provided || []).forEach(addTag);

        if (netObj.nic_tag) {
            addTag(netObj.nic_tag);
        }
    }

    (opts.nics || []).forEach(addAllTags);
    (opts.aggrs || []).forEach(addAllTags);
    if (opts.adminNic) {
        addAllTags(opts.adminNic);
    }

    if (tags.length === 0) {
        opts.log.debug('No nic tags found on nics or aggrs: not getting');
        return callback(null, opts.nictags);
    }

    opts.log.debug({ tags: tags }, 'Getting nic tags');
    mod_vasync.forEachParallel({
        inputs: tags,
        func: function _getTag(tagName, cb) {
            opts.napi.getNicTag(tagName, function (tErr, tag) {
                if (tErr) {
                    opts.log.error({tag: tag, err: tErr },
                        'Error getting nic tag');
                    return cb(tErr);
                }

                opts.nictags.push(tag);
                return cb();
            });
        }
    }, function (vErr) {
        if (vErr) {
            return callback(vErr);
        }

        return callback(null, opts.nictags);
    });
}



module.exports = {
    createCNAPIclient: createCNAPIclient,
    createNAPIclient: createNAPIclient,
    napiGetAggrs: napiGetAggrs,
    napiGetNics: napiGetNics,
    napiGetNicTags: napiGetNicTags
};
