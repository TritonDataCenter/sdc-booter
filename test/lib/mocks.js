/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * mocks for tests
 */




// --- Globals



var LOG = false;
var ROOT = {};



// --- Mock base class


function Mock() {
    this.CALLS = {};
    this.VALUES = {};
}


Mock.prototype._handle = function (name, args, cb) {
    if (!this.CALLS.hasOwnProperty(name)) {
        this.CALLS[name] = [];
    }
    this.CALLS[name].push(args);

    if (!this.VALUES.hasOwnProperty(name)) {
        return cb(new Error(name + ' mock error: no data specified'));
    }

    var nextVal = this.VALUES[name].shift();
    if (!nextVal) {
        return cb(new Error(name + ' mock error: no call data specified'));
    }

    var err = nextVal.err || null;
    var res = nextVal.res;
    if (!err && !res) {
        return cb(new Error(name + ' mock error: no err or res specified'));
    }

    return cb(err, res);
};



// --- Internal helpers


/**
 * Returns a fake fs ENOENT error
 */
function _ENOENT(path) {
    var err = new Error('ENOENT: ' + path);
    err.code = 'ENOENT';
    return err;
}


/**
 * Splits a path into directory and file
 */
function _splitFile(f) {
    return {
        dir: f.substring(0, f.lastIndexOf('/')),
        file: f.substring(f.lastIndexOf('/') + 1)
    };
}



// --- Setup / Teardown



/**
 * Initialize VALUES to a clean state for each mock
 */
function createMocks() {
    var mocks = {};

    // bunyan

    mocks.bunyan = {
        VALUES: {
            trace: [],
            debug: [],
            error: [],
            warn: [],
            info: []
        },

        _log: function (level, args) {
            if (args.length !== 0) {
                this.VALUES[level].push(args);
                if (LOG) {
                    console.error('# %s %j', level, args);
                }
            }
            return true;
        },

        trace: function () { return this._log('trace', arguments); },
        debug: function () { return this._log('debug', arguments); },
        error: function () { return this._log('error', arguments); },
        warn: function () { return this._log('warn', arguments); },
        info: function () { return this._log('info', arguments); }
    };

    // NAPI

    mocks.napi = new Mock();
    mocks.napi.getNic = function (mac, cb) {
        return this._handle('getNic', { mac: mac }, cb);
    };

    mocks.napi.getNics = function (uuid, cb) {
        return this._handle('getNics', { uuid: uuid }, cb);
    };

    mocks.napi.listAggrs = function (params, cb) {
        return this._handle('listAggrs', { params: params }, cb);
    };

    mocks.napi.provisionNic = function (network, params, cb) {
        return this._handle('provisionNic',
            { network: network, params: params }, cb);
    };

    mocks.napi.updateNic = function (mac, params, cb) {
        return this._handle('updateNic',
            { mac: mac, params: params }, cb);
    };

    // CNAPI

    mocks.cnapi = new Mock();

    mocks.cnapi.getBootParams = function (uuid, cb) {
        return this._handle('getBootParams',
            { uuid: uuid }, cb);
    };

    // sdc-clients

    mocks.sdcClients = {};

    // fs

    ROOT = {};
    mocks.fs = {
        getRoot: function () {
            return ROOT;
        },

        readFile: function (file, cb) {
            var p = _splitFile(file);

            if (!ROOT.hasOwnProperty(p.dir) ||
                !ROOT[p.dir].hasOwnProperty(p.file)) {
                return cb(_ENOENT(file));
            }

            return cb(null, ROOT[p.dir][p.file]);
        },

        mkdir: function (dir, cb) {
            if (ROOT.hasOwnProperty(dir)) {
                var err = new Error('EEXIST: ' + dir);
                err.code = 'EEXIST';
                return cb(err);
            }

            ROOT[dir] = {};
            return cb();
        },

        writeFile: function (file, data, cb) {
            var p = _splitFile(file);

            if (!ROOT.hasOwnProperty(p.dir)) {
                return cb(_ENOENT(file));
            }

            ROOT[p.dir][p.file] = data;
            return cb();
        }

    };

    return mocks;
}



// --- Exports



module.exports = {
    create: createMocks
};
