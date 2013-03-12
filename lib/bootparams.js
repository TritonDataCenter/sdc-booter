/*
 * Copyright (c) 2012 Joyent Inc., All rights reserved.
 *
 * Gets information from NAPI and CNAPI for booting SDC compute nodes.
 *
 */

var assert = require('assert');
var fs = require('fs');
var util = require('util');

var vasync = require('vasync');

var NAPI = require('sdc-clients').NAPI;
var CNAPI = require('sdc-clients').CNAPI;



/*
 * Create options for the given client
 */
function createClientOpts(config, api, log) {
  assert.ok(config.hasOwnProperty(api),
    "Config file must have a '" + api + "' section");

  var required = ['url', 'username', 'password'];
  for (var r in required) {
    var req = required[r];
    assert.ok(config[api].hasOwnProperty(req),
      api + " config: '" + req + "' value required");
  }

  var opts = {
    url: config[api].url,
    username: config[api].username,
    password: config[api].password,

  }

  if (log) {
    opts.log = log;
  }
  return opts;
}


/**
 * Stores the boot params in the on-disk cache
 */
function storeInCache(options, callback) {
  var dir = options.dir;
  var log = options.log;
  var mac = options.mac;
  var params = options.params;

  vasync.pipeline({
    'funcs': [
      function _mkdir(_, cb) {
        fs.mkdir(dir, function (err) {
          if (err) {
            if (err.code === 'EEXIST') {
              return cb();
            }

            log.error(err, 'storeInCache: Error creating directory "%s"', dir);
          }

          return cb(err);
        });
      },

      function _writeFile(_, cb) {
        var file = util.format('%s/%s.json', dir, mac);
        fs.writeFile(file, JSON.stringify(params, null, 2), function (err) {
          if (err) {
            log.error(err, 'storeInCache: Error writing "%s"', file);
            return cb(err);
          }

          log.debug('storeInCache: MAC "%s": cached params to "%s"', mac, file);
          return cb();
        });
      }
    ]
  }, function (err) {
    return callback(err, options.params);
  });
}


/**
 * Gets the boot params for a MAC from the on-disk cache
 */
function getFromCache(options, callback) {
  var dir = options.dir;
  var log = options.log;
  var mac = options.mac;
  var originalErr = options.err;

  var file = util.format('%s/%s.json', dir, mac);
  fs.readFile(file, function (err, data) {
    if (err) {
      log.error(err,
        'getFromCache: MAC "%s": error getting cached params from "%s"',
        mac, file);
      return callback(originalErr);
    }

    var params;
    try {
      params = JSON.parse(data);
    } catch (err2) {
      log.error(err2,
        'getFromCache: MAC "%s": error parsing JSON from "%s"',
        mac, file);

      return callback(originalErr);
    }

    log.debug(params, 'getFromCache: MAC "%s": got cached params from "%s"',
      mac, file);
    return callback(null, params);
  });
}


// --- Exported functions



/*
 * Creates a NAPI client
 */
function createNAPIclient(config, log) {
  return new NAPI(createClientOpts(config, "napi", log));
}


/*
 * Creates a CNAPI client
 */
function createCNAPIclient(config, log) {
  return new CNAPI(createClientOpts(config, "cnapi", log));
}


/*
 *
 */
