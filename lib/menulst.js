/*
 * Copyright (c) 2012 Joyent Inc., All rights reserved.
 *
 * Writes menu.lst files suitable for booting via tftp
 *
 */

var fs = require('fs');
var format = require('util').format;



/**
 * Adds a serial device to the menu
 */
function addSerial(args, kernel, kargs, module, hash, device, mode) {
  args.push(
    format('title Live 64-bit Serial (%s)', device),
    format('  kernel %s -B %s%sconsole=%s,%s-mode="%s"', kernel, kargs,
      kargs === '' ? '' : ',', device, device, mode),
    format('  module %s', module),
    hash,
    '',
    format('title Live 64-bit Serial (%s) +kmdb', device),
    format('  kernel %s -kd -B %s%sconsole=%s,%s-mode="%s"', kernel, kargs,
      kargs === '' ? '' : ',', device, device, mode),
    format('  module %s', module),
    hash,
    '');
}


/**
 * Adds a VGA device to the menu
 */
function addVGA(args, kernel, kargs, module, hash) {
  args.push(
    'title Live 64-bit',
    format('  kernel %s -B %s', kernel, kargs),
    format('  module %s', module),
    hash,
    '',
    'title Live 64-bit +kmdb',
    format('  kernel %s -kd -B %s', kernel, kargs),
    format('  module %s', module),
    hash,
    '');
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
  var serial = 'ttyb';
  var serial_speed = '115200';
  var default_console = 'vga';
  var serial_unit;

  var result = [
    'default=0',
    'timeout=5',
    'min_mem64 1024'
  ];

  /* we only support either ttya or ttyb or 'none' */
  if (c.hasOwnProperty('serial')) {
    if (c.serial === 'ttya') {
      serial = 'ttya';
    } else if (c.serial === 'none') {
      serial = 'none';
    }
  }

  /* default is 'vga' so only possibly change to 'serial' */
  if (c.hasOwnProperty('default_console') && c.default_console === 'serial' &&
    serial !== 'none') {
    default_console = 'serial';
  }

  /* speed is assumed to be a reasonable value here */
  if (c.hasOwnProperty('serial_speed')) {
    serial_speed = c.serial_speed;
  }

  if (serial === 'ttya') {
    serial_unit = 0;
  } else { // ttyb
    serial_unit = 1;
  }

  if (serial !== 'none') {
    result.push(format('serial --unit=%s --speed=%s --word=8 --parity=no '
      + '--stop=1', serial_unit, serial_speed));
  }

  if (default_console === 'serial') {
    result.push('terminal --timeout=5 serial console');
    result.push('color cyan/blue white/blue');
    result.push('');
    addSerial(result, kernel, kargs, module, hash, serial,
      serial_speed + ',8,n,1,-');
    addVGA(result, kernel, kargs, module, hash);

  } else { // vga
    if (serial !== 'none') {
      result.push('terminal --timeout=5 console serial');
      result.push('color cyan/blue white/blue');
      result.push('');

    } else {
      // no serial, so we can have a Honey Badger!
      result.push('color grey/blue black/blue');
      result.push('splashimage=/joybadger.xpm.gz');
      result.push('');
    }

    addVGA(result, kernel, kargs, module, hash);
    if (serial !== 'none') {
      addSerial(result, kernel, kargs, module, hash, serial,
        serial_speed + ',8,n,1,-');
    }
  }

  /*
   * We deliberately don't append the hash module here even if it exists;
   * this allows booting in case the hash or boot archive has become corrupt.
   */
  result.push(
    'title Live 64-bit Rescue (no importing zpool)',
    format('  kernel %s -B %s%snoimport=true', kernel, kargs,
      kargs === '' ? '' : ','),
    format('  module %s', module),
    '');

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
 * Builds a boot.gpxe for the given mac address and boot params.
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
  var serial = 'ttyb';
  var serial_speed = '115200';
  var default_console = 'vga';
  var result = [ '#!gpxe' ];

  /* we only support either ttya or ttyb or 'none' */
  if (c.hasOwnProperty('serial')) {
    if (c.serial === 'ttya') {
      serial = 'ttya';
    }
  }

  /* default is 'vga' so only possibly change to 'serial' */
  if (c.hasOwnProperty('default_console') && c.default_console === 'serial' &&
    serial !== 'none') {
    default_console = 'serial';
  }

  /* speed is assumed to be a reasonable value here */
  if (c.hasOwnProperty('serial_speed')) {
    serial_speed = c.serial_speed;
  }

  if (default_console === 'serial') {
    result.push(format(
      'kernel tftp://${next-server}%s -B %s%sconsole=%s,%s-mode="%s,8,n,1,-"',
      kernel, kargs, kargs === '' ? '' : ',',
      serial, serial, serial_speed));
  } else {
    result.push(format('kernel tftp://${next-server}%s -B %s', kernel, kargs));
  }

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
