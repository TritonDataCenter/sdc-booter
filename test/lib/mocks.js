/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2020 Joyent, Inc.
 */

/*
 * mocks for tests
 */

var mockery = require('mockery');
var mod_path = require('path');



// --- Globals



var MOCKS;
var REGISTERED = false;
var ROOT = {};
var STAT_INO = 12;



// --- Mock fs.Stats object returned by fs.lstat()



function FakeStatsObj(opts) {
    this.file = opts.file;
    this.ino = STAT_INO++;
}


FakeStatsObj.prototype.isDirectory = function _isDir() {
    return !this.file;
};


FakeStatsObj.prototype.isFile = function _isFile() {
    return this.file;
};


FakeStatsObj.prototype.isSymbolicLink = function _isSym() {
    return false;
};



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



// --- Exports



/**
 * Initialize VALUES to a clean state for each mock
 */
function createMocks() {
    var mocks = {};

    // NAPI

    mocks.napi = new Mock();
    mocks.napi.getNic = function (mac, cb) {
        return this._handle('getNic', { mac: mac }, cb);
    };

    mocks.napi.getNics = function (uuid, cb) {
        return this._handle('getNics', { uuid: uuid }, cb);
    };

    mocks.napi.getNicTag = function (tag, cb) {
        return this._handle('getNicTag', { name: tag }, cb);
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

    mocks.napi.listNetworks = function (params, options, cb) {
        return this._handle('listNetworks',
            { params: params, options: options }, cb);
    };

    mocks.napi.listNetworkPools = function (params, options, cb) {
        return this._handle('listNetworkPools',
            { params: params, options: options }, cb);
    };

    // CNAPI

    mocks.cnapi = new Mock();

    mocks.cnapi.getBootParams = function (uuid, cb) {
        return this._handle('getBootParams',
            { uuid: uuid }, cb);
    };

    mocks.cnapi.listPlatforms = function (opts, cb) {
        return this._handle('listPlatforms', {
            opts: opts
        }, cb);
    };

    mocks.cnapi.listServers = function (opts, cb) {
        return this._handle('listServers', {
            opts: opts
        }, cb);
    };

    mocks.assets = new Mock();

    mocks.assets.get = function (path, cb) {
        return this._handle('getNodeConfigFile', {
            path: path
        }, cb);
    };

    // sdc-clients

    mocks.sdcClients = {
        CNAPI: function FakeCNAPI() { },
        NAPI: function FakeNAPI() { }
    };

    // fs

    ROOT = {};
    mocks.fs = {
        exists: function (file, cb) {
            return setImmediate(cb, ROOT.hasOwnProperty(file));
        },

        getRoot: function () {
            return ROOT;
        },

        lstat: function (file, cb) {
            var dirName = mod_path.dirname(file);
            var err;
            var fileName = mod_path.basename(file);

            if (ROOT.hasOwnProperty(file)) {
                return setImmediate(cb, null,
                    new FakeStatsObj({ file: false }));
            }

            if (!ROOT.hasOwnProperty(dirName)) {
                err = new Error('ENOENT: ' + dirName);
                err.code = 'ENOENT';
                return setImmediate(cb, err);
            }

            if (!ROOT[dirName].hasOwnProperty(fileName)) {
                err = new Error('ENOENT: ' + file);
                err.code = 'ENOENT';
                return setImmediate(cb, err);
            }

            return setImmediate(cb, null, new FakeStatsObj({ file: true }));
        },

        mkdir: function (dir, mode, cb) {
            if (!cb) {
                cb = mode;
            }

            if (ROOT.hasOwnProperty(dir)) {
                var err = new Error('EEXIST: ' + dir);
                err.code = 'EEXIST';
                return setImmediate(cb, err);
            }
            ROOT[dir] = {};
            return setImmediate(cb);
        },

        mkdirSync: function (dir, _mode) {
            if (ROOT.hasOwnProperty(dir)) {
                var err = new Error('EEXIST: ' + dir);
                err.code = 'EEXIST';
                throw err;
            }

            ROOT[dir] = {};
            return;
        },

        // XXX: this doesn't return sub-directories, which is due to how we're
        // storing directories in ROOT
        readdir: function (dir, cb) {
            if (!ROOT.hasOwnProperty(dir)) {
                var err = new Error('ENOENT: ' + dir);
                err.code = 'ENOENT';
                return setImmediate(cb, err);
            }

            return setImmediate(cb, null, Object.keys(ROOT[dir]));
        },

        readFile: function (file, cb) {
            var p = _splitFile(file);

            if (!ROOT.hasOwnProperty(p.dir) ||
                !ROOT[p.dir].hasOwnProperty(p.file)) {
                return setImmediate(cb, _ENOENT(file));
            }

            return setImmediate(cb, null, ROOT[p.dir][p.file]);
        },

        stat: function (_file, cb) {
            // This is really just to reassure mkdirp that it has created
            // a directory:
            return setImmediate(cb, null, {
                isDirectory: function () { return true; },
                isFile: function () { return true; }
            });
        },

        writeFile: function (file, data, cb) {
            var p = _splitFile(file);
            if (!ROOT.hasOwnProperty(p.dir)) {
                return setImmediate(cb, _ENOENT(file));
            }

            ROOT[p.dir][p.file] = data;
            return setImmediate(cb);
        }

    };

    mocks.mkdirp = function (dir, callback) {
        ROOT[dir] = {};
        return callback();
    };

    MOCKS = mocks;
    return mocks;
}


function registerMocks() {
    if (REGISTERED) {
        return null;
    }

    var mocks = createMocks();
    mockery.enable();
    mockery.registerMock('sdc-clients', mocks.sdcClients);
    mockery.registerMock('fs', mocks.fs);
    // The mkdirp mock is required, since we use a real bunyan logger in our
    // tests (test/lib/log.js), and it requires mkdirp before we can setup
    // a mock for it. This prevents future require()s from getting the real
    // thing:
    mockery.registerMock('mkdirp', mocks.mkdirp);

    [
        'assert',
        'assert-plus',
        'crypto',
        'dgram',
        'extsprintf',
        'events',
        'findit',
        'ip6addr',
        'jsprim',
        'json-schema',
        'node-uuid',
        'pack',
        'path',
        'restify',
        'sprintf',
        'stream',
        'util',
        'vasync',
        'verror',
        '../../lib/admin-pool-cache',
        '../../lib/boot-files',
        '../../lib/boot-module-files',
        '../../lib/node-config-file',
        '../../lib/cache',
        '../../lib/dhcpd',
        '../lib/bootparams',
        '../lib/cache',
        '../lib/dhcpd',
        '../lib/menulst',
        '../../lib/menulst',
        './bootparams',
        './boot-files',
        './boot-module-files',
        './node-config-file',
        './clients',
        './cache',
        './dhcp',
        './find',
        './json-file',
        './menulst',
        './net-file'
    ].forEach(function (mod) {
        mockery.registerAllowable(mod);
    });

    REGISTERED = true;

    return mocks;
}



module.exports = {
    create: createMocks,
    getCreated: function () {
        return MOCKS;
    },
    register: registerMocks
};
