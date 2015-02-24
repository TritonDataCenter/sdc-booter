/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * Read / write boot-time network config files
 */

var assert = require('assert-plus');
var fmt = require('util').format;
var mod_crypto = require('crypto');
var mod_file = require('./json-file');
var mod_fs = require('fs');



// --- Globals



var SDC_NIC_TAG_RULE = '-e vxlan -s svp -p svp/host=%s '
    + '-p svp/underlay_ip=%s -p vxlan/listen_ip=%s';



// --- Exports



function generateNetConfFile(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.log, 'opts.log');

    if (!opts.adminNic) {
        opts.log.info(name + 'No admin nic: returning');
        return;
    }

    if (!opts.nics || opts.nics.length === 0) {
        opts.log.info(name + 'No nics in NAPI: returning');
        return;
    }

    opts.log.debug({
        adminNic: opts.adminNic || '<undefined>',
        aggrs: opts.aggrs,
        dns_domain: opts.dnsDomain || '<undefined>',
        nics: opts.nics,
        opts_hostname: opts.hostname || '<undefined>',
        overlay: opts.overlay || '<undefined>'
    }, 'Generating net conf file');

    var conf = {
        nictags: [],
        resolvers: [],
        routes: {},
        vnics: []
    };
    var name = 'generateNetConfFile: ';
    var r;
    var resolvers = [];
    var seenMACs = {};
    var tags = {};

    if (opts.aggrs) {
        conf.aggregations = opts.aggrs;
    }

    if (opts.dnsDomain) {
        conf.dns_domain = opts.dnsDomain;
    }

    if (opts.hostname) {
        conf.hostname = opts.hostname;
    }

    (opts.nics || []).forEach(function (nic) {
        var isAdmin = false;

        if (seenMACs[nic.mac]) {
            return;
        }

        // nic tags
        (nic.nic_tags_provided || []).forEach(function (tag) {
            tags[tag] = {
                mac: nic.mac
            };

            if (nic.hasOwnProperty('mtu')) {
                tags[tag].mtu = nic.mtu;
            }

            if (tag == 'admin') {
                isAdmin = true;
            }
        });

        // routes
        if (nic.hasOwnProperty('routes')) {
            for (r in nic.routes) {
                conf.routes[r] = nic.routes[r];
            }
        }

        seenMACs[nic.mac] = 1;

        if (isAdmin) {
            return;
        }

        // vnics
        if (nic.ip && nic.netmask) {
            if (opts.overlay && opts.overlay.portolan &&
                    opts.overlay.underlayNicTag &&
                    opts.overlay.underlayNicTag == nic.nic_tag) {
                conf.nictag_rules = {};
                conf.nictag_rules[opts.overlay.overlayNicTag] =
                    fmt(SDC_NIC_TAG_RULE, opts.overlay.portolan,
                    nic.ip, nic.ip);
                nic.overlay_nic_tags_provided = [ opts.overlay.overlayNicTag ];
            }

            conf.vnics.push(nic);
        }

        // resolvers
        (nic.resolvers || []).forEach(function (rs) {
            if (conf.resolvers.indexOf(rs) === -1) {
                conf.resolvers.push(rs);
            }
        });
    });

    tags.admin = {
        mac: opts.adminNic.mac
    };

    if (opts.adminNic.hasOwnProperty('mtu')) {
        tags.admin.mtu = opts.adminNic.mtu;
    }

    if (opts.adminNic.hasOwnProperty('routes')) {
        for (r in opts.adminNic.routes) {
            conf.routes[r] = opts.adminNic.routes[r];
        }
    }

    if (opts.nics.length === 1 && opts.nics[0].belongs_to_type == 'other') {
        // We only have one nic, and we're going to unshift it back onto
        // conf.vnics in the if block below, so prevent it from being
        // double-added to the list:
        conf.vnics = [];
    }

    // The admin nic is special in a few ways:
    // - It needs to go first in the nics list (in case there are other
    //   vnics over the admin nic tag)
    // - Its resolvers need to be first in the list, so that CN services
    //   try binder before any other resolvers

    // Don't pollute the original resolvers array
    (opts.adminNic.resolvers || []).forEach(function (res) {
        if (resolvers.indexOf(res) === -1) {
            resolvers.push(res);
        }
    });

    conf.resolvers.forEach(function (res) {
        if (resolvers.indexOf(res) === -1) {
            resolvers.push(res);
        }
    });

    // XXX: what about resolvers from other networks?
    conf.resolvers = resolvers;
    conf.vnics.unshift(opts.adminNic);

    // Nic tags
    for (var t in tags) {
        tags[t].name = t;
        conf.nictags.push(tags[t]);
    }

    return conf;
}


function writeNetConfFile(opts, callback) {
    assert.object(opts, 'opts');
    assert.string(opts.bootFsDir, 'opts.bootFsDir');
    assert.object(opts.log, 'opts.log');

    var adminMAC;
    var conf = generateNetConfFile(opts);
    var name = 'writeNetConfFile: ';

    if (!conf) {
        return callback();
    }

    for (var n in conf.nictags) {
        if (conf.nictags[n].name == 'admin') {
            adminMAC = conf.nictags[n].mac;
            break;
        }
    }

    if (!adminMAC) {
        opts.log.error({ conf: conf, nics: opts.nics },
            name + 'No admin nic found: not writing boot-time file');
        return callback();
    }

    mod_file.write({
        dir: opts.bootFsDir,
        log: opts.log,
        name: 'networking',
        payload: conf
    }, function (fErr) {
        if (fErr) {
            return callback(fErr);
        }

        // Now write the hash file for the json file
        var digest;
        var hashName = fmt('%s/networking.json.hash', opts.bootFsDir);
        var sha1 = mod_crypto.createHash('sha1');

        // XXX: should really get mod_file.write() to return the actual
        // string it wrote:
        sha1.update(JSON.stringify(conf, null, 2));
        digest = sha1.digest('hex');
        opts.log.info({
            file: hashName,
            sha1: digest
        }, 'Writing networking hash');

        return mod_fs.writeFile(hashName, digest, callback);
    });
}


module.exports = {
    generate: generateNetConfFile,
    write: writeNetConfFile
};
