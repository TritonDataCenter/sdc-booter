/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * Shared functions
 */

var fmt = require('util').format;
var mod_menulst = require('./menulst');
var mod_bootparams = require('./bootparams');
var mod_find = require('./find');
var mod_net_file = require('./net-file');
var mod_vasync = require('vasync');



// --- Exports



/**
 * Extrace options for passing around the various boot modules
 */
function extractBootOpts(opts) {
    var bootOpts = {
        adminUuid: opts.config.adminUuid,
        cacheDir: opts.config.cache.dir,
        cnapi: opts.cnapi,
        disableHash: opts.config.disableHash || false,
        disableBootTimeFiles: opts.config.disableBootTimeFiles || false,
        ipxeHTTP: opts.config.ipxeHTTP || false,
        log: opts.log,
        napi: opts.napi,
        mac: opts.mac,
        tftpRoot: opts.config.tftpRoot,
        nic_tag: opts.nic_tag,
        adminPoolCache: opts.adminPoolCache
    };

    if (opts.mac) {
        bootOpts.bootFsDir = fmt('%s/bootfs/%s', opts.config.tftpRoot,
                opts.mac.replace(/:/g, ''));
        bootOpts.bootFsDirRelative = fmt('/bootfs/%s',
                opts.mac.replace(/:/g, ''));
        bootOpts.mac = opts.mac;
    }

    if (opts.config.overlay) {
        bootOpts.overlay = opts.config.overlay;
    }

    if (opts.config.dnsDomain) {
        bootOpts.dnsDomain = opts.config.dnsDomain;
    }

    if (opts.config.datacenterName) {
        bootOpts.datacenterName = opts.config.datacenterName;
    }

    return bootOpts;
}


/**
 * Writes out all files necessary to boot a compute node, including:
 * - menu.lst files
 * - boot-time networking config file
 * - boot param cache file
 * - boot params (for generating replies)
 */
function writeBootFiles(opts, callback) {
    var vArg = extractBootOpts(opts);

    mod_vasync.pipeline({
    arg: vArg,
    funcs: [
        // Get the boot params from NAPI / CNAPI
        function _params(arg, cb) {
            mod_bootparams.getBootParams(arg, function (err, res) {
                if (res) {
                    for (var r in res) {
                        arg[r] = res[r];
                    }

                    // If hostname is set, we want to pass that along to
                    // the boot-time file
                    if (res.bootParams && res.bootParams.kernel_args &&
                        res.bootParams.kernel_args.hostname) {
                        arg.hostname = res.bootParams.kernel_args.hostname;
                    }
                }

                return cb(err);
            });
        },

        // Write out networking.json file.
        function _bootTimeFile(arg, cb) {
            mod_net_file.write(arg, function (err) {
                // Don't let this hold up booting - we can always fall back to
                // parameters
                return cb();
            });
        },

        // Make sure networking.json file is in the bootFsDir.
        function _bootFsFiles(arg, cb) {
            mod_find.files(arg, function (err, files) {
                if (err) {
                    arg.log.error({ err: err, bootFsDir: arg.bootFsDir },
                        'Error finding bootfs files');
                    // Don't let this hold up booting - just log and move on
                }

                if (files && files.length !== 0) {
                    arg.bootFiles = files;
                }

                return cb();
            });
        },

        // Write out the menu.lst
        function _menulst(arg, cb) {
            mod_menulst.write(arg, cb);
        }

    ] }, function (err) {
        if (err) {
            return callback(err);
        }

        return callback(null, vArg);
    });
}



module.exports = {
    bootOpts: extractBootOpts,
    writeAll: writeBootFiles
};
