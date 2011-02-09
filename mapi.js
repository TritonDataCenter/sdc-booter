var resttp = require('./deps/resttp'),
    config = require('./config').config,
       sys = require('sys');

getBootParams = function(mac, cb) {
  var mapi = resttp.using(config.mapiUrl).as(config.user, config.password);
  mapi.GET({ pathname: "boot/" + mac }, function(code, body) {
    if ( code == 200 ) {
      cb(JSON.parse(body));
    }
    else {
      mapi.POST({ pathname : "macs", params: { address: mac, physical_network_name: "admin" } }, function(code, body) {
        if ( code == 201 ) {
          mapi.GET({ pathname: "boot/" + mac }, function(code, body) {
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

exports.buildMenuLst = function(mac, cb) {
  getBootParams(mac, function(c) {
    if (c == null) {
      return null;
    }
		var kargs_debug = 'prom_debug=true,map_debug=true,kbm_debug=true';
    var kargs = c.kernel_args;
    var module = c.boot_archive;
    var kernel = c.kernel;
    var extra = '';
    for (var n in c.physical_networks) {
      extra += "," + n + "_nic=" + c.physical_networks[n];
    }

    cb(
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
  });
}

/*
writeGrubConfigs = function(config) {
  var kernel = '/platform/i86pc/kernel/amd64/unix'
  var module = '/platform/i86pc/amd64/boot_archive'
     
  config.nodes.forEach(function(h, idx, arr) {
    var menupath = '/zones/dhcpd/root/tftpboot/' + h.hostname;
    var kargs = "console=text,rabbitmq=" + config.rabbitmq + ",admin_nic=" + h.mac
    var extra = "";
    if (h.external) extra += ",external_nic=" + h.external;
    if (h.internal) extra += ",internal_nic=" + h.internal;
    
    var template = function() {
      return (
      [ "default=0"
      , "timeout=5"
      , "min_mem64 1024"
      , "color cyan/blue white/blue"
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
    path.exists(menupath, function(exists) {
    	if (!exists) {
    		fs.mkdirSync(menupath, 0775)
      } 
      fs.writeFile(menupath + '/menu.lst', template(), function(err) {
      	if (err) throw err;
      });
    });
  });
}
*/
