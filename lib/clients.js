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



module.exports = {
    createCNAPIclient: createCNAPIclient,
    createNAPIclient: createNAPIclient
};
