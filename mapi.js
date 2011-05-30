var resttp = require('resttp'),
    config = require('./config').config,
      slog = require('sys').log,
      path = require('path'),
        fs = require('fs'),
       sys = require('sys');

function Mapi() {
  this.paramCache = {};
  this.client = resttp.using(config.mapiUrl).as(config.user, config.password);
  this.log = true;
}
exports.Mapi = Mapi;


Mapi.prototype.logRequest = function(method, args, code, body) {
  if (!this.log) {
    return;
  }
  slog("MAPI: " + method + ": returned " + code + "\n" +
      "== args ==\n" + sys.inspect(args) +
      "\n== body ==\n" + sys.inspect(body) + "\n==\n");
}


Mapi.prototype.logError = function(err, resp, body) {
  if (!this.log) {
    return;
  }
  slog("MAPI error\n== err ==\n" + sys.inspect(err) +
       "\n== resp ==\n" + sys.inspect(resp) +
       "\n== body ==\n" + sys.inspect(body) + "\n==\n");
}


Mapi.prototype.parseJSON = function (body) {
  try {
    var json = JSON.parse(body);
  } catch (err) {
    if (this.log) {
      slog("Error parsing JSON: " + err + "\n== json ==\n" + body + "\n==\n");
    }
    return null;
  }
  return json;
}


Mapi.prototype.getBootParams = function(mac, cb) {
  var self = this;
  this.client.errcallback = function(err, resp, body) {
    self.logError(err, resp, body);
    cb(null);
  }

  var getArgs = { pathname: "admin/boot/" + mac };
  this.client.GET(getArgs, function(code, body) {
    self.logRequest('GET', getArgs, code, body);
    if (code == 200) {
      return cb(self.parseJSON(body));
    }

    var postArgs = {
      pathname : "admin/nics",
      params: { address: mac, nic_tag_names: "admin" },
    };
    self.client.POST(postArgs, function(code, body) {
      self.logRequest('POST', postArgs, code, body);
      if (code == 201) {
        self.client.GET(getArgs, function(code, body) {
          self.logRequest('GET (2)', getArgs, code, body);
          if (code == 200) {
            return cb(self.parseJSON(body));
          }
          return cb(null);
        });
      } else {
          return cb(null);
      }
    });
  });
}


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


Mapi.prototype.buildMenuLst = function(mac, c) {
  if (c.platform.substr(0,4) === "HVM-") {
    return buildHVMMenuLst(mac, c);
  } else {
    return buildSmartOSMenuLst(mac, c);
  }
}


Mapi.prototype.writeMenuLst = function (mac, dir, cb) {
  var self = this;
  var filename = dir + '/menu.lst.01' + mac.replace(/:/g, '').toUpperCase();
  slog("[" + mac + "] " + "Menu list filename='" + filename + "'");
  this.getBootParams(mac, function(c) {
    if (c == null) {
      if (mac in self.paramCache) {
        slog("[" + mac + "] " + "Using cached copy of boot params");
        c = self.paramCache[mac];
      } else {
        cb(null);
        return;
      }
    } else {
      self.paramCache[mac] = c;
    }

    var menu = self.buildMenuLst(mac, c);
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
