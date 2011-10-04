var resttp = require('resttp'),
    config = require('../config').config,
       sys = require('sys'),
      slog = sys.log;

function Mapi() {
  this.paramCache = {};
  this.client = resttp.using(config.mapiUrl).as(config.user, config.password);
  this.logging = true;
}
exports.Mapi = Mapi;


Mapi.prototype.logRequest = function(method, args, code, body) {
  if (!this.logging) {
    return;
  }
  slog("MAPI: " + method + ": returned " + code + "\n" +
      "== args ==\n" + sys.inspect(args) +
      "\n== body ==\n" + sys.inspect(body) + "\n==\n");
}


Mapi.prototype.logError = function(err, resp, body) {
  if (!this.logging) {
    return;
  }
  slog("MAPI error\n== err ==\n" + sys.inspect(err) +
       "\n== resp ==\n" + sys.inspect(resp) +
       "\n== body ==\n" + sys.inspect(body) + "\n==\n");
}

Mapi.prototype.log = function(str) {
  if (!this.logging) {
    return;
  }
  slog(str);
}

Mapi.prototype.parseJSON = function (body) {
  try {
    var json = JSON.parse(body);
  } catch (err) {
    this.log("Error parsing JSON: " + err + "\n== json ==\n" + body + "\n==\n");
    return null;
  }
  return json;
}


Mapi.prototype.getBootParams = function(mac, previousIp, cb) {
  var self = this;
  this.client.errcallback = function(err, resp, body) {
    self.logError(err, resp, body);
    cb(null, body);
  }

  var getArgs = { pathname: "admin/boot/" + mac };
  if (previousIp != "0.0.0.0") {
    getArgs['ip'] = previousIp;
  }

  this.client.GET(getArgs, function(code, body) {
    self.logRequest('GET', getArgs, code, body);
    if (code == 200) {
      return cb(self.parseJSON(body));
    }

    // 404 means "I don't know about that MAC address yet."  Anything else is
    // an error.
    if (code != 404) {
      self.log("ERROR: MAPI returned code " + code + ".  Not POSTing MAC address.");
      if (mac in self.paramCache) {
        slog("[" + mac + "] " + "Using cached copy of boot params");
        return cb(self.paramCache[mac])
      }
      return cb(null, body);
    }
    // XXX: If 404, should delete the mac out of the param cache

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
          return cb(null, body);
        });
      } else {
          return cb(null, body);
      }
    });
  });
}

