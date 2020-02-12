/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2020 Joyent, Inc.
 */

/*
 * Read / write boot-time module files
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

const assert = require('assert-plus');
const mkdirp = require('mkdirp');
const vasync = require('vasync');

function generateBootModuleFile(opts, cb) {
    assert.object(opts, 'opts');
    assert.object(opts.log, 'opts.log');
    assert.object(opts.module, 'opts.module');
    assert.string(opts.module.content, 'opts.module.content');
    assert.optionalString(opts.module.type, 'opts.module.type');

    if (opts.module.type !== 'base64') {
        cb(new Error(util.format(
            'Unsupported type %s for module %s',
            opts.module.type, opts.module.path)));
        return;
    }

    cb(null, Buffer.from(
        opts.module.content, 'base64').toString('ascii'));
}

function writeBootModuleFiles(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.bootFsDir, 'opts.bootFsDir');
    assert.object(opts.log, 'opts.log');
    assert.object(opts.bootParams, 'opts.bootParams');
    assert.func(cb, 'cb');

    const bootModules = opts.bootParams.boot_modules;

    if (!bootModules || !bootModules.length) {
        opts.log.warn('No boot modules: returning');
        cb();
        return;
    }

    vasync.pipeline({ funcs: [
        function _mkdir(_, next) {
            mkdirp(opts.bootFsDir, function (err) {
                if (err) {
                    if (err.code === 'EEXIST') {
                        next();
                        return;
                    }

                    opts.log.error(err, 'Error creating directory "%s"',
                        opts.bootFsDir);
                }

                next(err);
            });
        },
        function _writeFiles(_, next) {
            vasync.forEachParallel({
                func: function _generateBootModuleFile(arg, nextMod) {
                    generateBootModuleFile({
                        module: arg,
                        log: opts.log,
                        bootFsDir: opts.bootFsDir
                    }, function genModCb(modErr, moduleContents) {
                        if (modErr) {
                            nextMod(modErr);
                            return;
                        }
                        const file = path.resolve(opts.bootFsDir, arg.path);
                        const filePath = path.dirname(file);
                        opts.log.info({
                            path: filePath, file: file
                        }, 'FILEANDPATH');

                        mkdirp(filePath, function (err) {
                            if (err && err.code !== 'EEXIST') {
                                opts.log.error(err,
                                    'Error creating directory "%s"',
                                    filePath);
                                nextMod(err);
                                return;
                            }

                            fs.writeFile(file, moduleContents, function (fErr) {
                                if (fErr) {
                                    opts.log.error(
                                        fErr, 'Error writing "%s"', file);
                                    nextMod(fErr);
                                    return;
                                }

                                opts.log.debug('wrote "%s"', file);
                                nextMod();
                            });
                        });
                    });
                },
                inputs: bootModules
            }, next);
        }
    ]}, cb);
}

module.exports = {
    generate: generateBootModuleFile,
    write: writeBootModuleFiles
};
