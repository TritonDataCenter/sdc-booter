/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2016, Joyent, Inc.
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
    + '-p svp/underlay_ip=%s -p vxlan/listen_ip=%s -p mtu=%d';



// --- Internal



/**
 * Returns true if the nic is an underlay nic
 */
function isUnderlayNic(opts, nic) {
    if (opts.overlay.enabled && opts.overlay.portolan &&
            nic.underlay &&
            opts.overlay.underlayNicTag &&
            opts.overlay.underlayNicTag == nic.nic_tag) {
        return true;
    }

    return false;
}



// --- Exports



function generateNetConfFile(opts) {
    assert.object(opts, 'opts');
    assert.object(opts.log, 'opts.log');
    var name = 'generateNetConfFile: ';

    if (!opts.adminNic) {
        opts.log.info(name + 'No admin nic: returning');
        return;
    }

    opts.log.debug({
        adminNic: opts.adminNic || '<undefined>',
        aggrs: opts.aggrs,
        default_gateway: opts.defaultGateway || '<undefined>',
        dns_domain: opts.dnsDomain || '<undefined>',
        nics: opts.nics || [],
        nictags: opts.nictags,
        opts_hostname: opts.hostname || '<undefined>',
        overlay: opts.overlay || '<undefined>'
    }, 'Generating net conf file');

    var conf = {
        nictags: opts.nictags,
        resolvers: [],
        routes: {},
        vnics: []
    };
    var nics;
    var r;
    var seenMACs = {};

    if (opts.dnsDomain) {
        conf.dns_domain = opts.dnsDomain;
    }

    if (opts.hostname) {
        conf.hostname = opts.hostname;
    }

    if (opts.defaultGateway) {
        conf.default_gateway = opts.defaultGateway;
    }

    // The admin nic is special in a few ways:
    // - It needs to go first in the nics list (in case there are other
    //   vnics over the admin nic tag)
    // - Its resolvers need to be first in the list, so that CN services
    //   try binder before any other resolvers
    // Both of these are solved by moving it to the front of our list.

    nics = (opts.nics || []);
    nics.unshift(opts.adminNic);

    nics.forEach(function (nic) {
        if (seenMACs[nic.mac]) {
            return;
        }

        // routes
        if (nic.hasOwnProperty('routes')) {
            for (r in nic.routes) {
                conf.routes[r] = nic.routes[r];
            }
        }

        seenMACs[nic.mac] = true;

        (nic.nic_tags_provided || []).forEach(function (tagName) {
            opts.nictags.forEach(function (tag) {
                if (tag.name === tagName) {
                    tag.mac = nic.mac;
                }
            });
        });

        // vnics
        if (nic.ip && nic.netmask) {
            if (isUnderlayNic(opts, nic)) {
                conf.nictag_rules = {};
                conf.nictag_rules[opts.overlay.overlayNicTag] =
                    fmt(SDC_NIC_TAG_RULE, opts.overlay.portolan,
                    nic.ip, nic.ip, opts.overlay.defaultOverlayMTU);
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

    // This needs to go after the nics section above, to allow aggrs to
    // override regular nics for nic tags
    if (opts.aggrs) {
        (opts.aggrs || []).forEach(function (aggr) {
            (aggr.nic_tags_provided || []).forEach(function (tagName) {
                opts.nictags.forEach(function (tag) {
                    if (tag.name === tagName) {
                        tag.mac = aggr.name;
                    }
                });
            });
        });

        conf.aggregations = opts.aggrs;
    }

    for (var t in opts.nictags) {
        var aTag = opts.nictags[t];

        // This is a server that has just booted: fall back to setting the
        // admin nic tag's MAC address to it
        if (aTag.name === 'admin') {
            if (conf.vnics.length === 1 && !aTag.mac) {
                aTag.mac = opts.adminNic.mac;
            }

            break;
        }
    }

    return conf;
}


function writeNetConfFile(opts, callback) {
    assert.object(opts, 'opts');
    assert.string(opts.bootFsDir, 'opts.bootFsDir');
    assert.object(opts.log, 'opts.log');

    var adminFound;
    var conf = generateNetConfFile(opts);
    var name = 'writeNetConfFile: ';

    if (!conf) {
        return callback();
    }

    for (var n in conf.nictags) {
        if (conf.nictags[n].name == 'admin') {
            adminFound = true;
            break;
        }
    }

    if (!adminFound) {
        opts.log.error({ adminNic: opts.adminNic, conf: conf, nics: opts.nics },
            name + 'No admin nic tag found: not writing boot-time file');
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
