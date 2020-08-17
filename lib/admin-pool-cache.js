/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/*
 * Copyright 2020 Joyent, Inc.
 */


/*
 * This cache is intended to minimize the impact on NAPI when booting a new
 * rack of CNs.  We accomplish this by caching the 'admin' network pool
 * information so that we can avoid calling NAPI.listNetworkPools() for each
 * booting CN.
 *
 * The location of the admin network pool cache and it's update interval are
 * specified in the config file.
 */
var assert = require('assert-plus');
var mod_json = require('./json-file');


/*
 * Internal
 */
function _readCache(opts, cb) {
    mod_json.read({
        dir: opts.cacheDir,
        name: opts.filename,
        log: opts.log
    }, function (err, data) {
        cb(err, data);
        return;
    });
}

function _resetTimeout() {
    clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(this.updateWorker.bind(this),
        this.updateInterval);
    this.timeoutId.unref();
}


/*
 * Initialize AdminPoolCache and start periodic updater.
 */
function AdminPoolCache(config) {
    this._cache = {};
    this.log = config.log;
    this.napi = config.napi;
    this.updateInterval = config.cacheUpdateIntervalSeconds * 1000;
    this.filename = 'admin_network_pool.json';
    this.cacheDir = config.cacheDir;
    _resetTimeout.call(this);
    Object.seal(this);
}

/*
 * Update AdminPoolCache.
 */
AdminPoolCache.prototype.update = function update(callback) {
    var napi = this.napi;
    var self = this;
    var resetTimeout = _resetTimeout.bind(this);

    assert.func(callback, 'callback');

    // Callbacks are called via readCache and writeCache
    var writeCache = function (payload) {
        mod_json.write({
            dir: self.cacheDir,
            log: self.log,
            name: self.filename,
            payload: payload
        }, function (writeErr) {
            callback(writeErr, payload);
            return;
        });
    };

    var opts = {
        cacheDir: self.cacheDir,
        filename: self.filename,
        log: self.log
    };

    napi.listNetworkPools({name: 'admin'}, null, function (err, res) {
        // If there was an error, don't alter the cache.
        if (err || !Array.isArray(res)) {
            self.log.error({ err: err }, 'NAPI Error');
            resetTimeout();
            _readCache(opts, callback);
            return;
        }

        if (res.length > 1) {
            self.log.error({
                pools: res
            }, 'More than one network pool found for "admin"');
            resetTimeout();
            _readCache(opts, callback);
            return;
        }

        /*
         * If NAPI is error free, but there isn't an admin network pool, clear
         * the cache.
         */
        if (res.length === 0) {
            resetTimeout();
            writeCache({});
            return;
        }

        resetTimeout();
        writeCache(res[0]);
        return;
    });
};

AdminPoolCache.prototype.updateWorker = function updateWorker() {
    var self = this;
    this.update(function (err, data) {
        if (err) {
            self.log.error({error: err, cache: data},
                'Periodic Admin Pool Cache update failed to write cache');
        } else {
            self.log.info({cache: data},
                'Periodic Admin Pool Cache update complete');
        }
    });
};

AdminPoolCache.prototype.readCache = function (callback) {
    var self = this;

    var opts = {
        cacheDir: self.cacheDir,
        filename: self.filename,
        log: self.log
    };

    /*
     * Read the cache.  If we fail a read due to a missing file, update the
     * cache (which does an implicit read).
     */
    _readCache(opts, function (err, data) {
        if (err && err.code === 'ENOENT') {
            self.update(callback);
            return;
        }
        callback(err, data);
    });
};

module.exports = {
    create: function (config) {
        return new AdminPoolCache(config);
    }
};
