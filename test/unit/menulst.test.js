/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2020 Joyent, Inc.
 */

/*
 * menu.lst generation tests
 */


// Ensure we are loading everything from scratch:
Object.keys(require.cache).forEach(function (key) {
    delete require.cache[key];
});

const util = require('util');
const format = util.format;
const mockery = require('mockery');
const mod_mock = require('../lib/mocks');
const mod_node_config = require('../../lib/node-config-file');
const tap = require('tap');

// --- Globals
var menuLst;


const MENU_START = ['default 0', 'timeout 5', 'min_mem64 1024'];
const KERNEL =
    '  kernel$ /os/%s/platform/i86pc/kernel/amd64/unix %s-B %s';
const MODULE = '  module$ /os/%s/platform/i86pc/amd64/boot_archive '
    + 'type=rootfs name=ramdisk';
const TITLE_LIVE = 'title Live 64-bit';
const TITLE_KMDB = 'title Live 64-bit +kmdb';
const TITLE_RESCUE = 'title Live 64-bit Rescue (no importing zpool)';

const IPXE_START = ['#!ipxe'];
const IPXE_INITRD =
    'module tftp://${next-server}/os/%s/platform/i86pc/amd64/boot_archive '
    + 'type=rootfs name=ramdisk';
const IPXE_KERNEL =
    'kernel tftp://${next-server}/os/%s/platform/i86pc/kernel/amd64/unix' +
    ' %s-B %s';



// --- Internal helpers



function keyValArgs(params, sep) {
    if (!params) {
        return '';
    }
    if (!sep) {
        sep = ',';
    }
    return Object.keys(params).map(function (k) {
        return format('%s=%s', k, params[k]);
    }).join(sep);
}


function merge(/* ... */) {
    var args = Array.prototype.slice.call(arguments);
    var res = {};
    args.forEach(function (arg) {
        Object.assign(res, arg);
    });
    return res;
}



// --- Setup



function setUpMocks() {
    mod_mock.register();
    menuLst = require('../../lib/menulst');
    return mod_mock.create();
}

function tearDownMocks() {
    mockery.disable();
}

// --- Tests


tap.test('defaults', function (t) {
    setUpMocks();
    var params = {
        platform: 'latest',
        kernel_args: {
            rabbitmq: 'guest:guest:10.99.99.16:5672'
        },
        ip: '10.99.99.123',
        netmask: '255.255.255.0'
    };
    var conparams = {
        console: '${os_console}',
        '${os_console}-mode': '"115200,8,n,1,-"'
    };
    var ipxe_conparams = {
        console: 'text',
        'text-mode': '"115200,8,n,1,-"'
    };

    var noImportArgs = merge(params.kernel_args, { noimport: 'true' },
        conparams);
    var kArgs = merge(params.kernel_args, conparams);
    var ipxeKArgs = merge(params.kernel_args, ipxe_conparams);

    var fnParams = {
        bootParams: params,
        tftpRoot: '/tmp',
        mac: '00:0c:29:d4:5b:04'
    };

    menuLst.buildMenuLst(fnParams, function (menu) {
        t.deepEqual(menu.split('\n'), MENU_START.concat([
            'variable os_console text',
            'serial --unit=1 --speed=115200 --word=8 --parity=no --stop=1',
            'terminal composite',
            'color cyan/blue white/blue',
            '',
            TITLE_LIVE,
            format(KERNEL, params.platform, '', keyValArgs(kArgs)),
            format(MODULE, params.platform),
            '',
            TITLE_KMDB,
            format(KERNEL, params.platform, '-d -k ', keyValArgs(kArgs)),
            format(MODULE, params.platform),
            '',
            TITLE_RESCUE,
            format(KERNEL, params.platform, '', keyValArgs(noImportArgs)),
            format(MODULE, params.platform),
            ''
        ]), 'menu.lst');

        menuLst.buildIpxeCfg(fnParams, function (cfg) {
            t.deepEqual(cfg.split('\n'), IPXE_START.concat([
                format(IPXE_KERNEL, params.platform, '', keyValArgs(ipxeKArgs)),
                format(IPXE_INITRD, params.platform),
                'boot'
            ]), 'boot.ipxe');
            tearDownMocks();
            t.end();
        });
    });
});


