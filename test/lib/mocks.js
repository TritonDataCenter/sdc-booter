/*
 * Copyright (c) 2012, Joyent, Inc. All rights reserved.
 *
 * mocks for tests
 */




// --- Globals



var LOG = false;



// --- Mock base class


function Mock() {
  this.CALLS = {};
  this.VALUES = {};
}


Mock.prototype._handle = function (name, args, cb) {
  if (!this.CALLS.hasOwnProperty(name)) {
    this.CALLS[name] = [];
  }
  this.CALLS[name].push(args);

  if (!this.VALUES.hasOwnProperty(name)) {
    return cb(new Error(name + ' mock error: no data specified'));
  }

  var nextVal = this.VALUES[name].shift();
  if (!nextVal) {
    return cb(new Error(name + ' mock error: no call data specified'));
  }

  var err = nextVal.err || null;
  var res = nextVal.res;
  if (!err && !res) {
    return cb(new Error(name + ' mock error: no err or res specified'));
  }

  return cb(err, res);
};



// --- bunyan



// --- Setup / Teardown



/**
 * Initialize VALUES to a clean state for each mock
 */
function createMocks() {
  var mocks = {};

  // bunyan

  mocks.bunyan = {
    VALUES: {
      trace: [],
      debug: [],
      error: [],
      warn: [],
      info: []
    },

    _log: function (level, args) {
      if (args.length !== 0) {
        this.VALUES[level].push(args);
        if (LOG) {
          console.error('# %s %j', level, args);
        }
      }
      return true;
    },

    trace: function () { return this._log('trace', arguments); },
    debug: function () { return this._log('debug', arguments); },
    error: function () { return this._log('error', arguments); },
    warn: function () { return this._log('warn', arguments); },
    info: function () { return this._log('info', arguments); }
  };

  // NAPI

  mocks.napi = new Mock();
  mocks.napi.getNic = function (mac, cb) {
    return this._handle('getNic', { mac: mac }, cb);
  };

  mocks.napi.getNics = function (uuid, cb) {
    return this._handle('getNics', { uuid: uuid }, cb);
  };

  mocks.napi.provisionNic = function (network, params, cb) {
    return this._handle('provisionNic',
      { network: network, params: params }, cb);
  };

  mocks.napi.updateNic = function (mac, params, cb) {
    return this._handle('updateNic',
      { mac: mac, params: params }, cb);
  };

  // CNAPI

  mocks.cnapi = new Mock();

  mocks.cnapi.getBootParams = function (uuid, cb) {
    return this._handle('getBootParams',
      { uuid: uuid }, cb);
  };

  // sdc-clients

  mocks.sdcClients = {};

  return mocks;
}



// --- Exports



module.exports = {
  create: createMocks
};
