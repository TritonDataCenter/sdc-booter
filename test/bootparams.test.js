/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * bootparams tests
 */

var bp;
var fs = require('fs');
var clone = require('clone');
var mockery = require('mockery');
var mod_mock = require('./lib/mocks');
var restify = require('restify');
var util = require('util');
var vasync = require('vasync');



// --- Globals



var CONF = JSON.parse(fs.readFileSync(__dirname + '/test-config.json'));


// Set this to any of the exports in this file to only run that test,
// plus setup and teardown
var runOne;

var CN1_NICS = [
    {
        belongs_to_type: 'server',
        belongs_to_uuid: '564d5535-52f0-f2ac-72e5-bca4d1d45bfa',
        mac: '00:0c:29:d4:5b:04',
        owner_uuid: CONF.adminUuid,
        primary: false,
        ip: '10.88.88.134',
        netmask: '255.255.255.0',
        gateway: '10.88.88.2',
        vlan_id: 0,
        nic_tag: 'external',
        resolvers: [
            '8.8.8.8',
            '8.8.4.4'
        ],
        network_uuid: '09e94670-08f5-4c06-883b-bc43b24862ef',
        nic_tags_provided: [
            'external'
        ]
    },
    {
        belongs_to_type: 'server',
        belongs_to_uuid: '564d5535-52f0-f2ac-72e5-bca4d1d45bfa',
        mac: '00:0c:29:d4:5b:fa',
        owner_uuid: CONF.adminUuid,
        primary: false,
        ip: '10.99.99.78',
        netmask: '255.255.255.0',
        vlan_id: 0,
        nic_tag: 'admin',
        resolvers: [
            '10.99.99.11'
        ],
        network_uuid: 'e491b841-4fc3-4502-bf95-2935f4c2f42a',
        nic_tags_provided: [
            'admin'
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
    err.statusCode = 404;
    return err;
}


function getBootParams(params, callback) {
    var bootParams = {
        adminUuid: CONF.adminUuid,
        cacheDir: '/tmp/cacheDir',
        napi: mocks.napi,
        cnapi: mocks.cnapi,
        log: mocks.bunyan
    };

    for (var p in params) {
        bootParams[p] = params[p];
    }

    bp.getBootParams(bootParams, callback);
}



// --- Setup



// run before every test
exports.setUp = function (cb) {
    mocks = mod_mock.create();

    mockery.enable();

    if (!MOCKS_REGISTERED) {
        mockery.registerMock('sdc-clients', mocks.sdcClients);
        mockery.registerMock('fs', mocks.fs);

        [
            'assert',
            'assert-plus',
            'extsprintf',
            'util',
            'stream',
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
        belongs_to_uuid: CONF.adminUuid,
        mac: '06:b7:ad:86:be:04',
        owner_uuid: CONF.adminUuid,
        primary: false,
        ip: '10.99.99.127',
        netmask: '255.255.255.0',
        vlan_id: 0,
        nic_tag: 'admin',
        resolvers: [ '10.99.99.11' ],
        network_uuid: 'e491b841-4fc3-4502-bf95-2935f4c2f42a'
    };

    mocks.napi.VALUES = {
        getNic: [ { err: error404() } ],
        listAggrs: [ { res: [] } ],
        provisionNic: [ { res: newNic } ]
    };

    mocks.cnapi.VALUES = {
        getBootParams: [ { res: clone(DEFAULT_BOOT_PARAMS) } ]
    };

    getBootParams({ mac: newNic.mac }, function (err, res) {
        t.ifError(err);

        var params = clone(DEFAULT_BOOT_PARAMS);
        params.kernel_args.admin_nic = newNic.mac;
        params.ip = newNic.ip;
        params.netmask = newNic.netmask;
        params.resolvers = [ '10.99.99.11' ];

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
        getNics: [ { res: serverNics } ],
        listAggrs: [ { res: [] } ]
    };

    mocks.cnapi.VALUES = {
        getBootParams: [ { res: bootParams } ]
    };

    var expParams = clone(bootParams);

    getBootParams({ mac: serverNics[1].mac }, function (err, res) {
        t.ifError(err);

        expParams.kernel_args.admin_nic = serverNics[1].mac;
        expParams.kernel_args.external_nic = serverNics[0].mac;
        expParams.ip = serverNics[1].ip;
        expParams.netmask = serverNics[1].netmask;
        expParams.resolvers = serverNics[1].resolvers;

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
        getNics: [ { res: serverNics } ],
        listAggrs: [ { res: [] } ]
    };

    mocks.cnapi.VALUES = {
        getBootParams: [
        { err: error404() },
        { res: clone(DEFAULT_BOOT_PARAMS) }
        ]
    };

    var expParams = clone(DEFAULT_BOOT_PARAMS);

    getBootParams({ mac: serverNics[1].mac }, function (err, res) {
        t.ifError(err);

        expParams.kernel_args.admin_nic = serverNics[1].mac;
        expParams.kernel_args.external_nic = serverNics[0].mac;
        expParams.ip = serverNics[1].ip;
        expParams.netmask = serverNics[1].netmask;
        expParams.resolvers = serverNics[1].resolvers;

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
        getNics: [ { res: serverNics } ],
        listAggrs: [ { res: [] } ]
    };

    mocks.cnapi.VALUES = {
        getBootParams: [ { res: clone(CN1_BOOT_PARAMS) } ]
    };

    var expParams = clone(CN1_BOOT_PARAMS);

    getBootParams({ mac: serverNics[1].mac }, function (err, res) {
        t.ifError(err);

        // admin_nic will be set to the nic in NAPI with nic_tags_provided of
        // 'admin', but the IP and netmask will be for the nic that's currently
        // booting
        expParams.kernel_args.admin_nic = serverNics[0].mac;
        expParams.ip = serverNics[1].ip;
        expParams.netmask = serverNics[1].netmask;
        expParams.resolvers = serverNics[1].resolvers;

        t.deepEqual(res, expParams, 'boot params: admin nic != booting nic');

        t.done();
    });
};


exports['existing CN boots: NAPI connection error'] = function (t) {
    var serverNics = clone(CN1_NICS);
    var bootParams = clone(CN1_BOOT_PARAMS);
    var bootParams2 = clone(CN1_BOOT_PARAMS);
    bootParams2.kernel_args.other_param = 'changed';

    mocks.napi.VALUES = {
        getNic: [
            { res: serverNics[1] },
            { err: new restify.RestError('connect ECONNREFUSED') },
            { res: serverNics[1] },
            { res: serverNics[1] }
        ],
        getNics: [
            { res: serverNics },
            // not called 2nd time: error from napi.getNic() prevents this
            { res: serverNics },
            { err: new restify.RestError('connect ECONNREFUSED') }
        ],
        listAggrs: [
            { res: [] },
            { res: [] }
        ]
    };

    mocks.cnapi.VALUES = {
        getBootParams: [
            { res: bootParams },
            // not called 2nd time: error from napi.getNic() prevents this
            { res: bootParams2 },
            { res: bootParams2 }
        ]
    };

    var expParams;

    vasync.pipeline({
    funcs: [
        // First call: things go normally
        function (_, cb) {
            getBootParams({ mac: serverNics[1].mac }, function (err, res) {
                t.ifError(err);
                expParams = res;

                var root = mocks.fs.getRoot();
                var macFile = serverNics[1].mac + '.json';
                var cached = JSON.parse(root['/tmp/cacheDir'][macFile]);
                t.deepEqual(cached, expParams, 'params written to cache file');

                return cb();
            });
        },

        // Second call: napi.getNic() returns an error
        function (_, cb) {
            getBootParams({ mac: serverNics[1].mac }, function (err, res) {
                t.ifError(err);
                t.deepEqual(res, expParams, 'same params returned');

                // Confirm we're erroring out where we expect:

                t.equal(mocks.cnapi.CALLS.getBootParams.length, 1,
                    'CNAPI /boot called only once');

                t.equal(mocks.napi.CALLS.getNics.length, 1,
                    'NAPI /nics called only once');

                t.equal(mocks.napi.CALLS.getNic.length, 2,
                    'NAPI /nic/:mac called twice');

                return cb();
            });
        },

        // Third call: things go normally, and CNAPI returns updated params
        function (_, cb) {
            getBootParams({ mac: serverNics[1].mac }, function (err, res) {
                t.ifError(err);
                expParams.kernel_args.other_param =
                    bootParams2.kernel_args.other_param;
                t.deepEqual(res, expParams, 'params updated');

                t.equal(mocks.cnapi.CALLS.getBootParams.length, 2,
                    'CNAPI /boot called once more');

                t.equal(mocks.napi.CALLS.getNics.length, 2,
                    'NAPI /nics called once more');

                t.equal(mocks.napi.CALLS.getNic.length, 3,
                    'NAPI /nic/:mac called once more');

                var root = mocks.fs.getRoot();
                var macFile = serverNics[1].mac + '.json';
                var cached = JSON.parse(root['/tmp/cacheDir'][macFile]);
                t.deepEqual(cached, expParams, 'params written to cache file');

                return cb();
            });
        },

        // Fourth call: napi.getNics() returns an error
        function (_, cb) {
            getBootParams({ mac: serverNics[1].mac }, function (err, res) {
                t.ifError(err);
                t.deepEqual(res, expParams, 'updated params returned');

                t.equal(mocks.cnapi.CALLS.getBootParams.length, 3,
                    'CNAPI /boot called once more');

                t.equal(mocks.napi.CALLS.getNics.length, 3,
                    'NAPI /nics called once more');

                t.equal(mocks.napi.CALLS.getNic.length, 4,
                    'NAPI /nic/:mac called once more');

                return cb();
            });
        }
    ] }, function () {
        return t.done();
    });
};


exports['existing CN boots: CNAPI connection error'] = function (t) {
    var serverNics = clone(CN1_NICS);
    var bootParams = clone(CN1_BOOT_PARAMS);

    mocks.napi.VALUES = {
        getNic: [
            { res: serverNics[1] },
            { res: serverNics[1] }
        ],
        getNics: [
            { res: serverNics }
        ],
        listAggrs: [ { res: [] } ]
    };

    mocks.cnapi.VALUES = {
        getBootParams: [
            { res: bootParams },
            { err: new restify.RestError('connect ECONNREFUSED') }
        ]
    };

    var expParams;

    getBootParams({ mac: serverNics[1].mac }, function (err, res) {
        t.ifError(err);
        expParams = res;

        getBootParams({ mac: serverNics[1].mac }, function (err2, res2) {
            t.ifError(err2);
            t.deepEqual(res2, expParams, 'same params returned');

            // Confirm we're erroring out where we expect:

            t.equal(mocks.cnapi.CALLS.getBootParams.length, 2,
                'CNAPI /boot called twice');

            t.equal(mocks.napi.CALLS.getNics.length, 1,
                'NAPI /nics called only once');

            t.equal(mocks.napi.CALLS.getNic.length, 2,
                'NAPI /nic/:mac called twice');

            t.done();
        });
    });
};


exports['error while provisioning nic'] = function (t) {
    mocks.napi.VALUES = {
        getNic: [ { err: error404() } ],
        provisionNic: [ { err: new Error('XXX bad error') } ],
        listAggrs: [ { res: [] } ]
    };

    mocks.cnapi.VALUES = {
        getBootParams: [ { res: clone(DEFAULT_BOOT_PARAMS) } ]
    };

    getBootParams({ mac: '06:b7:ad:86:be:05' }, function (err, res) {
        t.ok(err, 'Error returned');
        if (!err) {
            return t.done();
        }

        t.equal(err.message, 'XXX bad error', 'correct error returned');
        t.done();
    });
};


exports['invalid JSON in cache file'] = function (t) {
    var bootParams = clone(CN1_BOOT_PARAMS);
    var serverNics = clone(CN1_NICS);

    mocks.napi.VALUES = {
        getNic: [
            { res: serverNics[1] },
            { err: new Error('connect ECONNREFUSED') }
        ],
        getNics: [
            { res: serverNics }
        ],
        listAggrs: [ { res: [] } ]
    };

    mocks.cnapi.VALUES = {
        getBootParams: [
            { res: bootParams }
        ]
    };

    getBootParams({ mac: serverNics[1].mac }, function (err, res) {
        t.ifError(err);

        var root = mocks.fs.getRoot();
        var macFile = serverNics[1].mac + '.json';
        root['/tmp/cacheDir'][macFile] = 'asdf';

        getBootParams({ mac: serverNics[1].mac }, function (err2) {
            t.ok(err2, 'Error returned');
            if (!err2) {
                return t.done();
            }

            t.equal(err2.message, 'connect ECONNREFUSED',
                'correct error returned');
            t.done();
        });
    });
};


exports['aggregation'] = function (t) {
    var serverNics = clone(CN1_NICS);
    var bootParams = clone(CN1_BOOT_PARAMS);
    var bootParams2 = clone(CN1_BOOT_PARAMS);
    bootParams2.kernel_args.admin_nic = serverNics[1].mac;

    var aggr = {
        lacp_mode: 'passive',
        macs: [ serverNics[0].mac, serverNics[1].mac ],
        name: 'aggr0',
        nic_tags_provided: [ 'admin', 'external' ]
    };

    mocks.napi.VALUES = {
        getNic: [
            { res: serverNics[1] },
            { res: serverNics[1] }
        ],
        getNics: [
            { res: serverNics },
            { res: serverNics }
        ],
        listAggrs: [
            { res: [ aggr ] },
            { res: [ aggr ] }
        ]
    };

    mocks.cnapi.VALUES = {
        getBootParams: [
            { res: bootParams },
            { res: bootParams2 }
        ]
    };

    var expParams = clone(bootParams);

    getBootParams({ mac: serverNics[1].mac }, function (err, res) {
        t.ifError(err);

        expParams.kernel_args.admin_nic = 'aggr0';
        expParams.kernel_args.external_nic = 'aggr0';
        expParams.kernel_args.aggr0_lacp_mode = 'passive';
        expParams.kernel_args.aggr0_aggr = util.format(
            '\"%s\"', aggr.macs.join(','));

        expParams.ip = serverNics[1].ip;
        expParams.netmask = serverNics[1].netmask;
        expParams.resolvers = serverNics[1].resolvers;

        t.deepEqual(res, expParams, 'boot params');
        t.deepEqual(mocks.cnapi.CALLS.getBootParams, [
            { uuid: serverNics[1].belongs_to_uuid }
        ], 'CNAPI /boot called correctly');

        t.deepEqual(mocks.napi.CALLS.getNics, [
            { uuid: serverNics[1].belongs_to_uuid }
        ], 'NAPI /nics called correctly');

        t.deepEqual(mocks.napi.CALLS.listAggrs, [
            { params: { belongs_to_uuid: serverNics[1].belongs_to_uuid } }
        ], 'NAPI /aggregations called correctly');

        // Boot again, but with admin_nic overridden by CNAPI bootparams
        getBootParams({ mac: serverNics[1].mac }, function (err2, res2) {
            t.ifError(err2);

            var expParams2 = clone(expParams);
            expParams2.kernel_args.admin_nic = serverNics[1].mac;
            t.deepEqual(res2, expParams2, 'second boot params');

            return t.done();
        });
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
