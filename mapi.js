var resttp = require('./deps/resttp'),
    config = require('./config').config,
      slog = require('sys').log,
      path = require('path'),
        fs = require('fs'),
       sys = require('sys');

var paramCache = {};

function logRequest(method, args, code, body) {
  slog("MAPI: " + method + ": returned " + code + "\n" +
      "== args ==\n" + sys.inspect(args) +
      "\n== body ==\n" + sys.inspect(body) + "\n==\n");
}

function logError(err, resp, body) {
  slog("MAPI error\n== err ==\n" + sys.inspect(err) +
       "\n== resp ==\n" + sys.inspect(resp) +
       "\n== body ==\n" + sys.inspect(body) + "\n==\n");
}

getBootParams = function(mac, cb) {
  var mapi = resttp.using(config.mapiUrl).as(config.user, config.password);
  mapi.errcallback = function(err, resp, body) {
    logError(err, resp, body);
    cb(null);
  }

  var getArgs = { pathname: "admin/boot/" + mac };
  mapi.GET(getArgs, function(code, body) {
    logRequest('GET', getArgs, code, body);
    if ( code == 200 ) {
      cb(JSON.parse(body));
    }
    else {
      var postArgs = {
        pathname : "admin/nics",
        params: { address: mac, nic_tag_names: "admin" },
      };
      mapi.POST(postArgs, function(code, body) {
        logRequest('POST', postArgs, code, body);
        if ( code == 201 ) {
          mapi.GET(getArgs, function(code, body) {
            logRequest('GET (2)', getArgs, code, body);
            if ( code == 200 ) {
              cb(JSON.parse(body));
            } else {
              cb(null, JSON.parse(body));
            }
          });
        } else {
            cb(null, JSON.parse(body));
        }
      });
    }
  });
}
exports.getBootParams = getBootParams;

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
    , "  kernel " + kernel + " -kdv -B " + kargs + extra + ',noimport=true'
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

exports.buildMenuLst = buildMenuLst;

exports.writeMenuLst = function (mac, dir, cb) {
  var filename = dir + '/menu.lst.01' + mac.replace(/:/g, '').toUpperCase();
  slog("[" + mac + "] " + "Menu list filename='" + filename + "'");
  getBootParams(mac, function(c) {
    if (c == null) {
      if (mac in paramCache) {
        slog("[" + mac + "] " + "Using cached copy of boot params");
        c = paramCache[mac];
      } else {
        cb(null);
        return;
      }
    } else {
      paramCache[mac] = c;
    }

    var menu = buildMenuLst(mac, c);
    slog("[" + mac + "] " + "menu.lst\n==" + menu + "\n==");
    path.exists(dir, function(exists) {
      if (!exists) {
        fs.mkdirSync(dir, 0775)
      }
      slog("[" + mac + "] " + "About to write to '" + filename + "'");
      fs.writeFile(filename, menu, function(err) {
        if (err) throw err;
        cb(c);
      });
    });
  });
}
