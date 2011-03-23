var resttp = require('./deps/resttp'),
    config = require('./config').config,
      path = require('path'),
        fs = require('fs'),
       sys = require('sys');

function logRequest(method, args, code, body) {
  console.log("MAPI: " + method + ": returned " + code + "\n" +
      "== args ==\n" + sys.inspect(args) +
      "\n== body ==\n" + sys.inspect(body) + "\n==\n");
}

getBootParams = function(mac, cb) {
  var mapi = resttp.using(config.mapiUrl).as(config.user, config.password);
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

buildMenuLst = function(mac, c) {
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
exports.buildMenuLst = buildMenuLst


exports.writeMenuLst = function (mac, dir, cb) {
  var filename = dir + '/menu.lst.01' + mac.replace(/:/g, '').toUpperCase();
  console.log("Writing " + filename);
  getBootParams(mac, function(c) {
    if (c == null) {
      return null;
    }
    var menu = buildMenuLst(mac, c);
    console.log("MENU LST\n==" + menu + "\n==");
    path.exists(dir, function(exists) {
      if (!exists) {
        fs.mkdirSync(dir, 0775)
      }
      console.log("about to write to " + filename);
      fs.writeFile(filename, menu, function(err) {
        if (err) throw err;
        cb(c);
      });
    });
  });
}
