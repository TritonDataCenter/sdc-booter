/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * menu.lst generation tests
 */

var format = require('util').format;
var menuLst = require('../lib/menulst');



// --- Globals



// Set this to any of the exports in this file to only run that test,
// plus setup and teardown
var runOne;
var MENU_START = ['default 0', 'timeout 5', 'min_mem64 1024'];
var KERNEL =
    '  kernel$ /os/%s/platform/i86pc/kernel/amd64/unix %s-B %s';
var MODULE =
        '  module /os/%s/platform/i86pc/amd64/boot_archive';
var TITLE_LIVE = 'title Live 64-bit';
var TITLE_KMDB = 'title Live 64-bit +kmdb';
var TITLE_RESCUE = 'title Live 64-bit Rescue (no importing zpool)';

var GPXE_START = ['#!gpxe'];
var GPXE_INITRD =
    'initrd tftp://${next-server}/os/%s/platform/i86pc/amd64/boot_archive';
var GPXE_HASH = GPXE_INITRD + '.hash';
var GPXE_KERNEL =
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



// --- Tests



exports['defaults'] = function (t) {
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
    var gpxe_conparams = {
        console: 'text',
        'text-mode': '"115200,8,n,1,-"'
    };

    var noImportArgs = merge(params.kernel_args, { noimport: 'true' },
        conparams);
    var kArgs = merge(params.kernel_args, conparams);
    var gpxeKArgs = merge(params.kernel_args, gpxe_conparams);

    menuLst.buildMenuLst(params, '/tmp', function (menu) {
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

        menuLst.buildGpxeCfg(params, '/tmp', function (cfg) {
            t.deepEqual(cfg.split('\n'), GPXE_START.concat([
                format(GPXE_KERNEL, params.platform, '', keyValArgs(gpxeKArgs)),
                format(GPXE_INITRD, params.platform),
                'boot'
            ]), 'boot.gpxe');
            t.done();
        });
    });
};


exports['defaults with kernel flags'] = function (t) {
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
    var gpxe_conparams = {
        console: 'text',
        'text-mode': '"115200,8,n,1,-"'
    };

    var noImportArgs = merge(params.kernel_args, { noimport: 'true' },
        conparams);
    var kArgs = merge(params.kernel_args, conparams);
    var gpxeKArgs = merge(params.kernel_args, gpxe_conparams);

    menuLst.buildMenuLst(params, '/tmp', function (menu) {
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

        menuLst.buildGpxeCfg(params, '/tmp', function (cfg) {
            t.deepEqual(cfg.split('\n'), GPXE_START.concat([
                format(GPXE_KERNEL, params.platform, '-k -m milestone=none -x ',
                       keyValArgs(gpxeKArgs)),
                format(GPXE_INITRD, params.platform),
                'boot'
            ]), 'boot.gpxe');
            t.done();
        });
    });
};


exports['serial console'] = function (t) {
    var params = {
        platform: 'some',
        default_console: 'serial',
        serial: 'ttya'
    };
    var conparams = {
        console: '${os_console}',
        '${os_console}-mode': '"115200,8,n,1,-"'
    };
    var gpxe_conparams = {
        console: 'ttya',
        'ttya-mode': '"115200,8,n,1,-"'
    };
    var noImportArgs = merge({ noimport: 'true' }, conparams);

    menuLst.buildMenuLst(params, '/tmp', function (menu) {
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

        menuLst.buildGpxeCfg(params, '/tmp', function (cfg) {
              t.deepEqual(cfg.split('\n'), GPXE_START.concat([
                  format(GPXE_KERNEL, params.platform, '',
                      keyValArgs(gpxe_conparams)),
                  format(GPXE_INITRD, params.platform),
                  'boot'
              ]), 'boot.gpxe');
              t.done();
        });
    });
};


exports['VGA console'] = function (t) {
    var params = {
        platform: '20121213T212651Z',
        serial: 'none'
    };
    var conparams = {
        console: '${os_console}',
        '${os_console}-mode': '"115200,8,n,1,-"'
    };
    var gpxe_conparams = {
        console: 'text',
        'text-mode': '"115200,8,n,1,-"'
    };
    var noImportArgs = merge({ noimport: 'true' }, conparams);

    menuLst.buildMenuLst(params, '/tmp', function (menu) {
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

        menuLst.buildGpxeCfg(params, '/tmp', function (cfg) {
            t.deepEqual(cfg.split('\n'), GPXE_START.concat([
                format(GPXE_KERNEL, params.platform, '',
                    keyValArgs(gpxe_conparams)),
                format(GPXE_INITRD, params.platform),
                'boot'
            ]), 'boot.gpxe');
            t.done();
        });
    });
};



// Use to run only one test in this file:
if (runOne) {
    module.exports = {
        setUp: exports.setUp,
        oneTest: runOne
    };
}