function getBootParams(options, callback) {
  // - Hit NAPI for nic
  //   - If it doesn't exist, create it
  // - Hit CNAPI for boot params:
  // - /default if it doesn't have belongs_to
  // - /:belongs_to otherwise
  // - Hit NAPI for CN's nics

  var cacheDir = options.cacheDir;
  var cnapi = options.cnapi;
  var log = options.log;
  var mac = options.mac;
  var napi = options.napi;

  var adminUUID = '00000000-0000-0000-0000-000000000000';
  var uuid;
  var bootNic = null;
  var nics = [];
  var params = null;

  vasync.pipeline({
    'funcs': [
      // Get nic data from NAPI
      function _getNic(_, cb) {
        napi.getNic(mac, function(err, res) {
          if (err) {
            if (err.httpCode == 404) {
              log.debug('Did not find nic "%s" in NAPI', mac);
              return cb(null);
            }
            log.error(err, 'Error getting nic "%s" from NAPI', mac);
            return cb(err);
          }

          log.debug(res, "Got nic from NAPI");
          bootNic = res;
          nics = [ bootNic ];
          return cb(null);
        });
      },

      // If the nic doesn't have an IP, give it one
      function _provisionIP(_, cb) {
        if (bootNic === null || bootNic.ip) {
          log.debug('Boot nic is null or has an IP: not provisioning');
          return cb(null);
        }

        var putParams = {
          network_uuid: 'admin'
        };

        log.debug(putParams, 'Updating nic "%s" to add IP');
        napi.updateNic(mac, putParams, function (err, res) {
          if (err) {
            log.error({ err: err, params: putParams},
              'Error adding IP to nic "%s" on NAPI', mac);
            return cb(err);
          }

          log.debug(res, 'Updated nic "%s" with IP "%s" in NAPI', mac, res.ip);
          bootNic = res;
          return cb(null);
        });
      },

      // If the nic doesn't exist, provision it
      function _createNic(_, cb) {
        if (bootNic !== null) {
          return cb(null);
        }

        var postParams = {
          owner_uuid: adminUUID,
          belongs_to_uuid: adminUUID,
          belongs_to_type: 'other',
          mac: mac,
          nic_tags_provided: [ 'admin' ]
        };
        napi.provisionNic('admin', postParams, function(err, res) {
          if (err) {
            log.error(err, 'Error provisioning admin nic "%s" on NAPI', mac);
            return cb(err);
          }

          log.debug(res, "Got provisioned nic from NAPI");
          bootNic = res;
          return cb(null);
        });
      },
      // Get boot params from CNAPI
      function _bootParams(_, cb) {
        uuid = bootNic.belongs_to_uuid;
        if (uuid == adminUUID) {
          uuid = 'default';
          return cb(null);
        }

        cnapi.getBootParams(uuid, function(err, res) {
          if (err) {
            log.error(err, 'Error getting %s bootparams from CNAPI', uuid);
            return cb(err);
          }

          log.debug(res, "Got bootparams from CNAPI");

          // If CNAPI didn't know about that UUID, we will need to get the
          // default boot params instead.
          if (Object.keys(res).length == 0) {
            log.warn("empty bootparams: getting default bootparams instead");
            uuid = 'default';
            return cb(null);
          }
          params = res;
          return cb(null);
        });
      },
      // Get default boot params from CNAPI (fallthrough case)
      function _defaultBootParams(_, cb) {
        if (uuid != 'default') {
          return cb(null);
        }

        cnapi.getBootParams(uuid, function(err, res) {
          if (err) {
            log.error(err, 'Error getting default bootparams from CNAPI');
            return cb(err);
          }

          log.debug(res, "Got default bootparams from CNAPI");
          params = res;
          return cb(null);
        });
      },
      // Get nic tags from NAPI
      function _nicTags(_, cb) {
        var uuid = bootNic.belongs_to_uuid;
        if (uuid == adminUUID) {
          return cb(null);
        }

        napi.getNics(uuid, function(err, res) {
          if (err) {
            log.error(err, 'Error getting nics for "%s" from NAPI', uuid);
            return cb(err);
          }

          log.debug(res, 'Got nics for "%s" from NAPI', uuid);
          nics = nics.concat(res);
          return cb(null);
        });
      }
    ]
  }, function (err, res) {
    if (err) {
      return getFromCache({
        dir: cacheDir,
        err: err,
        log: log,
        mac: options.mac
      }, callback);
    }

    if (!bootNic.ip || !bootNic.netmask) {
      var nicErr = new Error('Error: boot nic has no IP or netmask');
      log.error({ err: nicErr, nic: bootNic },
        'Error with boot nic from NAPI');
      return callback(nicErr);
    }

    params.ip = bootNic.ip;
    params.netmask = bootNic.netmask;
    var overridden = {};
    var seen = {};

    // Allow kernel_args from CNAPI to override the nic tag values, but
    // dutifully complain about it
    if (params.kernel_args.hasOwnProperty('admin_nic')) {
      overridden['admin_nic'] = 1;
    }

    for (var n in nics) {
      var nic = nics[n];
      if (!nic.hasOwnProperty('mac') ||
          !nic.hasOwnProperty('nic_tags_provided')) {
        continue;
      }

      var mac = nic.mac;
      if (seen.hasOwnProperty(mac)) {
        continue;
      }

      for (var t in nic.nic_tags_provided) {
        var tag = nic.nic_tags_provided[t] + '_nic';
        if (params.kernel_args.hasOwnProperty(tag)) {
          overridden[tag] = 1;
        } else {
          params.kernel_args[tag] = mac;
        }
      }
      seen[mac] = 1;
    }

    // If we don't have admin nic from NAPI, then set it to the nic
    // we booted from: this is likely the first boot
    if (!params.kernel_args.hasOwnProperty('admin_nic')) {
      params.kernel_args.admin_nic = bootNic.mac;
      seen[bootNic.mac] = 1;
    }

    if (Object.keys(overridden).length !== 0) {
      log.warn('kernel_args: overriding: %j', Object.keys(overridden));
    }

    log.info({ params: params, mac: mac }, 'Boot params generated');
    return storeInCache({
      dir: cacheDir,
      log: log,
      mac: options.mac,
      params: params
    }, callback);
  });
}


module.exports = {
  createNAPIclient: createNAPIclient,
  createCNAPIclient: createCNAPIclient,
  getBootParams: getBootParams
};
