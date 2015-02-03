/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Read / write JSON files to disk
 */

var assert = require('assert-plus');
var fmt = require('util').format;
var mkdirp = require('mkdirp');
var mod_fs = require('fs');
var mod_vasync = require('vasync');



// --- Exports



function writeJSONfile(opts, callback) {
    assert.object(opts, 'opts');
    assert.string(opts.dir, 'opts.dir');
    assert.object(opts.log, 'opts.log');
    assert.string(opts.name, 'opts.name');
    assert.object(opts.payload, 'opts.payload');

    mod_vasync.pipeline({
        'funcs': [
            function _mkdir(_, cb) {
                mkdirp(opts.dir, function (err) {
                    if (err) {
                        if (err.code === 'EEXIST') {
                            return cb();
                        }

                        opts.log.error(err, 'Error creating directory "%s"',
                            opts.dir);
                    }

                    return cb(err);
                });
            },

            function _writeFile(_, cb) {
                var file = fmt('%s/%s.json', opts.dir, opts.name);
                mod_fs.writeFile(file, JSON.stringify(opts.payload, null, 2),
                    function (err) {
                    if (err) {
                        opts.log.error(err, 'Error writing "%s"', file);
                        return cb(err);
                    }

                    opts.log.debug('wrote "%s"', file);
                    return cb();
                });
            }
        ]
    }, function (err) {
        return callback(err, opts.payload);
    });
}


module.exports = {
    write: writeJSONfile
};
