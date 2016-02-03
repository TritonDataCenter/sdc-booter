/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2016 Joyent, Inc.
 */

/*
 * Writes menu.lst files suitable for booting via tftp
 *
 */

var assert = require('assert-plus');
var fmt = require('util').format;
var fs = require('fs');


/**
 * Using an object of unordered key/value pairs, create an string of parameters
 * (alphabetically sorted). If any flags are created, the string will end with
 * a single space (' ').
 *
 *     { "-m": "milestone=none",
 *       "-k": true,
 *       "-d": true }
 *
 * returns:
 *
 *     "-d -k -m milestone=none "
 */
function flagsObjectsToString(kflags) {
    var flags = '';

    Object.keys(kflags).sort().forEach(function (k) {
        if (flags) {
            flags += ' ';
        }
        var v = kflags[k];
        if (typeof (v) === 'boolean' ||
            (typeof (v) === 'object' && typeof (v.valueOf()) === 'boolean'))
        {
            if (v) {
                flags += k;
            }
        } else {
            flags += k + ' ' + v;
        }
    });

    if (flags) {
        flags += ' ';
    }

    return flags;
}


/**
 * Adds a menu entry (console-independent)
 */
function addMenuItem(menu, opts) {
    var flags = flagsObjectsToString(opts.kflags);
    var hash = opts.hash;
    var kargs = opts.kargs;
    var kernel = opts.kernel;
    var module = opts.module;
    var title = opts.title;

    menu.push(
        'title ' + title,
        fmt('  kernel$ %s %s-B %s%sconsole=${os_console},'
            + '${os_console}-mode="115200,8,n,1,-"', kernel, flags, kargs,
            kargs === '' ? '' : ','),
        fmt('  module$ %s type=rootfs name=ramdisk', module));

    if (hash)
        menu.push(hash);

    if (!opts.disableBootTimeFiles && opts.bootFiles) {
        opts.bootFiles.forEach(function (bf) {
            menu.push(fmt('  module$ %s/%s type=file name=%s',
                opts.bootFsDirRelative, bf, bf));
        });
    }

    menu.push('');
}


/**
 * Determine the values of the boot and OS console device(s) and their
 * attributes from configuration.
 */
function getConsoleConfig(c) {
    var serial = 'ttyb';
    var default_console = 'text';
    var serial_unit = -1;

    if (c.hasOwnProperty('serial'))
        serial = c.serial;

    /* default is 'vga' so only possibly change to 'serial' */
    if (c.hasOwnProperty('default_console') &&
        c.default_console === 'serial' && serial !== 'none') {
        default_console = serial;
    }

    switch (serial) {
    case 'ttya':
        serial_unit = 0;
        break;
    case 'ttyb':
        serial_unit = 1;
        break;
    case 'ttyc':
        serial_unit = 2;
        break;
    case 'ttyd':
        serial_unit = 3;
        break;
    default:
        break;
    }

    return ({
        serial_unit: serial_unit,
        default_console: default_console
    });
}


/**
 * Copy and extend an object, `a`, with another, `b`.
 */
function extend(a, b) {
    var x, clone = {};
    for (x in a) {
        clone[x] = a[x];
    }
    for (x in b) {
        clone[x] = b[x];
    }
    return clone;
}

/**
 * Builds a menu.lst for the given mac address and boot params.  dir is the
 * location at which the platform images are located, normally the same as
 * where the menu would be written.
 */
function buildMenuLst_impl(opts, cb) {
    var c = opts.bootParams;
    var use_hash = opts.useHash;

    var kargs_arr = [];
    for (var a in c.kernel_args) {
        kargs_arr.push(a + '=' + c.kernel_args[a]);
    }

    var kargs = kargs_arr.join(',');
    var module = fmt('/os/%s/platform/i86pc/amd64/boot_archive', c.platform);
    var kernel = fmt('/os/%s/platform/i86pc/kernel/amd64/unix', c.platform);
    var hash = use_hash ?
        ('  module$ ' + module + '.hash type=hash name=ramdisk') : '';

    var console_config = getConsoleConfig(c);
    var result = [
        'default 0',
        'timeout 5',
        'min_mem64 1024',
        'variable os_console ' + console_config.default_console
    ];

    /*
     * This CN is recorded as having no functioning serial port.  Use VGA only
     * and display honey badger.
     */
    if (console_config.serial_unit === -1) {
        result.push('color grey/blue black/blue');
        result.push('splashimage=/joybadger.xpm.gz');
        result.push('');
    } else {
        result.push(fmt(
            'serial --unit=%s --speed=115200 --word=8 --parity=no '
            + '--stop=1', console_config.serial_unit));
        result.push('terminal composite');
        result.push('color cyan/blue white/blue');
        result.push('');
    }

    // Common menu options shared between all menu items:
    var menuOpts = {
        disableBootTimeFiles: opts.disableBootTimeFiles || false,
        kargs: kargs,
        kernel: kernel,
        hash: hash,
        module: module
    };

    if (opts.bootFiles && opts.bootFiles.length !== 0 && opts.bootFsDir) {
        menuOpts.bootFsDirRelative = opts.bootFsDirRelative;
        menuOpts.bootFiles = opts.bootFiles;
    }

    var kernel_flags = c.kernel_flags || {};
    menuOpts.kflags = kernel_flags;
    menuOpts.title = 'Live 64-bit';

    addMenuItem(result, menuOpts);

    menuOpts.kflags = extend({'-k': true, '-d': true}, kernel_flags);
    menuOpts.title = 'Live 64-bit +kmdb';
    addMenuItem(result, menuOpts);

    /*
     * We deliberately don't append the hash module here even if it exists;
     * this allows booting in case the hash or boot archive has become corrupt.
     */
    menuOpts.kflags = c.kernel_flags || {};
    menuOpts.title = 'Live 64-bit Rescue (no importing zpool)';
    menuOpts.hash = '';
    menuOpts.kargs = fmt('%s%snoimport=true', kargs, kargs === '' ? '' : ',');
    delete menuOpts.bootFiles;
    addMenuItem(result, menuOpts);

    return cb(result.join('\n'));
}


