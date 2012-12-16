/*
 * Copyright (c) 2012, Joyent, Inc. All rights reserved.
 *
 * menu.lst generation tests
 */

var format = require('util').format;
var menuLst = require('../lib/menulst');



// --- Globals



// Set this to any of the exports in this file to only run that test,
// plus setup and teardown
var runOne;
var MENU_START = ['default=0', 'timeout=5', 'min_mem64 1024'];
var KERNEL =
    '  kernel /os/%s/platform/i86pc/kernel/amd64/unix %s-B %s';
var MODULE =
    '  module /os/%s/platform/i86pc/amd64/boot_archive';
var TITLE_LIVE = 'title Live 64-bit';
var TITLE_KMDB = 'title Live 64-bit +kmdb';
var TITLE_SERIAL = 'title Live 64-bit Serial (%s)';
var TITLE_SERIAL_KMDB = 'title Live 64-bit Serial (%s) +kmdb';
var TITLE_RESCUE = 'title Live 64-bit Rescue (no importing zpool)';

var GPXE_START = ['#!gpxe'];
var INITRD =
  'initrd tftp://${next-server}/os/%s/platform/i86pc/amd64/boot_archive';
var TFTP =
  'kernel tftp://${next-server}/os/%s/platform/i86pc/kernel/amd64/unix -B %s';


// --- Internal helpers



function keyValArgs(params) {
  if (!params) {
    return '';
  }
  return Object.keys(params).map(function (k) {
    return format('%s=%s', k, params[k]);
  }).join(',');
}


function merge(obj1, obj2) {
  var res = {};
  [obj1, obj2].forEach(function (obj) {
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

  var ttyArgs = merge(params.kernel_args, {
    console: 'ttyb',
    'ttyb-mode': '"115200,8,n,1,-"'
  });

  var noImportArgs = merge(params.kernel_args, { noimport: 'true' });

  menuLst.buildMenuLst(params, '/tmp', function (menu) {
    console.log('here');
    t.deepEqual(menu.split('\n'), MENU_START.concat([
      'serial --unit=1 --speed=115200 --word=8 --parity=no --stop=1',
      'terminal --timeout=5 console serial',
      'color cyan/blue white/blue',
      '',
      TITLE_LIVE,
      format(KERNEL, params.platform, '', keyValArgs(params.kernel_args)),
      format(MODULE, params.platform),
      '',
      '',
      TITLE_KMDB,
      format(KERNEL, params.platform, '-kd ', keyValArgs(params.kernel_args)),
      format(MODULE, params.platform),
      '',
      '',
      format(TITLE_SERIAL, 'ttyb'),
      format(KERNEL, params.platform, '', keyValArgs(ttyArgs)),
      format(MODULE, params.platform),
      '',
      '',
      format(TITLE_SERIAL_KMDB, 'ttyb'),
      format(KERNEL, params.platform, '-kd ', keyValArgs(ttyArgs)),
      format(MODULE, params.platform),
      '',
      '',
      TITLE_RESCUE,
      format(KERNEL, params.platform, '', keyValArgs(noImportArgs)),
      format(MODULE, params.platform),
      ''
    ]), 'menu.lst');

    menuLst.buildGpxeCfg(params, '/tmp', function (cfg) {
      t.deepEqual(cfg.split('\n'), GPXE_START.concat([
        format(TFTP, params.platform, keyValArgs(params.kernel_args)),
        format(INITRD, params.platform),
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
    serial: 'ttya',
    serial_speed: '5400'
  };

  var ttyArgs = {
    console: 'ttya',
    'ttya-mode': '"5400,8,n,1,-"'
  };

  var noImportArgs = { noimport: 'true' };

  menuLst.buildMenuLst(params, '/tmp', function (menu) {
    t.deepEqual(menu.split('\n'), MENU_START.concat([
      'serial --unit=0 --speed=5400 --word=8 --parity=no --stop=1',
      'terminal --timeout=5 serial console',
      'color cyan/blue white/blue',
      '',
      format(TITLE_SERIAL, 'ttya'),
      format(KERNEL, params.platform, '', keyValArgs(ttyArgs)),
      format(MODULE, params.platform),
      '',
      '',
      format(TITLE_SERIAL_KMDB, 'ttya'),
      format(KERNEL, params.platform, '-kd ', keyValArgs(ttyArgs)),
      format(MODULE, params.platform),
      '',
      '',
      TITLE_LIVE,
      format(KERNEL, params.platform, '', ''),
      format(MODULE, params.platform),
      '',
      '',
      TITLE_KMDB,
      format(KERNEL, params.platform, '-kd ', ''),
      format(MODULE, params.platform),
      '',
      '',
      TITLE_RESCUE,
      format(KERNEL, params.platform, '', keyValArgs(noImportArgs)),
      format(MODULE, params.platform),
      ''
    ]), 'menu.lst');

    menuLst.buildGpxeCfg(params, '/tmp', function (cfg) {
      t.deepEqual(cfg.split('\n'), GPXE_START.concat([
        'kernel tftp://${next-server}/os/some/platform/i86pc/kernel/amd64/unix '
        + '-B console=ttya,ttya-mode="5400,8,n,1,-"',
        format(INITRD, params.platform),
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
  var noImportArgs = { noimport: 'true' };

  menuLst.buildMenuLst(params, '/tmp', function (menu) {
    t.deepEqual(menu.split('\n'), MENU_START.concat([
      'color grey/blue black/blue',
      'splashimage=/joybadger.xpm.gz',
      '',
      TITLE_LIVE,
      format(KERNEL, params.platform, '', ''),
      format(MODULE, params.platform),
      '',
      '',
      TITLE_KMDB,
      format(KERNEL, params.platform, '-kd ', ''),
      format(MODULE, params.platform),
      '',
      '',
      TITLE_RESCUE,
      format(KERNEL, params.platform, '', keyValArgs(noImportArgs)),
      format(MODULE, params.platform),
      ''
    ]), 'menu.lst');

    menuLst.buildGpxeCfg(params, '/tmp', function (cfg) {
      t.deepEqual(cfg.split('\n'), GPXE_START.concat([
        format(TFTP, params.platform, keyValArgs(params.kernel_args)),
        format(INITRD, params.platform),
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
