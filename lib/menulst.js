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
    for (var n in c.nic_tags) {
      extra += "," + n + "_nic=" + c.nic_tags[n];
    }

    return (
    [ "default=0"
    , "timeout=5"
    , "min_mem64 1024"
    , "color grey/blue black/blue"
    , "splashimage=/joybadger.xpm.gz"
    , ""
    , "title Live 64-bit"
    , "kernel " + kernel + " -B " + kargs + extra
    , "module " + module
    , ""
    , "title Live 64-bit +kmdb"
    , "  kernel " + kernel + " -kd -B " + kargs + extra
    , "  module " + module
    , ""
    , "title Live 64-bit Serial (ttyb)"
    , "  kernel " + kernel + " -B " + kargs + ',console=ttyb,ttyb-mode="115200,8,n,1,-"' + extra
    , "  module " + module
    , ""
    , "title Live 64-bit Serial (ttyb) +kmdb"
    , "  kernel " + kernel + " -kd -B " + kargs + ',console=ttyb,ttyb-mode="115200,8,n,1,-"' + extra
    , "  module " + module
    , ""
    , "title Live 64-bit Serial (ttya)"
    , "  kernel " + kernel + " -B " + kargs + ',console=ttya,ttya-mode="115200,8,n,1,-"' + extra
    , "  module " + module
    , ""
    , "title Live 64-bit Serial (ttya) +kmdb"
    , "  kernel " + kernel + " -kd -B " + kargs + ',console=ttya,ttya-mode="115200,8,n,1,-"' + extra
    , "  module " + module
    , ""
    , "title Live 64-bit Rescue (no importing zpool)"
    , "  kernel " + kernel + " -B " + kargs + extra + ',noimport=true'
    , "  module " + module
    , ""
    ].join('\n'));
}


buildMenuLst = function(mac, c) {
  if (c.platform.substr(0,4) === "HVM-") {
    return buildHVMMenuLst(mac, c);
  } else {
    return buildSmartOSMenuLst(mac, c);
  }
}

exports.writeMenuLst = function (mac, params, dir, cb) {
  var filename = dir + '/menu.lst.01' + mac.replace(/:/g, '').toUpperCase();
  slog("[" + mac + "] " + "Menu list filename='" + filename + "'");

  var menu = buildMenuLst(mac, params);
  slog("[" + mac + "] " + "menu.lst\n==" + menu + "\n==");
  path.exists(dir, function(exists) {
    if (!exists) {
      fs.mkdirSync(dir, 0775)
    }
    slog("[" + mac + "] " + "About to write menu.lst to '" + filename + "'");
    fs.writeFile(filename, menu, function(err) {
      if (err) throw err;
      cb(null);
    });
  });
}
