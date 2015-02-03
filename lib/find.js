/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * Find files in a filesystem
 */

var assert = require('assert-plus');
var find = require('findit');



// --- Exports



/**
 * Find all files under opts.bootFsDir
 */
function findFiles(opts, callback) {
    assert.object(opts, 'opts');
    assert.string(opts.bootFsDir, 'opts.bootFsDir');
    assert.object(opts.log, 'opts.log');
    assert.func(callback, 'callback');

    var finder = find(opts.bootFsDir);
    var netFiles = [];
    var found = [];

    finder.on('file', function (file) {
        var f = file.replace(opts.bootFsDir + '/', '');
        // Move networking.json and networking.json.hash to the
        // front of this list, in case we run into the 16 modules
        // passed to ipxe limit:
        if (f == 'networking.json' || f == 'networking.json.hash') {
            netFiles.push(f);
        } else {
            found.push(f);
        }
    });

    finder.on('error', function (err) {
        // Just log - don't callback with an error
        opts.log.error({ err: err, path: err.path }, 'Error finding file');
    });

    finder.on('end', function _endFind() {
        return callback(null, netFiles.sort().concat(found));
    });
}



module.exports = {
    files: findFiles
};