tap.test('defaults with kernel flags', function (t) {
    setUpMocks();
    var params = {
        platform: 'latest',
        kernel_args: {
            rabbitmq: 'guest:guest:10.99.99.16:5672'
        },
        kernel_flags: {
            '-k': true,
            '-x': true,
            '-m': 'milestone=none'
        },
        ip: '10.99.99.123',
        netmask: '255.255.255.0'
    };
    var conparams = {
        console: '${os_console}',
        '${os_console}-mode': '"115200,8,n,1,-"'
    };
    var ipxe_conparams = {
        console: 'text',
        'text-mode': '"115200,8,n,1,-"'
    };

    var noImportArgs = merge(params.kernel_args, { noimport: 'true' },
        conparams);
    var kArgs = merge(params.kernel_args, conparams);
    var ipxeKArgs = merge(params.kernel_args, ipxe_conparams);

    var fnParams = {
        bootParams: params,
        tftpRoot: '/tmp',
        mac: '00:0c:29:d4:5b:04'
    };

    menuLst.buildMenuLst(fnParams, function (menu) {
        t.deepEqual(menu.split('\n'), MENU_START.concat([
            'variable os_console text',
            'serial --unit=1 --speed=115200 --word=8 --parity=no --stop=1',
            'terminal composite',
            'color cyan/blue white/blue',
            '',
            TITLE_LIVE,
            format(KERNEL, params.platform, '-k -m milestone=none -x ',
                   keyValArgs(kArgs)),
            format(MODULE, params.platform),
            '',
            TITLE_KMDB,
            format(KERNEL, params.platform, '-d -k -m milestone=none -x ',
                   keyValArgs(kArgs)),
            format(MODULE, params.platform),
            '',
            TITLE_RESCUE,
            format(KERNEL, params.platform, '-k -m milestone=none -x ',
                   keyValArgs(noImportArgs)),
            format(MODULE, params.platform),
            ''
        ]), 'menu.lst');

        menuLst.buildIpxeCfg(fnParams, function (cfg) {
            t.deepEqual(cfg.split('\n'), IPXE_START.concat([
                format(IPXE_KERNEL, params.platform, '-k -m milestone=none -x ',
                       keyValArgs(ipxeKArgs)),
                format(IPXE_INITRD, params.platform),
                'boot'
            ]), 'boot.ipxe');
            tearDownMocks();
            t.end();
        });
    });
});


tap.test('serial console', function (t) {
    setUpMocks();
    var params = {
        platform: 'some',
        default_console: 'serial',
        serial: 'ttya',
        kernel_args: {
            rabbitmq: 'guest:guest:10.99.99.16:5672'
        },
        ip: '10.99.99.123',
        netmask: '255.255.255.0'
    };
    var conparams = {
        console: '${os_console}',
        '${os_console}-mode': '"115200,8,n,1,-"'
    };
    var ipxe_conparams = {
        console: 'ttya',
        'ttya-mode': '"115200,8,n,1,-"'
    };
    var noImportArgs = merge({ noimport: 'true' }, conparams);

    var fnParams = {
        bootParams: params,
        tftpRoot: '/tmp',
        mac: '00:0c:29:d4:5b:04'
    };

    menuLst.buildMenuLst(fnParams, function (menu) {
        t.deepEqual(menu.split('\n'), MENU_START.concat([
            'variable os_console ttya',
            'serial --unit=0 --speed=115200 --word=8 --parity=no --stop=1',
            'terminal composite',
            'color cyan/blue white/blue',
            '',
            TITLE_LIVE,
            format(KERNEL, params.platform, '',
                keyValArgs(params.kernel_args) + ',' + keyValArgs(conparams)),
            format(MODULE, params.platform),
            '',
            TITLE_KMDB,
            format(KERNEL, params.platform, '-d -k ',
                keyValArgs(params.kernel_args) + ',' + keyValArgs(conparams)),
            format(MODULE, params.platform),
            '',
            TITLE_RESCUE,
            format(KERNEL, params.platform, '',
                keyValArgs(params.kernel_args) + ',' +
                keyValArgs(noImportArgs)),
            format(MODULE, params.platform),
            ''
        ]), 'menu.lst');

        menuLst.buildIpxeCfg(fnParams, function (cfg) {
            t.deepEqual(cfg.split('\n'), IPXE_START.concat([
                format(IPXE_KERNEL, params.platform, '',
                    keyValArgs(merge(params.kernel_args, ipxe_conparams))),
                format(IPXE_INITRD, params.platform),
                'boot'
            ]), 'boot.ipxe');
            tearDownMocks();
            t.end();
        });
    });
});