/**
 * Build a menu.lst
 */
function buildMenuLst(opts, cb) {
    var hash = fmt('%s/os/%s/platform/i86pc/amd64/boot_archive.hash',
        opts.tftpRoot, opts.bootParams.platform);

    fs.exists(hash, function (exists) {
        opts.useHash = exists;
        if (opts.disableHash) {
            opts.useHash = false;
        }

        buildMenuLst_impl(opts, cb);
    });
}


/**
 * Builds a boot.ipxe for the given mac address and boot params.  Unlike GRUB,
 * iPXE can only support whatever serial port it was built with.  So all we
 * can do here is pass console options to the OS.
 */
function buildIpxeCfg_impl(opts, cb)  {
    var c = opts.bootParams;
    var use_hash = opts.useHash;
    var proto = opts.ipxeHTTP ? 'http' : 'tftp';

    var kargs_arr = [];
    for (var a in c.kernel_args) {
        kargs_arr.push(a + '=' + c.kernel_args[a]);
    }

    var kargs = kargs_arr.join(',');
    var module = fmt('/os/%s/platform/i86pc/amd64/boot_archive', c.platform);
    var kernel = fmt('/os/%s/platform/i86pc/kernel/amd64/unix', c.platform);

    var console_config = getConsoleConfig(c);
    var result = [ '#!ipxe' ];

    var kflags = c.kernel_flags || {};

    result.push([
        fmt('kernel %s://${next-server}%s %s-B ', proto,
            kernel, flagsObjectsToString(kflags)),

        fmt('%s%sconsole=%s,%s-mode="115200,8,n,1,-"',
            kargs,
            kargs === '' ? '' : ',', console_config.default_console,
            console_config.default_console)
    ].join(''));

    result.push(fmt('module %s://${next-server}%s type=rootfs name=ramdisk',
        proto, module));

    if (use_hash) {
        result.push(fmt(
            'module %s://${next-server}%s.hash type=hash name=ramdisk',
            proto, module));
    }

    if (!opts.disableBootTimeFiles && opts.bootFiles &&
        opts.bootFiles.length !== 0 && opts.bootFsDirRelative) {
        opts.bootFiles.forEach(function (bf) {
            result.push(fmt(
                'module %s://${next-server}%s/%s type=file name=%s ',
                proto, opts.bootFsDirRelative, bf, bf));
        });
    }

    result.push('boot');

    return cb(result.join('\n'));
}


function buildIpxeCfg(opts, cb) {
    var hash = fmt('%s/os/%s/platform/i86pc/amd64/boot_archive.hash',
        opts.tftpRoot, opts.bootParams.platform);

    fs.exists(hash, function (exists) {
        opts.useHash = exists;
        if (opts.disableHash) {
            opts.useHash = false;
        }

        buildIpxeCfg_impl(opts, cb);
    });
}


/**
 * Writes a menu.lst and boot.ipxe to disk.
 */
function writeMenuLst(opts, cb) {
    assert.object(opts, 'opts');
    assert.object(opts.bootParams, 'opts.bootParams');
    assert.object(opts.log, 'opts.log');
    assert.string(opts.tftpRoot, 'opts.tftpRoot');
    assert.string(opts.mac, 'opts.mac');

    var mac = opts.mac;
    var dir = opts.tftpRoot;
    var log = opts.log;

    var upperMAC = mac.replace(/:/g, '').toUpperCase();
    var filename = dir + '/menu.lst.01' + upperMAC;
    var ipxeFilename = dir + '/boot.ipxe.01' + upperMAC;

    log.info('menu.lst filename="%s", boot.ipxe filename="%s"',
            filename, ipxeFilename);

    buildMenuLst(opts, function (menu) {
        log.debug('menu.lst contents:\n==\n%s\n==', menu);

        buildIpxeCfg(opts, function (ipxeCfg) {
            log.debug('boot.ipxe contents:\n==\n%s\n==', ipxeCfg);

            fs.exists(dir, function (exists) {
                if (!exists) {
                    fs.mkdirSync(dir, 0775);
                }

                log.info('Writing menu.lst to "%s"', filename);
                fs.writeFile(filename, menu, function (err) {
                    if (err) {
                        log.error(err, 'Error writing "%s"', filename);
                        return cb(err);
                    }

                    log.info('Writing boot.ipxe to "%s"', ipxeFilename);
                    fs.writeFile(ipxeFilename, ipxeCfg, function (err2) {
                        if (err2) {
                            log.error(err2, 'Error writing "%s"', ipxeFilename);
                            return cb(err2);
                        }

                        return cb();
                    });
                });
            });
        });
    });
}



module.exports = {
    write: writeMenuLst,
    buildMenuLst: buildMenuLst,
    buildIpxeCfg: buildIpxeCfg
};
