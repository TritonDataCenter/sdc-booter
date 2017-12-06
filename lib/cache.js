/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Joyent, Inc.
 */
/* jsl:ignore */
'use strict';
/* jsl:end */

// stdlib
const fs = require('fs');
const path = require('path');

// npm
var assert = require('assert-plus');
const vasync = require('vasync');
const verror = require('verror');

// local
const mod_bootparams = require('./bootparams');


/*
 * From the upstream docs <https://nodejs.org/docs/latest-v4.x/api/timers.html>
 * "To follow browser behavior, when using delays larger than 2147483647
 * milliseconds (approximately 25 days) or less than 1, Node will use 1 as the
 * delay."  Such short intervals would not make sense as intentional values for
 * booter cache management.
 */
function isSafeTimerValueSeconds(val) {
    const maxSeconds =  Math.floor(2147483647 / 1000);
    return val > 0 && val < maxSeconds;
}


/*
 * To boot a CN, booter needs information from other services, such as which
 * platform image to use.  However, those services could be located on the down
 * CNs that are trying to boot, resulting in a circular dependency in need of
 * manual intervention.  To guard against this situation, the bootparams module
 * writes out local cache of the last used values for each CN.  When there is an
 * error connecting to the required services, those local files are used as a
 * fallback.  CacheSentinel performs two periodic tasks for the maintenance of
 * those cache files:
 *
 * Refresh: On a configurable time interval, gather the list of *all* current
 * CNs (not just recently booted ones) and pre-populate the cache with their
 * current configuration.  This narrows the vulnerability window of bad or
 * missing data to the refresh period.  CNs that boot during the window, or have
 * their configuration changed through a sdcadm workflow will still have their
 * cached values updated normally.
 *
 * Purge: On a configurable time interval, delete cache files that have not been
 * updated in a long (configurable) time.  This is to remove cache files for
 * decommissioned CNs so the cache size does not grow indefinitely with obsolete
 * data.  Purging is only done if the last refresh completed without error.
 */
function CacheSentinel(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.log, 'opts.log');
    assert.object(opts.cnapi, 'opts.cnapi');
    assert.object(opts.napi, 'opts.napi');
    assert.uuid(opts.adminUuid, 'opts.adminUuid');

    assert.object(opts.cacheConfig, 'opts.cacheConfig');
    assert.string(opts.cacheConfig.dir, 'opts.cacheConfig.dir');
    assert.number(opts.cacheConfig.refreshIntervalSeconds,
                  'opts.cacheConfig.refreshIntervalSeconds');
    assert.ok(isSafeTimerValueSeconds(opts.cacheConfig.refreshIntervalSeconds),
              'Invalid timer value refreshIntervalSeconds');
    assert.number(opts.cacheConfig.purgeIntervalSeconds,
                  'opts.cacheConfig.purgeIntervalSeconds');
    assert.ok(isSafeTimerValueSeconds(opts.cacheConfig.purgeIntervalSeconds),
              'Invalid timer value purgeIntervalSeconds');
    assert.number(opts.cacheConfig.maxCacheFileAgeSeconds,
                  'opts.cacheConfig.maxCacheFileAgeSeconds');
    assert.ok(opts.cacheConfig.maxCacheFileAgeSeconds > 0,
              'maxCacheFileAgeSeconds must be positive');
    assert.number(opts.cacheConfig.refreshConcurrency,
                  'opts.cacheConfig.refreshConcurrency');
    assert.ok(opts.cacheConfig.refreshConcurrency > 0,
              'refreshConcurrency must be positive');

    this.log = opts.log;
    this.cnapi = opts.cnapi;
    this.napi = opts.napi;
    this.adminUuid = opts.adminUuid;

    this.cacheDir = opts.cacheConfig.dir;
    this.refreshInterval = opts.cacheConfig.refreshIntervalSeconds * 1000;
    this.purgeInterval = opts.cacheConfig.purgeIntervalSeconds * 1000;
    this.maxCacheFileAge = opts.cacheConfig.maxCacheFileAgeSeconds * 1000;
    this.refreshConcurrency = opts.cacheConfig.refreshConcurrency;

    this.refreshStartTime = undefined;
    this.purgeStartTime = undefined;
    // TODO(cburroughs): This should be exposed as a metric for operators to
    // monitor
    this.lastRefreshSuccessTime = undefined;
    this.lastRefreshSuccessful = undefined;
}


CacheSentinel.prototype.start = function start() {
    this.log.info({'adminUuid': this.adminUuid,
                   'cacheDir': this.cacheDir,
                   'refreshInterval': this.refreshInterval,
                   'purgeInterval': this.purgeInterval,
                   'maxCacheFileAge': this.maxCacheFileAge,
                   'refreshConcurrency': this.refreshConcurrency},
                  'starting CacheSentinel');
    this.setNextRefreshTimeout();
    this.setNextPurgeTimeout();
};


