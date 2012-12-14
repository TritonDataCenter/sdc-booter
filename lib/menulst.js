/*
 * Copyright (c) 2012 Joyent Inc., All rights reserved.
 *
 * Writes menu.lst files suitable for booting via tftp
 *
 */

var path = require('path');
var fs = require('fs');



/*
 * Adds a serial device to the menu
 */
function addSerial(args, kernel, kargs, module, hash, extra, device, mode)
{
    args.push(
      'title Live 64-bit Serial (' + device + ')'
    , '  kernel ' + kernel + ' -B ' + kargs + ',console=' + device + ',' + device + '-mode="' + mode + '"' + extra
    , '  module ' + module
    , hash
    , ''
    , 'title Live 64-bit Serial (' + device + ') +kmdb'
    , '  kernel ' + kernel + ' -kd -B ' + kargs + ',console=' + device + ',' + device + '-mode="' + mode + '"' + extra
    , '  module ' + module
    , hash
    , ''
    );
    return;
}


/*
 * Adds a VGA device to the menu
 */
function addVGA(args, kernel, kargs, module, hash, extra)
{
    args.push(
      'title Live 64-bit'
    , '  kernel ' + kernel + ' -B ' + kargs + extra
    , '  module ' + module
    , hash
    , ''
    , 'title Live 64-bit +kmdb'
    , '  kernel ' + kernel + ' -kd -B ' + kargs + extra
    , '  module ' + module
    , hash
    , ''
    );
    return;
}


/*
 * Builds a menu.lst for the given mac address and boot params.  dir is the
 * location at which the platform images are located, normally the same as
 * where the menu would be written.
 */
