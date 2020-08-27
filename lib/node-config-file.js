/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2020 Joyent, Inc.
 */

/* jsl:ignore */
'use strict';
/* jsl:end */

const fs = require('fs');
const util = require('util');

const assert = require('assert-plus');
const mkdirp = require('mkdirp');
const vasync = require('vasync');

const NODE_CONFIG_FNAME = 'node.config';
const NODE_CONFIG_DIR = 'extra';

function getNodeConfigFile(opts, cb) {
    assert.object(opts, 'opts');
    assert.object(opts.assets, 'opts.assets');
    assert.string(opts.tftpRoot, 'opts.tftpRoot');
    assert.object(opts.log, 'opts.log');
    assert.func(cb, 'cb');

    var assets = opts.assets;
    var log = opts.log;

    const fPath = util.format('%s/%s/%s', opts.tftpRoot,
        NODE_CONFIG_DIR, NODE_CONFIG_FNAME);

    vasync.pipeline({
        arg: {},
        funcs: [
            function _getFromAssets(args, next) {
                assets.get('/extra/joysetup/node.config',
                    function getNodeConfigCb(err, req, res, obj) {
                    if (err) {
                        log.error(err,
                            'Error getting node.config from Assets');
                        // Do not fail yet, we may have it downloaded from
                        // a previous request
                        next();
                        return;
                    }
                    args.lastmod = new Date(res.headers['last-modified']);
                    args.contents = obj;
                    next();
                });
            },
            function _checkLocalFile(args, next) {
                getNodeConfigFileLastModDate(opts, function ckCb(err, lastm) {
                    if (!args.contents) {
                        // No local file and no contents available through HTTP
                        if (err) {
                            next(err);
                            return;
                        }
                        if (lastm === new Date(0)) {
                            next(new Error({
                                code: 'ENOENT',
                                message: util.format(
                                    'File %s does not exist', fPath)
                            }));
                            return;
                        }
                    }
                    if (lastm < args.lastmod) {
                        args.updateNeeded = true;
                    }
                    next();
                });
            },
            function _writeFileIfNeeded(args, next) {
                if (!args.updateNeeded) {
                    next();
                    return;
                }
                writeNodeConfigFile(Object.assign({
                    payload: args.contents
                }, opts), next);
            }
        ]
    }, cb);
}


function getNodeConfigFileLastModDate(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.tftpRoot, 'opts.tftpRoot');
    assert.func(cb, 'cb');

    var fPath = util.format('%s/%s/%s', opts.tftpRoot,
        NODE_CONFIG_DIR, NODE_CONFIG_FNAME);

    fs.stat(fPath, function stCb(err, stats) {
        if (err) {
            if (err.code === 'ENOENT') {
                var lastmod = new Date(0);
                cb(null, lastmod);
                return;
            }
            cb(err);
            return;
        }
        cb(null, new Date(stats.mtime));
    });
}

function writeNodeConfigFile(opts, cb) {
    assert.object(opts, 'opts');
    assert.object(opts.log, 'opts.log');
    assert.string(opts.payload, 'opts.payload');
    assert.string(opts.tftpRoot, 'opts.tftpRoot');
    assert.func(cb, 'cb');

    const dirname = util.format('%s/%s', opts.tftpRoot, NODE_CONFIG_DIR);
    const fPath = util.format('%s/%s', dirname, NODE_CONFIG_FNAME);

    vasync.pipeline({
        'funcs': [
            function _mkdir(_, next) {
                mkdirp(dirname, function mkdirCb(err) {
                    if (err) {
                        if (err.code === 'EEXIST') {
                            next();
                            return;
                        }
                        opts.log.error(err, 'Error creating directory "%s"',
                            opts.dir);
                    }
                    next(err);
                    return;
                });
            },
            function _writeFile(_, next) {
                fs.writeFile(fPath, opts.payload, function writeFileCb(err) {
                    if (err) {
                        opts.log.error(err, 'Error writing "%s"', fPath);
                        next(err);
                        return;
                    }
                    opts.log.debug('wrote "%s"', fPath);
                    next();
                });
            }
        ]
    }, cb);
}


module.exports = {
    getNodeConfig: getNodeConfigFile,
    dirName: NODE_CONFIG_DIR,
    fileName: NODE_CONFIG_FNAME,
    bootPath: util.format('/%s/%s', NODE_CONFIG_DIR, NODE_CONFIG_FNAME)
};