CacheSentinel.prototype.setNextRefreshTimeout =
    function setNextRefreshTimeout() {
        const timeout = setTimeout(this.refreshCache.bind(this),
                                   this.refreshInterval);
        timeout.unref();
};


CacheSentinel.prototype.setNextPurgeTimeout = function setNextPurgeTimeout() {
    const timeout = setTimeout(this.purgeCache.bind(this), this.purgeInterval);
    timeout.unref();
};


CacheSentinel.prototype.refreshCache = function refreshCache() {
    this.refreshStartTime = Date.now();
    this.lastRefreshSuccessful = undefined;

    const self = this;
    vasync.pipeline({
        arg: {},
        funcs: [
            function stepListServers(ctx, next) {
                self.cnapi.listServers(function onList(err, servers) {
                    if (err) {
                        return next(new verror.VError(
                            err,
                            'unable to list servers during refresh'));
                    }
                    ctx.servers = servers;
                    return next();
                });
            },
            function stepListNics(ctx, next) {
                self.napi.listNics(
                    {nic_tag: 'admin', belongs_to_type: 'server'},
                    function onList(err, nics) {
                        if (err) {
                            return next(new verror.VError(
                                err,
                                'unable to list nics during refresh'));
                        }
                        ctx.nics = nics;
                        return next();
                    });
            },
            function stepFilterToMacs(ctx, next) {
                const serverUUIDs = ctx.servers.map(function (s) {
                    return s.uuid;
                });
                const currentNics = ctx.nics.filter(
                    function (nic) {
                        return serverUUIDs.indexOf(nic.belongs_to_uuid) > -1;
                    });
                ctx.macs = currentNics.map(function (n) {
                    return n.mac;
                });
                self.log.debug(
                    'found %d current macs ' +
                        'total-servers:%d total-admin nics:%d',
                    ctx.macs.length, serverUUIDs.length, ctx.nics.length);
                next();
            },
            function stepFillCacheViaBootParams(ctx, next) {
                const qErrors = [];
                const queue = vasync.queue(function worker(mac, cb) {
                    mod_bootparams.getBootParams({
                        adminUuid: self.adminUuid,
                        cacheDir: self.cacheDir,
                        mac: mac,
                        napi: self.napi,
                        cnapi: self.cnapi,
                        log: self.log,
                        pipelineTimeout: -1
                    }, cb);
                }, self.refreshConcurrency);
                queue.push(ctx.macs, function qTaskDone(qErr) {
                    if (qErr) {
                        qErrors.push(qErr);
                    }
                });
                queue.on('end', function () {
                    if (qErrors.length) {
                        self.log.error(new verror.MultiError(qErrors),
                                  'error while fetching cache boot params');
                    } else {
                        const now = Date.now();
                        const duration = now - self.refreshStartTime;
                        self.lastRefreshSuccessTime = now;
                        self.lastRefreshSuccessful = true;
                        self.log.info('cache refresh for %d items in %d ms',
                                      ctx.macs.length, duration);
                    }
                    self.setNextRefreshTimeout();
                    next();
                });
                queue.close();
            }
        ]
    }, function pipelineDone(err, results) {
        if (err) {
            self.log.error(err,
                           'error while preparing to refresh cache');
            self.lastRefreshSuccessful = false;
            self.setNextRefreshTimeout();
            return;
        }
    });
};


CacheSentinel.prototype.purgeCache = function purgeCache() {
    this.purgeStartTime = Date.now();

    if (!this.lastRefreshSuccessful) {
        this.log.warn('last refresh failed; delaying purge. Last success at %d',
                      this.lastRefreshSuccessTime);
        this.setNextPurgeTimeout();
        return;
    }

    const self = this;
    const purgedPaths = [];
    const checkAndPurgeCacheFile = function (fpath, cb) {
        fs.stat(fpath, function withStat(err, stats) {
            if (err) {
                return cb(
                    new verror.VError(err, 'error stating file %s', fpath));
            }
            const age = Date.now() - stats.mtime;
            if (age > self.maxCacheFileAge) {
                self.log.debug(
                    'file %s last modifed %d, %d ms old; unlinking',
                    fpath, stats.mtime, age);
                purgedPaths.push(fpath);
                return fs.unlink(fpath, cb);
            }
            return cb();
        });
    };
    fs.readdir(self.cacheDir, function onRead(err, cacheFiles) {
        if (err) {
            self.log.error(err);
            self.setNextPurgeTimeout();
            return;
        }

        vasync.forEachParallel({
            func: checkAndPurgeCacheFile,
            inputs: cacheFiles.map(function (p) {
                return path.join(self.cacheDir, p);
            })
        }, function (err2, results) {
            if (err2) {
                self.log.error(err, 'error during purge process');
            }
            self.log.info({purged: purgedPaths},
                          'purged %d cache entries', purgedPaths.length);
            self.setNextPurgeTimeout();
        });
    });
};


module.exports = {
    CacheSentinel: CacheSentinel
};
