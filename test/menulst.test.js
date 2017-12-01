/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2017 Joyent, Inc.
 */

/*
 * menu.lst generation tests
 */

var format = require('util').format;
var menuLst;
var mod_mock = require('./lib/mocks');
var test = require('tape');


// --- Globals



var MENU_START = ['default 0', 'timeout 5', 'min_mem64 1024'];
var KERNEL =
    '  kernel$ /os/%s/platform/i86pc/kernel/amd64/unix %s-B %s';
var MODULE = '  module$ /os/%s/platform/i86pc/amd64/boot_archive '
    + 'type=rootfs name=ramdisk';
var TITLE_LIVE = 'title Live 64-bit';
var TITLE_KMDB = 'title Live 64-bit +kmdb';
var TITLE_RESCUE = 'title Live 64-bit Rescue (no importing zpool)';

var IPXE_START = ['#!ipxe'];
var IPXE_INITRD =
    'module tftp://${next-server}/os/%s/platform/i86pc/amd64/boot_archive '
    + 'type=rootfs name=ramdisk';
var IPXE_HASH = IPXE_INITRD + '.hash';
var IPXE_KERNEL =
    'kernel tftp://${next-server}/os/%s/platform/i86pc/kernel/amd64/unix' +
    ' %s-B %s';



// --- Internal helpers



function keyValArgs(params) {
    if (!params) {
        return '';
    }

    return Object.keys(params).map(function (k) {
        return format('%s=%s', k, params[k]);
    }).join(',');
}


function merge(/* ... */) {
    var res = {};
    var args = Array.prototype.slice.call(arguments);
    args.forEach(function (obj) {
        for (var k in obj) {
            res[k] = obj[k];
        }
    });

    return res;
}



// --- Setup



function setUpMocks() {
    mod_mock.register();

    menuLst = require('../lib/menulst');
    return  mod_mock.create();
}


// --- Tests


test('defaults', function (t) {
    setUpMocks();
    var params = {
        platform: 'latest',
        kernel_args: {
            rabbitmq: 'guest:guest:10.99.99.16:5672'
        }
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
        tftpRoot: '/tmp'
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
            t.end();
        });
    });
});


test('defaults with kernel flags', function (t) {
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
        }
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
        tftpRoot: '/tmp'
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
            t.end();
        });
    });
});


test('serial console', function (t) {
    setUpMocks();
    var params = {
        platform: 'some',
        default_console: 'serial',
        serial: 'ttya'
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
        tftpRoot: '/tmp'
    };

    menuLst.buildMenuLst(fnParams, function (menu) {
        t.deepEqual(menu.split('\n'), MENU_START.concat([
            'variable os_console ttya',
            'serial --unit=0 --speed=115200 --word=8 --parity=no --stop=1',
            'terminal composite',
            'color cyan/blue white/blue',
            '',
            TITLE_LIVE,
            format(KERNEL, params.platform, '', keyValArgs(conparams)),
            format(MODULE, params.platform),
            '',
            TITLE_KMDB,
            format(KERNEL, params.platform, '-d -k ', keyValArgs(conparams)),
            format(MODULE, params.platform),
            '',
            TITLE_RESCUE,
            format(KERNEL, params.platform, '', keyValArgs(noImportArgs)),
            format(MODULE, params.platform),
            ''
        ]), 'menu.lst');

        menuLst.buildIpxeCfg(fnParams, function (cfg) {
              t.deepEqual(cfg.split('\n'), IPXE_START.concat([
                  format(IPXE_KERNEL, params.platform, '',
                      keyValArgs(ipxe_conparams)),
                  format(IPXE_INITRD, params.platform),
                  'boot'
              ]), 'boot.ipxe');
              t.end();
        });
    });
});


test('VGA console', function (t) {
    setUpMocks();
    var params = {
        platform: '20121213T212651Z',
        serial: 'none'
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
        tftpRoot: '/tmp'
    };

    menuLst.buildMenuLst(fnParams, function (menu) {
        t.deepEqual(menu.split('\n'), MENU_START.concat([
            'variable os_console text',
            'color grey/blue black/blue',
            'splashimage=/joybadger.xpm.gz',
            '',
            TITLE_LIVE,
            format(KERNEL, params.platform, '', keyValArgs(conparams)),
            format(MODULE, params.platform),
            '',
            TITLE_KMDB,
            format(KERNEL, params.platform, '-d -k ', keyValArgs(conparams)),
            format(MODULE, params.platform),
            '',
            TITLE_RESCUE,
            format(KERNEL, params.platform, '', keyValArgs(noImportArgs)),
            format(MODULE, params.platform),
            ''
        ]), 'menu.lst');

        menuLst.buildIpxeCfg(fnParams, function (cfg) {
            t.deepEqual(cfg.split('\n'), IPXE_START.concat([
                format(IPXE_KERNEL, params.platform, '',
                    keyValArgs(ipxe_conparams)),
                format(IPXE_INITRD, params.platform),
                'boot'
            ]), 'boot.ipxe');
            t.end();
        });
    });
});