tap.test('VGA console', function (t) {
    setUpMocks();
    var params = {
        platform: '20121213T212651Z',
        kernel_args: {
            rabbitmq: 'guest:guest:10.99.99.16:5672'
        },
        serial: 'none',
        ip: '10.99.99.123',
        netmask: '255.255.255.0'
    };
    var conparams = {
        console: '${os_console}',
        '${os_console}-mode': '"115200,8,n,1,-"'
    };
    var ipxe_conparams = {
        console: 'text',
        'text-mode': '"115200,8,n,1,-"'
    };
    var noImportArgs = merge({ noimport: 'true' }, conparams);

    var fnParams = {
        bootParams: params,
        tftpRoot: '/tmp',
        mac: '00:0c:29:d4:5b:04'
    };

    menuLst.buildMenuLst(fnParams, function (menu) {
        t.deepEqual(menu.split('\n'), MENU_START.concat([
            'variable os_console text',
            'color grey/blue black/blue',
            'splashimage=/joybadger.xpm.gz',
            '',
            TITLE_LIVE,
            format(KERNEL, params.platform, '',
                keyValArgs(params.kernel_args) + ',' + keyValArgs(conparams)),
            format(MODULE, params.platform),
            '',
            TITLE_KMDB,
            format(KERNEL, params.platform, '-d -k ',
                keyValArgs(params.kernel_args) + ',' + keyValArgs(conparams)),
            format(MODULE, params.platform),
            '',
            TITLE_RESCUE,
            format(KERNEL, params.platform, '',
                keyValArgs(params.kernel_args) + ',' +
                keyValArgs(noImportArgs)),
            format(MODULE, params.platform),
            ''
        ]), 'menu.lst');

        menuLst.buildIpxeCfg(fnParams, function (cfg) {
            t.deepEqual(cfg.split('\n'), IPXE_START.concat([
                format(IPXE_KERNEL, params.platform, '',
                      keyValArgs(merge(params.kernel_args, ipxe_conparams))),
                format(IPXE_INITRD, params.platform),
                'boot'
            ]), 'boot.ipxe');
            tearDownMocks();
            t.end();
        });
    });
});


tap.test('Linux CN', function linuxCN(t) {
    setUpMocks();
    const fnParams = {
        os: 'linux',
        platforms: {
            '20200203T051553Z': {
                os: 'linux'
            }
        },
        bootParams: {
            platform: '20200203T051553Z',
            kernel_args: {
                rabbitmq: 'guest:guest:10.99.99.16:5672',
                debug: 'y'
            },
            ip: '10.99.99.124',
            netmask: '255.255.255.0'
        },
        tftpRoot: '/tmp',
        useHash: true,
        mac: '10:dd:b1:a2:57:bf',
        serverIp: '10.99.99.9'
    };
    const plat = fnParams.bootParams.platform;
    menuLst.buildMenuLst(fnParams, function (menu) {
        t.deepEqual(menu.split('\n'), MENU_START.concat([
            'variable os_console console=ttyS0',
            '',
            'title Live 64-bit',
            format('   kernel$ /os/%s/platform/x86_64/vmlinuz', plat),
            format('   initrd$ /os/%s/platform/x86_64/initrd', plat),
            // format('   module$ /zfs/%s/packages.tar type=file ', plat) +
            // 'name=/packages.tar',
            format('  module$ %s type=file name=etc/%s',
                mod_node_config.bootPath, mod_node_config.fileName),
            ''
        ]), 'menu.lst');
        menuLst.buildIpxeCfg(fnParams, function (cfg) {
            /* BEGIN JSSTYLED */
            /* eslint-disable max-len */
            t.deepEqual(cfg.split('\n'), IPXE_START.concat([
                format('kernel /os/%s/platform/x86_64/vmlinuz ', plat) +
                format('boot=live console=ttyS0 console=tty0 BOOTIF=%s ip=%s:::%s::', '01-10-dd-b1-a2-57-bf', fnParams.bootParams.ip, fnParams.bootParams.netmask) +
                format(' %s fetch=tftp://10.99.99.9/os/%s/platform/x86_64/filesystem.squashfs', keyValArgs(fnParams.bootParams.kernel_args, ' '), plat),
                format('initrd tftp://10.99.99.9/os/%s/platform/x86_64/initrd', plat),
                // 'module --name /packages.tar /zfs/%s/packages.tar',
                format('module tftp://10.99.99.9/os/%s/platform/x86_64/filesystem.squashfs.hash filesystem.squashfs.hash', plat),
                format('module tftp://10.99.99.9/os/%s/platform/x86_64/initrd.hash initrd.hash', plat),
                format('module %s://%s%s /etc/%s', 'tftp', '10.99.99.9', mod_node_config.bootPath, mod_node_config.fileName),
                'boot'
            ]), 'boot.ipxe');
            /* eslint-enable max-len */
            /* END JSSTYLED */
            tearDownMocks();
            t.end();
        });
    });
});