function buildMenuLst_impl(mac, c, use_hash, cb) {
    var kargs_debug = 'prom_debug=true,map_debug=true,kbm_debug=true';
    var kargs_arr = [];
    for (a in c.kernel_args) {
      kargs_arr.push(a + '=' + c.kernel_args[a]);
    }
    var kargs = kargs_arr.join(',');
    var module = '/os/' + c.platform + '/platform/i86pc/amd64/boot_archive';
    var kernel = '/os/' + c.platform + '/platform/i86pc/kernel/amd64/unix';
    var hash = use_hash ? ('  module ' + module + '.hash') : '';
    var extra = '';
    var result;
    var serial = 'ttyb';
    var serial_speed = '115200';
    var default_console = 'vga';
    var serial_unit;

    result = [
      "default=0"
    , "timeout=5"
    , "min_mem64 1024"
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
    if (c.hasOwnProperty('default_console') && c.default_console === 'serial' && serial !== 'none') {
      default_console = 'serial';
    }

    /* speed is assumed to be a reasonable value here */
    if (c.hasOwnProperty('serial_speed')) {
      serial_speed = c.serial_speed;
    }

    if (serial === 'ttya') {
      serial_unit=0
    } else { // ttyb
      serial_unit=1
    }

    if (serial !== 'none') {
      result.push('serial --unit=' + serial_unit + ' --speed=' + serial_speed + ' --word=8 --parity=no --stop=1');
    }

    if (default_console === 'serial') {
      result.push('terminal --timeout=5 serial console');
      result.push('color cyan/blue white/blue');
      result.push('');
      addSerial(result, kernel, kargs, module, hash, extra,
        serial, serial_speed + ',8,n,1,-');
      addVGA(result, kernel, kargs, module, hash, extra);
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
      addVGA(result, kernel, kargs, module, hash, extra);
      if (serial !== 'none') {
        addSerial(result, kernel, kargs, module, hash, extra,
          serial, serial_speed + ',8,n,1,-');
      }
    }

    /*
     * We deliberately don't append the hash module here even if it exists;
     * this allows booting in case the hash or boot archive has become corrupt.
     */
    result.push(
      'title Live 64-bit Rescue (no importing zpool)'
    , '  kernel ' + kernel + ' -B ' + kargs + extra + ',noimport=true'
    , '  module ' + module
    , ''
    );

    cb(result.join('\n'));
}

function buildMenuLst(mac, c, dir, cb) {
    var hash = dir + '/os/' + c.platform +
      '/platform/i86pc/amd64/boot_archive.hash';

    fs.exists(hash, function(exists) {
      buildMenuLst_impl(mac, c, exists, cb);
    });
}

/*
 * Builds a boot.gpxe for the given mac address and boot params.
 */
function buildGpxeCfg_impl(mac, c, use_hash, cb)  {
    var kargs_debug = 'prom_debug=true,map_debug=true,kbm_debug=true';
    var kargs_arr = [];
    for (a in c.kernel_args) {
      kargs_arr.push(a + '=' + c.kernel_args[a]);
    }
    var kargs = kargs_arr.join(',');
    var module = '/os/' + c.platform + '/platform/i86pc/amd64/boot_archive';
    var kernel = '/os/' + c.platform + '/platform/i86pc/kernel/amd64/unix';
    var extra = '';
    var result;
    var serial = 'ttyb';
    var serial_speed = '115200';
    var default_console = 'vga';
    var serial_unit;

    result = [ "#!gpxe" ];

    /* we only support either ttya or ttyb or 'none' */
    if (c.hasOwnProperty('serial')) {
      if (c.serial === 'ttya') {
        serial = 'ttya';
      }
    }

    /* default is 'vga' so only possibly change to 'serial' */
    if (c.hasOwnProperty('default_console') && c.default_console === 'serial' && serial !== 'none') {
      default_console = 'serial';
    }

    /* speed is assumed to be a reasonable value here */
    if (c.hasOwnProperty('serial_speed')) {
      serial_speed = c.serial_speed;
    }

    if (default_console === 'serial') {
      result.push('kernel tftp://${next-server}' + kernel + ' -B ' + kargs +
        ',console=' + serial + ',' + serial + '-mode="' +
        serial_speed + ',8,n,1,-' + '"' + extra);
    } else {
      result.push('kernel tftp://${next-server}' + kernel + ' -B ' + kargs +
        extra);
    }

    result.push('initrd tftp://${next-server}' + module);
    if (use_hash)
      result.push('initrd tftp://${next-server}' + module + '.hash');
    result.push('boot');

    cb(result.join('\n'));
}

function buildGpxeCfg(mac, c, dir, cb) {
    var hash = dir + '/os/' + c.platform +
      '/platform/i86pc/amd64/boot_archive.hash';

    fs.exists(hash, function(exists) {
      buildGpxeCfg_impl(mac, c, exists, cb);
    });
}

/*
 * Writes a menu.lst and boot.gpxe to disk.
 */
function writeMenuLst(mac, params, dir, log, cb) {
  var filename = dir + '/menu.lst.01' + mac.replace(/:/g, '').toUpperCase();
  var gpxeFilename = dir + '/boot.gpxe.01' +
    mac.replace(/:/g, '').toUpperCase();
  log.info("menu.lst filename='%s', gPXE config filename='%s'",
      filename, gpxeFilename);

  buildMenuLst(mac, params, dir, function(menu) {
    log.debug("menu.lst contents:\n==\n%s\n==", menu);

    buildGpxeCfg(mac, params, dir, function(gpxeCfg) {
      log.debug("boot.gpxe contents:\n==\n%s\n==", gpxeCfg);

      fs.exists(dir, function(exists) {
        if (!exists) {
          fs.mkdirSync(dir, 0775)
        }
        log.info("Writing menu.lst to '%s'", filename);
        fs.writeFile(filename, menu, function(err) {
          if (err) {
            log.error(err, "Error writing '%s'", filename);
            return cb(err);
          }

          log.info("Writing boot.gpxe to '%s'", gpxeFilename);
          fs.writeFile(gpxeFilename, gpxeCfg, function(err) {
            if (err) {
              log.error(err, "Error writing '%s'", gpxeFilename);
              return cb(err);
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
