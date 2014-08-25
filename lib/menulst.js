/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * Writes menu.lst files suitable for booting via tftp
 *
 */

var fs = require('fs');
var format = require('util').format;


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
function addMenuItem(args, title, kernel, kflags, kargs, module, hash) {
    var flags = flagsObjectsToString(kflags);

    args.push(
        'title ' + title,
        format('  kernel$ %s %s-B %s%sconsole=${os_console},'
            + '${os_console}-mode="115200,8,n,1,-"', kernel, flags, kargs,
            kargs === '' ? '' : ','),
        format('  module %s', module));

    if (hash)
        args.push(hash);

    args.push('');
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
function buildMenuLst_impl(c, use_hash, cb) {
    // var kargs_debug = 'prom_debug=true,map_debug=true,kbm_debug=true';
    var kargs_arr = [];
    for (var a in c.kernel_args) {
        kargs_arr.push(a + '=' + c.kernel_args[a]);
    }

    var kargs = kargs_arr.join(',');
    var module = format('/os/%s/platform/i86pc/amd64/boot_archive', c.platform);
    var kernel = format('/os/%s/platform/i86pc/kernel/amd64/unix', c.platform);
    var hash = use_hash ? ('  module ' + module + '.hash') : '';

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
        result.push(format(
            'serial --unit=%s --speed=115200 --word=8 --parity=no '
            + '--stop=1', console_config.serial_unit));
        result.push('terminal composite');
        result.push('color cyan/blue white/blue');
        result.push('');
    }

    var kflags, kernel_flags = c.kernel_flags || {};

    kflags = kernel_flags;
    addMenuItem(result, 'Live 64-bit', kernel, kflags, kargs, module, hash);

    kflags = extend({'-k': true, '-d': true}, kernel_flags);
    addMenuItem(result, 'Live 64-bit +kmdb', kernel, kflags, kargs,
        module, hash);

    /*
     * We deliberately don't append the hash module here even if it exists;
     * this allows booting in case the hash or boot archive has become corrupt.
     */
    kflags = c.kernel_flags || {};
    addMenuItem(result, 'Live 64-bit Rescue (no importing zpool)', kernel,
        kflags, format('%s%snoimport=true', kargs, kargs === '' ? '' : ','),
        module, '');

    return cb(result.join('\n'));
}


function buildMenuLst(c, dir, cb) {
    var hash = dir + '/os/' + c.platform +
        '/platform/i86pc/amd64/boot_archive.hash';

    fs.exists(hash, function (exists) {
        buildMenuLst_impl(c, exists, cb);
    });
}


/**
 * Builds a boot.gpxe for the given mac address and boot params.  Unlike GRUB,
 * ipxe can only support whatever serial port it was built with.  So all we
 * can do here is pass console options to the OS.
 */
function buildGpxeCfg_impl(c, use_hash, cb)  {
    // var kargs_debug = 'prom_debug=true,map_debug=true,kbm_debug=true';
    var kargs_arr = [];
    for (var a in c.kernel_args) {
        kargs_arr.push(a + '=' + c.kernel_args[a]);
    }

    var kargs = kargs_arr.join(',');
    var module = format('/os/%s/platform/i86pc/amd64/boot_archive', c.platform);
    var kernel = format('/os/%s/platform/i86pc/kernel/amd64/unix', c.platform);

    var console_config = getConsoleConfig(c);
    var result = [ '#!gpxe' ];

    var kflags = c.kernel_flags || {};

    result.push(format(
            'kernel tftp://${next-server}%s %s-B '
            + '%s%sconsole=%s,%s-mode="115200,8,n,1,-"',
            kernel, flagsObjectsToString(kflags), kargs, kargs === '' ? '' :
            ',', console_config.default_console,
            console_config.default_console));

    result.push('initrd tftp://${next-server}' + module);
    if (use_hash) {
        result.push('initrd tftp://${next-server}' + module + '.hash');
    }
    result.push('boot');

    return cb(result.join('\n'));
}


function buildGpxeCfg(c, dir, cb) {
    var hash = dir + '/os/' + c.platform +
        '/platform/i86pc/amd64/boot_archive.hash';

    fs.exists(hash, function (exists) {
        buildGpxeCfg_impl(c, exists, cb);
    });
}


/**
 * Writes a menu.lst and boot.gpxe to disk.
 */
function writeMenuLst(mac, params, dir, log, cb) {
    var upperMAC = mac.replace(/:/g, '').toUpperCase();
    var filename = dir + '/menu.lst.01' + upperMAC;
    var gpxeFilename = dir + '/boot.gpxe.01' + upperMAC;

    log.info('menu.lst filename="%s", gPXE config filename="%s"',
            filename, gpxeFilename);

    buildMenuLst(params, dir, function (menu) {
        log.debug('menu.lst contents:\n==\n%s\n==', menu);

        buildGpxeCfg(params, dir, function (gpxeCfg) {
            log.debug('boot.gpxe contents:\n==\n%s\n==', gpxeCfg);

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

                    log.info('Writing boot.gpxe to "%s"', gpxeFilename);
                    fs.writeFile(gpxeFilename, gpxeCfg, function (err2) {
                        if (err2) {
                            log.error(err2, 'Error writing "%s"', gpxeFilename);
                            return cb(err2);
                        }
                        return cb(null);
                    });
                });
            });
        });
    });
}



module.exports = {
    writeMenuLst: writeMenuLst,
    buildMenuLst: buildMenuLst,
    buildGpxeCfg: buildGpxeCfg
};
