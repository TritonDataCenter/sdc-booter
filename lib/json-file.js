/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Joyent, Inc.
 */

/*
 * Read / write JSON files to disk
 */

var assert = require('assert-plus');
var mkdirp = require('mkdirp');
var mod_fs = require('fs');
var mod_vasync = require('vasync');
var path = require('path');



// --- Exports


function readJSONfile(opts, callback) {
    assert.object(opts, 'opts');
    assert.string(opts.dir, 'opts.dir');
    assert.object(opts.log, 'opts.log');
    assert.string(opts.name, 'opts.name');

    var file = path.resolve(opts.dir, opts.name);
    var log = opts.log;

    mod_fs.readFile(file, function (err, data) {
        if (err) {
            log.error(err,
                'readJSONfile: error getting cached params from "%s"', file);
            callback(err);
            return;
        }

        var json_data;
        try {
            json_data = JSON.parse(data);
        } catch (err2) {
            log.error(err2, 'readJSONfile: error parsing JSON from "%s"', file);
            callback(err2);
            return;
        }
        callback(null, json_data);
        return;
    });
}

function writeJSONfile(opts, callback) {
    assert.object(opts, 'opts');
    assert.string(opts.dir, 'opts.dir');
    assert.object(opts.log, 'opts.log');
    assert.string(opts.name, 'opts.name');
    assert.object(opts.payload, 'opts.payload');

    var data;

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
                var file = path.resolve(opts.dir, opts.name);
                data = JSON.stringify(opts.payload, null, 2);
                mod_fs.writeFile(file, data, function (err) {
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
        return callback(err, data);
    });
}


module.exports = {
    write: writeJSONfile,
    read: readJSONfile
};
