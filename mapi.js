var resttp = require('./deps/resttp');
var config = require('./config').config;
var sys = require('sys');

exports.getBootParams = function(mac, cb) {
  var mapi = resttp.using(config.mapiUrl).as(config.user, config.password);
  mapi.GET({ pathname: "boot/" + mac }, function(code, body) {
    if ( code == 200 ) {
      cb(JSON.parse(body));
    }
    else {
      mapi.POST({ pathname : "macs", params: { address: mac } }, function(code, body) {
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
};
