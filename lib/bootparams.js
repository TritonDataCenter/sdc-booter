/*
 * Copyright (c) 2012 Joyent Inc., All rights reserved.
 *
 * Gets information from NAPI and CNAPI for booting SDC compute nodes.
 *
 */

var assert = require('assert');

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
function getBootParams(mac, napi, cnapi, log, callback) {
  // - Hit NAPI for nic
  //   - If it doesn't exist, create it
  // - Hit CNAPI for boot params:
  // - /default if it doesn't have belongs_to
  // - /:belongs_to otherwise
  // - Hit NAPI for CN's nics

  var adminUUID = '00000000-0000-0000-0000-000000000000';
  var uuid;
  var nic = null;
  var nics = [];
  var params = null;

  vasync.pipeline({
    'funcs': [
      // Get nic data from NAPI
      function _getNic(_, cb) {
        napi.getNic(mac, function(err, res) {
          if (err) {
            if (err.httpCode == 404) {
              return cb(null);
            }
            return cb(err);
          }

          log.debug({ data: res }, "Got nic from NAPI");
          nic = res;
          nics = [ nic ];
          return cb(null);
        });
      },
      // If the nic doesn't exist, provision it
      function _createNic(_, cb) {
        if (nic != null) {
          return cb(null);
        }

        var postParams = {
          owner_uuid: adminUUID,
          belongs_to_uuid: adminUUID,
          belongs_to_type: 'server',
          mac: mac
        };
        napi.provisionNic('admin', postParams, function(err, res) {
          if (err) {
            return cb(err);
          }

          log.debug({ data: res }, "Got provisioned nic from NAPI");
          nic = res;
          return cb(null);
        });
      },
      // Get boot params from CNAPI
      function _bootParams(_, cb) {
        uuid = nic.belongs_to_uuid;
        if (uuid == adminUUID) {
          uuid = 'default';
          return cb(null);
        }

        cnapi.getBootParams(uuid, function(err, res) {
          if (err) {
            return cb(err);
          }

          log.debug({ data: res }, "Got bootparams from CNAPI");

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
            return cb(err);
          }

          log.debug({ data: res }, "Got default bootparams from CNAPI");
          params = res;
          return cb(null);
        });
      },
      // Get nic tags from NAPI
      function _nicTags(_, cb) {
        var uuid = nic.belongs_to_uuid;
        if (uuid == adminUUID) {
          return cb(null);
        }

        napi.getNics(uuid, function(err, res) {
          if (err) {
            return cb(err);
          }

          log.debug({ data: res }, "Got nics from NAPI");
          nics = nics.concat(res);
          return cb(null);
        });
      }
    ]
  }, function (err, res) {
    if (err) {
      return callback(err);
    }

    params.ip = nic.ip;
    params.netmask = nic.netmask;
    for (var n in nics) {
      var tag = nics[n].nic_tag + '_nic';
      var mac = nics[n].mac;
      params.kernel_args[tag] = mac;
    }

    return callback(null, params);
  });
}


module.exports = {
  createNAPIclient: createNAPIclient,
  createCNAPIclient: createCNAPIclient,
  getBootParams: getBootParams
};
