/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2020 Joyent, Inc.
 */

/*
 * test code for reading files out of our fake fs mocks
 */

var fmt = require('util').format;
var mod_log = require('./log');
var mod_mocks = require('./mocks');
var mod_server = require('./server');



// --- Globals



var LOG = mod_log.child({ component: 'file' });



// --- Exports


function adminPoolCache() {
    var fs = mod_mocks.getCreated().fs.getRoot();
    var path = mod_server.config().poolCache.dir;
    var name = 'admin_network_pool.json';

    if (!fs.hasOwnProperty(path)) {
        return '';
    }

    if (!fs.hasOwnProperty(path)) {
        LOG.debug({fs: fs, path: path}, 'path does not exist');
        return {};
    }

    if (!fs[path].hasOwnProperty(name)) {
        LOG.debug({fs: fs, path: path},
            'admin_network_pool.json does not exist');
        return {};
    }

    return JSON.parse(fs[path][name]);
}

function cacheFile(mac, val) {
    var name = fmt('%s.json', mac);
    var path = fmt('%s/cache', mod_server.config().tftpRoot);
    if (val) {
        mod_mocks.getCreated().fs.getRoot()[path][name] = val;
        return val;
    }

    return JSON.parse(mod_mocks.getCreated().fs.getRoot()[path][name]);
}

function menuLstFile(mac) {
    var fs = mod_mocks.getCreated().fs.getRoot();
    var name = fmt('menu.lst.01%s',
        mac.replace(/:/g, '').toUpperCase());
    var path = mod_server.config().tftpRoot;

    if (!fs.hasOwnProperty(path)) {
        return '';
    }

    return fs[path][name];
}

function netBootTimeFile(mac) {
    var name = 'networking.json';
    var path = fmt('%s/bootfs/%s', mod_server.config().tftpRoot,
        mac.replace(/:/g, ''));

    var fs = mod_mocks.getCreated().fs.getRoot();
    if (!fs.hasOwnProperty(path)) {
        LOG.debug({ fs: fs, path: path }, 'path does not exist');
        return {};
    }

    if (!fs[path].hasOwnProperty(name)) {
        LOG.debug({ fs: fs, path: path }, 'networking.json does not exist');
        return {};
    }

    return JSON.parse(fs[path][name]);
}


module.exports = {
    adminPoolCache: adminPoolCache,
    cache: cacheFile,
    menuLst: menuLstFile,
    netConfig: netBootTimeFile
};
