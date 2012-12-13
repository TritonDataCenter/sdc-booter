/*
 * Copyright (c) 2012, Joyent, Inc. All rights reserved.
 *
 * bootparams tests
 */

var bp;
var clone = require('clone');
var mockery = require('mockery');
var mod_mock = require('./lib/mocks');
var util = require('util');



// --- Globals



// Set this to any of the exports in this file to only run that test,
// plus setup and teardown
var runOne;

var CN1_NICS = [
  {
    "belongs_to_type": "server",
    "belongs_to_uuid": "564d5535-52f0-f2ac-72e5-bca4d1d45bfa",
    "mac": "00:0c:29:d4:5b:04",
    "owner_uuid": "00000000-0000-0000-0000-000000000000",
    "primary": false,
    "ip": "10.88.88.134",
    "netmask": "255.255.255.0",
    "gateway": "10.88.88.2",
    "vlan_id": 0,
    "nic_tag": "external",
    "resolvers": [
      "8.8.8.8",
      "8.8.4.4"
    ],
    "network_uuid": "09e94670-08f5-4c06-883b-bc43b24862ef",
    "nic_tags_provided": [
      "external"
    ]
  },
  {
    "belongs_to_type": "server",
    "belongs_to_uuid": "564d5535-52f0-f2ac-72e5-bca4d1d45bfa",
    "mac": "00:0c:29:d4:5b:fa",
    "owner_uuid": "00000000-0000-0000-0000-000000000000",
    "primary": false,
    "ip": "10.99.99.78",
    "netmask": "255.255.255.0",
    "vlan_id": 0,
    "nic_tag": "admin",
    "resolvers": [
      "8.8.8.8",
      "8.8.4.4"
    ],
    "network_uuid": "e491b841-4fc3-4502-bf95-2935f4c2f42a",
    "nic_tags_provided": [
      "admin"
    ]
  }
];

var CN1_BOOT_PARAMS = {
  platform: '20121203T051553Z',
  kernel_args: {
    rabbitmq: 'guest:guest:10.99.99.16:5672',
    hostname: '00-0c-29-d4-5b-fa',
    other_param: 'buzz'
  }
};

var DEFAULT_BOOT_PARAMS = {
  platform: 'latest',
  kernel_args: {
    rabbitmq: 'guest:guest:10.99.99.16:5672'
  }
};

var mocks;
var MOCKS_REGISTERED = false;



// --- Internal helpers



function error404() {
  var err = new Error('404');
  err.httpCode = 404;
  return err;
}



// --- Setup



// run before every test
exports.setUp = function (cb) {
  mocks = mod_mock.create();

  mockery.enable();

  if (!MOCKS_REGISTERED) {
    mockery.registerMock('sdc-clients', mocks.sdcClients);

    [
      'assert',
      'extsprintf',
      'util',
      'vasync',
      'verror',
      '../lib/bootparams'
    ].forEach(function (mod) {
      mockery.registerAllowable(mod);
    });

    bp = require('../lib/bootparams');
    MOCKS_REGISTERED = true;
  }
  cb();
};



// --- Tests



exports['new CN boots'] = function (t) {
  var newNic = {
    belongs_to_type: 'other',
    belongs_to_uuid: '00000000-0000-0000-0000-000000000000',
    mac: '06:b7:ad:86:be:04',
    owner_uuid: '00000000-0000-0000-0000-000000000000',
    primary: false,
    ip: '10.99.99.127',
    netmask: '255.255.255.0',
    vlan_id: 0,
    nic_tag: 'admin',
    resolvers: [ '8.8.8.8', '10.99.99.254' ],
    network_uuid: 'e491b841-4fc3-4502-bf95-2935f4c2f42a'
  };

  mocks.napi.VALUES = {
    getNic: [ { err: error404() } ],
    provisionNic: [ { res: newNic } ]
  };

  mocks.cnapi.VALUES = {
    getBootParams: [ { res: clone(DEFAULT_BOOT_PARAMS) } ]
  };

  bp.getBootParams(newNic.mac, mocks.napi, mocks.cnapi, mocks.bunyan,
    function (err, res) {
    t.ifError(err);

    var params = clone(DEFAULT_BOOT_PARAMS);
    params.kernel_args.admin_nic = newNic.mac;
    params.ip = newNic.ip;
    params.netmask = newNic.netmask;

    t.deepEqual(res, params, 'boot params for new CN');
    t.deepEqual(mocks.cnapi.CALLS.getBootParams, [
      { uuid: 'default' }
    ], 'cnapi /boot called correctly');

    t.deepEqual(mocks.napi.CALLS.getNic, [
      { mac: newNic.mac }
    ], 'NAPI /nics/:mac called correctly');

    t.deepEqual(mocks.napi.CALLS.provisionNic, [
      { network: 'admin',
        params: {
          belongs_to_type: newNic.belongs_to_type,
          belongs_to_uuid: newNic.belongs_to_uuid,
          mac: newNic.mac,
          owner_uuid: newNic.owner_uuid,
          nic_tags_provided: ['admin']
        } }
    ], 'NAPI provision nic endpoint called correctly');

    t.done();
  });
};


