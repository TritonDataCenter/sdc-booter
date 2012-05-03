/*
 * Copyright (c) 2011 Joyent Inc., All rights reserved.
 *
 * Writes menu.lst files suitable for booting via tftp
 *
 */

var slog = require('sys').log,
      path = require('path'),
        fs = require('fs'),

buildHVMMenuLst = function(mac, c) {
    var kargs_arr = [];
    for (a in c.kernel_args) {
      kargs_arr.push(a + '=' + c.kernel_args[a]);
    }
    kargs_arr.push("nosplash");
    kargs_arr.push("rw");
    var kargs = kargs_arr.join(' ');
    var module = '/os/' + c.platform + '/platform/initrd';
    var kernel = '/os/' + c.platform + '/platform/vmlinuz';
    var extra = '';
    for (var n in c.nic_tags) {
      extra += " " + n + "_nic=" + c.nic_tags[n];
    }

    return (
    [ "default=0"
    , "timeout=5"
    , "min_mem64 1024"
    , "color grey/blue black/blue"
    , "splashimage=/joybadger.xpm.gz"
    , ""
    , "title HVM Live 64-bit"
    , "  kernel " + kernel + " " + kargs + extra
    , "  initrd " + module
    , ""
    , "title HVM Live 64-bit Serial (ttyb)"
    , "  kernel " + kernel + " " + kargs + ' console=tty0 console=ttyS1,115200n8' + extra
    , "  initrd " + module
    , ""
    , "title HVM Live 64-bit Serial (ttya)"
    , "  kernel " + kernel + " " + kargs + ' console=tty0 console=ttyS0,115200n8' + extra
    , "  initrd " + module
    , ""
    , "title HVM Live 64-bit Rescue (no mounting LVM)"
    , "  kernel " + kernel + " " + kargs + extra + ' noimport=true'
    , "  initrd " + module
    , ""
    ].join('\n'));
}

function addSerial(args, kernel, kargs, module, extra, device, mode)
{
    args.push(
      'title Live 64-bit Serial (' + device + ')'
    , '  kernel ' + kernel + ' -B ' + kargs + ',console=' + device + ',' + device + '-mode="' + mode + '"' + extra
    , '  module ' + module
    , ''
    , 'title Live 64-bit Serial (' + device + ') +kmdb'
    , '  kernel ' + kernel + ' -kd -B ' + kargs + ',console=' + device + ',' + device + '-mode="' + mode + '"' + extra
    , '  module ' + module
    , ''
    );
    return;
}

function addVGA(args, kernel, kargs, module, extra)
{
    args.push(
      'title Live 64-bit'
    , '  kernel ' + kernel + ' -B ' + kargs + extra
    , '  module ' + module
    , ''
    , 'title Live 64-bit +kmdb'
    , '  kernel ' + kernel + ' -kd -B ' + kargs + extra
    , '  module ' + module
    , ''
    );
    return;
}

buildSmartOSMenuLst = function(mac, c) {
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

    for (var n in c.nic_tags) {
      extra += "," + n + "_nic=" + c.nic_tags[n];
    }

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
      addSerial(result, kernel, kargs, module, extra, serial, serial_speed + ',8,n,1,-');
      addVGA(result, kernel, kargs, module, extra);
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
      addVGA(result, kernel, kargs, module, extra);
      if (serial !== 'none') {
        addSerial(result, kernel, kargs, module, extra, serial, serial_speed + ',8,n,1,-');
      }
    }

    result.push(
      'title Live 64-bit Rescue (no importing zpool)'
    , '  kernel ' + kernel + ' -B ' + kargs + extra + ',noimport=true'
    , '  module ' + module
    , ''
    );

    return (result.join('\n'));
}

buildGpxeCfg = function(mac, c) {
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

    for (var n in c.nic_tags) {
      extra += "," + n + "_nic=" + c.nic_tags[n];
    }

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
    result.push('boot');

    return (result.join('\n'));
};

buildMenuLst = function(mac, c) {
  if (c.platform.substr(0,4) === "HVM-") {
    return buildHVMMenuLst(mac, c);
  } else {
    return buildSmartOSMenuLst(mac, c);
  }
};

exports.writeMenuLst = function (mac, params, dir, cb) {
  var filename = dir + '/menu.lst.01' + mac.replace(/:/g, '').toUpperCase();
  var gpxe_filename = dir + '/boot.gpxe.01' +
    mac.replace(/:/g, '').toUpperCase();
  slog("[" + mac + "] " + "Menu list filename='" + filename + "'");
  slog("[" + mac + "] " + "gPXE config filename='" + gpxe_filename + "'");

  var menu = buildMenuLst(mac, params);
  slog("[" + mac + "] " + "menu.lst\n==\n" + menu + "\n==");
  var gpxe_cfg = buildGpxeCfg(mac, params);
  slog("[" + mac + "] " + "boot.gpxe\n==\n" + gpxe_cfg + "\n==");

  path.exists(dir, function(exists) {
    if (!exists) {
      fs.mkdirSync(dir, 0775)
    }
    slog("[" + mac + "] " + "About to write menu.lst to '" + filename + "'");
    fs.writeFile(filename, menu, function(err) {
      if (err) throw err;
      slog("[" + mac + "] " + "About to write boot.gpxe to '" +
        gpxe_filename + "'");
      fs.writeFile(gpxe_filename, gpxe_cfg, function(err) {
        if (err) throw err;
        cb(null);
      });
    });
  });
}
