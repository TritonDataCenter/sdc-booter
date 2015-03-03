/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * Shared functions
 */

var fmt = require('util').format;


// --- Exports



/**
 * Extrace options for passing around the various boot modules
 */
function extractBootOpts(opts) {
    var bootOpts = {
        adminUuid: opts.config.adminUuid,
        cacheDir: fmt('%s/cache', opts.config.tftpRoot),
        cnapi: opts.cnapi,
        disableHash: opts.config.disableHash || false,
        disableBootTimeFiles: opts.config.disableBootTimeFiles || false,
        ipxeHTTP: opts.config.ipxeHTTP || false,
        log: opts.log,
        napi: opts.napi,
        mac: opts.mac,
        tftpRoot: opts.config.tftpRoot
    };

    if (opts.mac) {
        bootOpts.bootFsDir = fmt('%s/bootfs/%s', opts.config.tftpRoot,
                opts.mac.replace(/:/g, ''));
        bootOpts.bootFsDirRelative = fmt('/bootfs/%s',
                opts.mac.replace(/:/g, ''));
    }

    if (opts.config.overlay) {
        bootOpts.overlay = opts.config.overlay;
    }

    if (opts.config.dnsDomain) {
        bootOpts.dnsDomain = opts.config.dnsDomain;
    }

    return bootOpts;
}



module.exports = {
    bootOpts: extractBootOpts
};