exports['existing CN boots'] = function (t) {
  var serverNics = clone(CN1_NICS);
  var bootParams = clone(CN1_BOOT_PARAMS);

  mocks.napi.VALUES = {
    getNic: [ { res: serverNics[1] } ],
    getNics: [ { res: serverNics } ]
  };

  mocks.cnapi.VALUES = {
    getBootParams: [ { res: bootParams } ]
  };

  var expParams = clone(bootParams);

  bp.getBootParams(serverNics[1].mac, mocks.napi, mocks.cnapi, mocks.bunyan,
    function (err, res) {
    t.ifError(err);

    expParams.kernel_args.admin_nic = serverNics[1].mac;
    expParams.kernel_args.external_nic = serverNics[0].mac;
    expParams.ip = serverNics[1].ip;
    expParams.netmask = serverNics[1].netmask;

    t.deepEqual(res, expParams, 'boot params for existing CN');
    t.deepEqual(mocks.cnapi.CALLS.getBootParams, [
      { uuid: serverNics[1].belongs_to_uuid }
    ], 'CNAPI /boot called correctly');

    t.deepEqual(mocks.napi.CALLS.getNics, [
      { uuid: serverNics[1].belongs_to_uuid }
    ], 'NAPI /nics called correctly');

    t.done();
  });
};


exports['existing CN boots: no bootparams'] = function (t) {
  var serverNics = clone(CN1_NICS);

  mocks.napi.VALUES = {
    getNic: [ { res: serverNics[1] } ],
    getNics: [ { res: serverNics } ]
  };

  mocks.cnapi.VALUES = {
    getBootParams: [
    { err: error404() },
    { res: clone(DEFAULT_BOOT_PARAMS) }
    ]
  };

  var expParams = clone(DEFAULT_BOOT_PARAMS);

  bp.getBootParams(serverNics[1].mac, mocks.napi, mocks.cnapi, mocks.bunyan,
    function (err, res) {
    t.ifError(err);

    expParams.kernel_args.admin_nic = serverNics[1].mac;
    expParams.kernel_args.external_nic = serverNics[0].mac;
    expParams.ip = serverNics[1].ip;
    expParams.netmask = serverNics[1].netmask;

    t.deepEqual(res, expParams, 'boot params for existing CN');
    t.deepEqual(mocks.cnapi.CALLS.getBootParams, [
      { uuid: serverNics[1].belongs_to_uuid },
      { uuid: 'default' }
    ], 'cnapi /boot called correctly');

    t.done();
  });
};


exports['admin nic different than booting nic'] = function (t) {
  var serverNics = clone(CN1_NICS);
  serverNics[0].nic_tags_provided = [ 'admin' ];
  delete serverNics[1].nic_tags_provided;

  mocks.napi.VALUES = {
    getNic: [ { res: serverNics[1] } ],
    getNics: [ { res: serverNics } ]
  };

  mocks.cnapi.VALUES = {
    getBootParams: [ { res: clone(CN1_BOOT_PARAMS) } ]
  };

  var expParams = clone(CN1_BOOT_PARAMS);

  bp.getBootParams(serverNics[1].mac, mocks.napi, mocks.cnapi, mocks.bunyan,
    function (err, res) {
    t.ifError(err);

    // admin_nic will be set to the nic in NAPI with nic_tags_provided of
    // 'admin', but the IP and netmask will be for the nic that's currently
    // booting
    expParams.kernel_args.admin_nic = serverNics[0].mac;
    expParams.ip = serverNics[1].ip;
    expParams.netmask = serverNics[1].netmask;

    t.deepEqual(res, expParams, 'boot params: admin nic != booting nic');

    t.done();
  });
};



// --- Teardown



exports.tearDown = function (cb) {
  mockery.disable();
  cb();
};



// Use to run only one test in this file:
if (runOne) {
  module.exports = {
    setUp: exports.setUp,
    oneTest: runOne
  };
}
