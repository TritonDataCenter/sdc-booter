/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2020 Joyent, Inc.
 */

/*
 * Writes menu.lst files suitable for booting via tftp
 *
 */

/* jsl:ignore */
'use strict';
/* jsl:end */

const assert = require('assert-plus');
const fmt = require('util').format;
const fs = require('fs');

const vasync = require('vasync');

const HASH_RE = /^(.*)\.hash$/;

const SMARTOS_KERNEL_FMT = '/os/%s/platform/i86pc/kernel/amd64/unix';
const SMARTOS_RAMDISK_FMT = '/os/%s/platform/i86pc/amd64/boot_archive';

const LINUX_KERNEL_FMT = '/os/%s/platform/x86_64/vmlinuz';
const LINUX_RAMDISK_FMT = '/os/%s/platform/x86_64/initrd';
const LINUX_SQUASHFS_FMT = '/os/%s/platform/x86_64/filesystem.squashfs';

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
            (typeof (v) === 'object' && typeof (v.valueOf()) === 'boolean')) {
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

    if (hash) {
        menu.push(hash);
    }

    if (!opts.disableBootTimeFiles && opts.bootFiles) {
        opts.bootFiles.forEach(function (bf) {
            var fparts = HASH_RE.exec(bf);
            var ftype = 'file';
            var fname = bf;

            if (fparts !== null) {
                fname = fparts[1];
                ftype = 'hash';
            }

            menu.push(fmt('  module$ %s/%s type=%s name=%s',
                opts.bootFsDirRelative, bf, ftype, fname));
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

    if (c.hasOwnProperty('serial')) {
        serial = c.serial;
    }

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
 * Builds a menu.lst for the given mac address and boot params.  dir is the
 * location at which the platform images are located, normally the same as
 * where the menu would be written.
 *
 * @see writeMenuLst for the possible values for @param {object} opts and
 * @param {function} cb details.
 */
function buildMenuLst(opts, cb) {
    var c = opts.bootParams;
    var use_hash = opts.useHash;

    var result = [
        'default 0',
        'timeout 5',
        'min_mem64 1024'
    ];

    /*
     * Intentionally simplified GRUB menu for Linux
     */
    if (opts.os === 'linux') {
        result.push('variable os_console console=ttyS0', '');

        result.push(
            'title Live 64-bit',
            fmt('   kernel$ %s', fmt(LINUX_KERNEL_FMT, c.platform)),
            fmt('   initrd$ %s', fmt(LINUX_RAMDISK_FMT, c.platform))); // ,
        // Not yet
        // fmt('   module$ /zfs/%s/packages.tar type=file name=/packages.tar',
        //    c.platform));

        if (!opts.disableBootTimeFiles && opts.bootFiles) {
            opts.bootFiles.forEach(function (bf) {
                var fparts = HASH_RE.exec(bf);
                var ftype = 'file';
                var fname = bf;

                if (fparts !== null) {
                    fname = fparts[1];
                    ftype = 'hash';
                }

                result.push(fmt('  module$ %s/%s type=%s name=%s',
                    opts.bootFsDirRelative, bf, ftype, fname));
            });
        }
        result.push('');
        return cb(result.join('\n'));
    }

    var kargs_arr = [];
    for (var a in c.kernel_args) {
        kargs_arr.push(a + '=' + c.kernel_args[a]);
    }

    var kargs = kargs_arr.join(',');
    var module = fmt(SMARTOS_RAMDISK_FMT, c.platform);
    var kernel = fmt(SMARTOS_KERNEL_FMT, c.platform);
    var hash = use_hash ?
        ('  module$ ' + module + '.hash type=hash name=ramdisk') : '';

    var console_config = getConsoleConfig(c);
    result.push('variable os_console ' + console_config.default_console);

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

    menuOpts.kflags = Object.assign({'-k': true, '-d': true}, kernel_flags);
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
 * Builds a boot.ipxe for the given mac address and boot params.  Unlike GRUB,
 * iPXE can only support whatever serial port it was built with.  So all we
 * can do here is pass console options to the OS.
 *
 * @see writeMenuLst for the possible values for @param {object} opts and
 * @param {function} cb details.
 *
 */
function buildIpxeCfg(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.mac, 'opts.mac');
    assert.object(opts.bootParams, 'opts.bootParams');

    var c = opts.bootParams;
    assert.object(c.kernel_args, 'c.kernel_args');
    assert.string(c.platform, 'c.platform');
    assert.optionalObject(c.kernel_flags, 'c.kernel_flags');
    assert.string(c.ip, 'c.ip');
    assert.string(c.netmask, 'c.netmask');

    var use_hash = opts.useHash;
    var proto = opts.ipxeHTTP ? 'http' : 'tftp';

    if (!opts.os) {
        opts.os = 'smartos';
    }
    var os = opts.os;

    var kargs_arr = [];
    for (var a in c.kernel_args) {
        kargs_arr.push(a + '=' + c.kernel_args[a]);
    }

    var kargs = kargs_arr.join(',');
    var module = fmt(
        (os === 'smartos') ? SMARTOS_RAMDISK_FMT : LINUX_RAMDISK_FMT,
        c.platform);
    var kernel = fmt(
        (os === 'smartos') ? SMARTOS_KERNEL_FMT : LINUX_KERNEL_FMT,
        c.platform);

    var console_config = getConsoleConfig(c);
    var result = [ '#!ipxe' ];

    var kflags = c.kernel_flags || {};

    if (os === 'smartos') {
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
    } else {
        const squashfs = fmt(LINUX_SQUASHFS_FMT, c.platform);
        const mac_dashed = opts.mac.replace(/:/g, '-');
        result.push(
            // On linux the 'console' option can be specified multiple times,
            // with output going to all of them.
            fmt('kernel %s boot=live console=ttyS0 console=tty0 ' +
                'BOOTIF=01-%s ip=%s:::%s:: fetch=%s://%s%s',
                kernel, mac_dashed, c.ip, c.netmask, proto,
                opts.serverIp, squashfs));

        result.push(fmt('initrd %s://%s%s', proto, opts.serverIp, module));
        // Not yet:
        // result.push(fmt('module --name /packages.tar /zfs/%s/packages.tar',
        //    c.platform));

        if (use_hash) {
            result.push(fmt('module %s://%s%s.hash %s.hash',
                proto, opts.serverIp, squashfs, squashfs));
            result.push(fmt('module %s://%s%s.hash %s.hash',
                proto, opts.serverIp, module, module));
        }
    }


    if (!opts.disableBootTimeFiles && opts.bootFiles &&
        opts.bootFiles.length !== 0 && opts.bootFsDirRelative) {
        opts.bootFiles.forEach(function (bf) {
            var fparts = HASH_RE.exec(bf);
            var ftype = 'file';
            var fname = bf;

            if (fparts !== null) {
                fname = fparts[1];
                ftype = 'hash';
            }

            if (os === 'smartos') {
                result.push(fmt(
                    'module %s://${next-server}%s/%s type=%s name=%s ',
                    proto, opts.bootFsDirRelative, bf, ftype, fname));
            } else {
                result.push(fmt(
                    'module %s://${next-server}%s/%s /etc/triton-%s',
                    proto, opts.bootFsDirRelative, bf, bf));
            }
        });
    }

    result.push('boot');

    return cb(result.join('\n'));
}


/**
 * Writes a menu.lst and boot.ipxe to disk.
 *
 * This function is used from module `lib/boot-files.js#write`.
 * (@see writeBootFiles).
 *
 * @param {object} opts - options including the following members:
 *      - {object} bootParams - @see mod_bootparams.getBootParams.
 *              - {string} ip - IPv4 address assigned to Admin NIC
 *              - {string} netmask - IPv4 net mask associated with ip.
 *              - {string} platform - Current platform version.
 *              - {object} kernel_args
 *              - {object} kernel_flags
 *              - {array} boot_modules
 *              - {array} resolvers - Collection of IPv4 addresses.
 *                (Usually this is just triton's binder IP)
 *      - {object} log - Bunyan log instance.
 *      - {string} tftpRoot - Absolute path to TFTP main directory.
 *      - {string} mac - Mac address of the Admin NIC
 *      - {string} os - Operating system name ("smartos" or "linux"). Optional.
 *        Default 'smartos'.
 *      - {object} platforms - Platforms listing as returned by HTTP request to
 *        `sdc-cnapi /platforms?os=true`. @see bootParams#getBootParams.
 *        Optional.
 *      - {boolean} disableHash - Use or not file hashes for the boot files
 *        included into the generated content. Optional. Default false.
 *      - {boolean} ipxeHTTP - Use HTTP as the default protocol instead of
 *        TFTP. Optional. Default false.
 *      - {string} serverIp - IP the DHCP server is listening to.
 * @param {function} cb - callback with signature `fn(err)`.
 */
function writeMenuLst(opts, cb) {
    assert.object(opts, 'opts');
    assert.object(opts.bootParams, 'opts.bootParams');
    assert.string(opts.bootParams.ip, 'opts.bootParams.ip');
    assert.string(opts.bootParams.netmask, 'opts.bootParams.netmask');
    assert.string(opts.bootParams.platform, 'opts.bootParams.platform');
    assert.object(opts.log, 'opts.log');
    assert.string(opts.tftpRoot, 'opts.tftpRoot');
    assert.string(opts.mac, 'opts.mac');
    assert.string(opts.serverIp, 'opts.serverIp');

    var mac = opts.mac;
    var dir = opts.tftpRoot;
    var log = opts.log;

    var upperMAC = mac.replace(/:/g, '').toUpperCase();
    var filename = dir + '/menu.lst.01' + upperMAC;
    var ipxeFilename = dir + '/boot.ipxe.01' + upperMAC;

    if (opts.platforms) {
        assert.object(opts.platforms, 'opts.platforms');
        if (opts.platforms.hasOwnProperty(opts.bootParams.platform)) {
            opts.os = opts.platforms[opts.bootParams.platform].os;
        }
    }

    if (!opts.os) {
        opts.os = 'smartos';
    }

    log.info('menu.lst filename="%s", boot.ipxe filename="%s"',
            filename, ipxeFilename);

    vasync.pipeline({
        arg: {},
        funcs: [
            function _isHashNeeded(_, next) {
                var hash = fmt('%s' + (
                        opts.os === 'smartos' ?
                            SMARTOS_RAMDISK_FMT :
                            LINUX_RAMDISK_FMT) + '.hash',
                    opts.tftpRoot, opts.bootParams.platform);

                fs.stat(hash, function statCb(err, stat) {
                    opts.useHash = !(err || !stat.isFile() || opts.disableHash);
                    next();
                });
            },
            function _buildMenuLst(arg, next) {
                buildMenuLst(opts, function (menu) {
                    log.debug('menu.lst contents:\n==\n%s\n==', menu);
                    arg.menu = menu;
                    next();
                });
            },
            function _buildIpxeCfg(arg, next) {
                buildIpxeCfg(opts, function (ipxeCfg) {
                    log.debug('boot.ipxe contents:\n==\n%s\n==', ipxeCfg);
                    arg.ipxeCfg = ipxeCfg;
                    next();
                });
            },
            function _createCfgDir(_, next) {
                fs.stat(dir, function statCb(err, stat) {
                    if (!stat.isDirectory()) {
                        next(new Error(fmt(
                            '\'%s\' is not a directory', dir)));
                        return;
                    }
                    if (err) {
                        fs.mkdirSync(dir, '0775');
                        next();
                        return;
                    }
                    next();
                });
            },
            function _writeMenuLst(arg, next) {
                log.info('Writing menu.lst to "%s"', filename);
                fs.writeFile(filename, arg.menu, function (err) {
                    if (err) {
                        log.error(err, 'Error writing "%s"', filename);
                        next(err);
                        return;
                    }
                    next();
                });
            },
            function _writeIpxe(arg, next) {
                log.info('Writing boot.ipxe to "%s"', ipxeFilename);
                fs.writeFile(ipxeFilename, arg.ipxeCfg, function (err2) {
                    if (err2) {
                        log.error(err2, 'Error writing "%s"', ipxeFilename);
                        next(err2);
                        return;
                    }

                    next();
                });
            }
        ]
    }, cb);
}



module.exports = {
    write: writeMenuLst,
    buildMenuLst: buildMenuLst,
    buildIpxeCfg: buildIpxeCfg
};
