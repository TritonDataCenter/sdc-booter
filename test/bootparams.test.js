/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2018, Joyent, Inc.
 */

/*
 * bootparams tests
 */

var bp;
var clone = require('clone');
var mockery = require('mockery');
var mod_dhcpd;
var mod_file = require('./lib/file');
var mod_log = require('./lib/log');
var mod_mock = require('./lib/mocks');
var mod_server = require('./lib/server');
var restify = require('restify');
var test = require('tape');
var util = require('util');
var vasync = require('vasync');


// --- Globals


var CN1_NICS = [
    {
        belongs_to_type: 'server',
        belongs_to_uuid: '564d5535-52f0-f2ac-72e5-bca4d1d45bfa',
        mac: '00:0c:29:d4:5b:04',
        owner_uuid: mod_server.adminUuid,
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
        owner_uuid: mod_server.adminUuid,
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


// --- Internal helpers



function error404() {
    var err = new Error('404');
    err.statusCode = 404;
    return err;
}


function nicTag(name) {
    return { res: { name: name, mtu: 1500 } };
}


function getBootParams(opts, callback) {
    var bootParams = {
        napi: mocks.napi,
        cnapi: mocks.cnapi,
        mac: opts.mac
    };

    for (var p in opts) {
        bootParams[p] = opts[p];
    }

    mod_server.bootData(bootParams, callback);
}



// --- Setup / Teardown


function setUpMocks() {
    mod_mock.register();

    bp = require('../lib/bootparams');
    mod_dhcpd = require('../lib/dhcpd');

    mocks = mod_mock.create();
}


function tearDownMocks() {
    mockery.disable();
}


// --- Tests



test('new CN boots', function (t) {
    setUpMocks();
    var newNic = {
        belongs_to_type: 'other',
        belongs_to_uuid: mod_server.adminUuid,
        mac: '06:b7:ad:86:be:04',
        owner_uuid: mod_server.adminUuid,
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
        getNicTag: [ nicTag('admin') ],
        listAggrs: [ { res: [] } ],
        provisionNic: [ { res: newNic } ],
        listNetworkPools: [ { res: [] } ]
    };

    mocks.cnapi.VALUES = {
        getBootParams: [ { res: clone(DEFAULT_BOOT_PARAMS) } ]
    };

    getBootParams({ mac: newNic.mac }, function (err, res) {
        t.ifError(err, 'expect truthy value');
        if (err) {
            return t.end();
        }

        var params = clone(DEFAULT_BOOT_PARAMS);
        params.kernel_args.admin_nic = newNic.mac;
        params.ip = newNic.ip;
        params.netmask = newNic.netmask;
        params.resolvers = [ '10.99.99.11' ];

        t.deepEqual(res.bootParams, params, 'boot params for new CN');
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
                    nic_tags_provided: ['admin'],
                    nic_tag: 'admin'
                } }
        ], 'NAPI provision nic endpoint called correctly');

        t.deepEqual(mod_file.netConfig(newNic.mac), {
            nictags: [
                { name: 'admin', mac: newNic.mac, mtu: 1500 }
            ],
            admin_tag: newNic.nic_tag,
            resolvers: newNic.resolvers,
            routes: {},
            vnics: [
                newNic
            ],
            aggregations: []
        }, 'network boot-time file written correctly');

        tearDownMocks();
        t.end();
    });
});


test('new CN boots with admin pool', function (t) {
    setUpMocks();

    var admin_network = {
        family: 'ipv4',
        mtu: 1500,
        nic_tag: 'admin_rack_99',
        name: 'admin_rack_99',
        provision_end_ip: '10.222.222.250',
        provision_start_ip: '10.222.222.5',
        subnet: '10.222.222.0/24',
        uuid: '9d136dbc-a161-44f5-85a9-83c0bbecef6f',
        vlan_id: 0,
        resolvers: [],
        gateway: '10.222.222.1',
        netmask: '255.255.255.0'
    };

    var newNic = {
        belongs_to_type: 'other',
        belongs_to_uuid: mod_server.adminUuid,
        mac: '06:b7:ad:86:be:04',
        owner_uuid: mod_server.adminUuid,
        primary: false,
        ip: '10.222.222.9',
        gateway: '10.222.222.1',
        netmask: '255.255.255.0',
        vlan_id: 0,
        nic_tag: 'admin_rack_99',
        resolvers: [ '10.99.99.11' ]
    };

    var network_pool = {
        family: 'ipv4',
        uuid: '2cecff7d-fc97-4a44-bd1c-522dbaa39587',
        name: 'admin',
        networks: [
            '9d136dbc-a161-44f5-85a9-83c0bbecef6f'
        ],
        nic_tags_present: [
            'admin_rack_99'
        ],
        nic_tag: 'admin_rack_99'
    };

    mocks.napi.VALUES = {
        getNic: [ { err: error404() } ],
        getNicTag: [ nicTag('admin_rack_99') ],
        listAggrs: [ { res: [] } ],
        provisionNic: [ { res: newNic } ],
        listNetworkPools: [
            { res: [ network_pool ] }
        ],
        listNetworks: [ { res: [ admin_network ] } ]
    };

    mocks.cnapi.VALUES = {
        getBootParams: [ { res: clone(DEFAULT_BOOT_PARAMS) } ]
    };

    getBootParams({ mac: newNic.mac, nic_tag: newNic.nic_tag },
            function (err, res) {
        t.ifError(err, 'expect truthy value');
        if (err) {
            return t.end();
        }

        var params = clone(DEFAULT_BOOT_PARAMS);
        params.kernel_args.admin_nic = newNic.mac;
        params.ip = newNic.ip;
        params.netmask = newNic.netmask;
        params.resolvers = [ '10.99.99.11' ];
        params.gateway = newNic.gateway;

        t.deepEqual(res.bootParams, params, 'boot params for new CN');
        t.deepEqual(mocks.cnapi.CALLS.getBootParams, [
            { uuid: 'default' }
        ], 'cnapi /boot called correctly');

        t.deepEqual(mocks.napi.CALLS.getNic, [
            { mac: newNic.mac }
        ], 'NAPI /nics/:mac called correctly');

        // TODO: when we provision on a network pool we should get the network
        // uuid returned, not the network pool uuid. But we are using mocks
        // here, instead of real NAPI.  So we could build in the same
        // intelligence of real NAPI into mocks.  But for now just set
        // 'network' to the network pool uuid.
        t.deepEqual(mocks.napi.CALLS.provisionNic, [
            { network: network_pool.uuid,
                params: {
                    belongs_to_type: newNic.belongs_to_type,
                    belongs_to_uuid: newNic.belongs_to_uuid,
                    mac: newNic.mac,
                    owner_uuid: newNic.owner_uuid,
                    nic_tags_provided: ['admin_rack_99'],
                    nic_tag: 'admin_rack_99'
                } }
        ], 'NAPI provision nic endpoint called correctly');

        t.deepEqual(mod_file.adminPoolCache(), network_pool);

        t.deepEqual(mod_file.netConfig(newNic.mac), {
            aggregations: [],
            nictags: [
                { name: 'admin_rack_99', mac: newNic.mac, mtu: 1500 }
            ],
            admin_tag: newNic.nic_tag,
            resolvers: newNic.resolvers,
            routes: {},
            vnics: [
                newNic
            ]
        }, 'network boot-time file written correctly');

        tearDownMocks();
        t.end();
    });
});


test('existing CN boots', function (t) {
    setUpMocks();
    var serverNics = clone(CN1_NICS);
    var bootParams = clone(CN1_BOOT_PARAMS);

    mocks.napi.VALUES = {
        getNic: [ { res: serverNics[1] } ],
        getNics: [ { res: serverNics } ],
        getNicTag: [ nicTag('admin'), nicTag('external') ],
        listAggrs: [ { res: [] } ],
        listNetworkPools: [ { res: [] } ]
    };

    mocks.cnapi.VALUES = {
        getBootParams: [ { res: bootParams } ]
    };

    var expParams = clone(bootParams);

    getBootParams({ mac: serverNics[1].mac }, function (err, res) {
        t.ifError(err, 'expect truthy value');
        if (err) {
            return t.end();
        }

        expParams.kernel_args.admin_nic = serverNics[1].mac;
        expParams.kernel_args.external_nic = serverNics[0].mac;
        expParams.ip = serverNics[1].ip;
        expParams.netmask = serverNics[1].netmask;
        expParams.resolvers = serverNics[1].resolvers;

        t.deepEqual(res.bootParams, expParams, 'boot params for existing CN');
        t.deepEqual(mocks.cnapi.CALLS.getBootParams, [
            { uuid: serverNics[1].belongs_to_uuid }
        ], 'CNAPI /boot called correctly');

        t.deepEqual(mocks.napi.CALLS.getNics, [
            { uuid: serverNics[1].belongs_to_uuid }
        ], 'NAPI /nics called correctly');

        t.deepEqual(mod_file.netConfig(serverNics[1].mac), {
            aggregations: [],
            hostname: CN1_BOOT_PARAMS.kernel_args.hostname,
            nictags: [
                { name: 'admin', mac: serverNics[1].mac, mtu: 1500 },
                { name: 'external', mac: serverNics[0].mac, mtu: 1500 }
            ],
            admin_tag: serverNics[1].nic_tag,
            resolvers: serverNics[1].resolvers.concat(serverNics[0].resolvers),
            routes: {},
            vnics: [
                serverNics[1],
                serverNics[0]
            ]
        }, 'network boot-time file written correctly');

        tearDownMocks();
        return t.end();
    });
});

test('existing CN boots: no bootparams', function (t) {
    setUpMocks();
    var serverNics = clone(CN1_NICS);

    mocks.napi.VALUES = {
        getNic: [ { res: serverNics[1] } ],
        getNics: [ { res: serverNics } ],
        getNicTag: [ nicTag('admin'), nicTag('external') ],
        listAggrs: [ { res: [] } ],
        listNetworkPools: [ { res: [] } ]
    };

    mocks.cnapi.VALUES = {
        getBootParams: [
        { err: error404() },
        { res: clone(DEFAULT_BOOT_PARAMS) }
        ]
    };

    var expParams = clone(DEFAULT_BOOT_PARAMS);

    getBootParams({ mac: serverNics[1].mac }, function (err, res) {
        t.ifError(err, 'expect truthy value');
        if (err) {
            return t.end();
        }

        expParams.kernel_args.admin_nic = serverNics[1].mac;
        expParams.kernel_args.external_nic = serverNics[0].mac;
        expParams.ip = serverNics[1].ip;
        expParams.netmask = serverNics[1].netmask;
        expParams.resolvers = serverNics[1].resolvers;

        t.deepEqual(res.bootParams, expParams, 'boot params for existing CN');
        t.deepEqual(mocks.cnapi.CALLS.getBootParams, [
            { uuid: serverNics[1].belongs_to_uuid },
            { uuid: 'default' }
        ], 'cnapi /boot called correctly');

        t.deepEqual(mod_file.netConfig(serverNics[1].mac), {
            aggregations: [],
            // hostname comes from boot params, so it's not included
            nictags: [
                { name: 'admin', mac: serverNics[1].mac, mtu: 1500 },
                { name: 'external', mac: serverNics[0].mac, mtu: 1500 }
            ],
            admin_tag: serverNics[1].nic_tag,
            resolvers: serverNics[1].resolvers.concat(serverNics[0].resolvers),
            routes: {},
            vnics: [
                serverNics[1],
                serverNics[0]
            ]
        }, 'network boot-time file written correctly');

        tearDownMocks();
        t.end();
    });
});


/*
 * It's valid for the server to boot from one nic but that not be the admin
 * nic configured.  For example, you might want to boot from a 1g nic but
 * have admin be a 10g.
 */
test('admin nic different than booting nic', function (t) {
    setUpMocks();
    var desc = ': admin nic != booting nic';
    var serverNics = clone(CN1_NICS);
    // XXX: Needs work?
    // Seems like this test will always pass because we are manually adding the
    // 'admin' nic tag to a nic that does not actually provide it.  Perhaps the
    // thinking is that since they are on the same L2, we assume that this nic
    // is on the admin network.
    serverNics[0].nic_tags_provided = [ 'admin' ];
    delete serverNics[1].nic_tags_provided;

    mocks.napi.VALUES = {
        getNic: [ { res: serverNics[1] } ],
        getNics: [ { res: serverNics } ],
        getNicTag: [ nicTag('admin'), nicTag('external') ],
        listAggrs: [ { res: [] } ],
        listNetworkPools: [ { res: [] } ]
    };

    mocks.cnapi.VALUES = {
        getBootParams: [ { res: clone(CN1_BOOT_PARAMS) } ]
    };

    var expParams = clone(CN1_BOOT_PARAMS);

    getBootParams({ mac: serverNics[1].mac }, function (err, res) {
        t.ifError(err, 'expect truthy value');
        if (err) {
            return t.end();
        }

        // admin_nic will be set to the nic in NAPI with nic_tags_provided of
        // 'admin', but the IP and netmask will be for the nic that's currently
        // booting
        expParams.kernel_args.admin_nic = serverNics[0].mac;
        expParams.ip = serverNics[1].ip;
        expParams.netmask = serverNics[1].netmask;
        expParams.resolvers = serverNics[1].resolvers;

        t.deepEqual(res.bootParams, expParams,
            'boot params' + desc);

        t.deepEqual(mod_file.netConfig(serverNics[1].mac), {
            aggregations: [],
            hostname: CN1_BOOT_PARAMS.kernel_args.hostname,
            nictags: [
                { name: 'admin', mac: serverNics[0].mac, mtu: 1500 },
                { name: 'external', mtu: 1500 }
            ],
            admin_tag: serverNics[0].nic_tag, // TODO: Test this for rack aware
            resolvers: serverNics[0].resolvers.concat(serverNics[1].resolvers),
            routes: {},
            vnics: [
                serverNics[0],
                serverNics[1]
            ]
        }, 'network boot-time file' + desc);

        tearDownMocks();
        return t.end();
    });
});


test('existing CN boots: NAPI connection error', function (t) {
    setUpMocks();
    var serverNics = clone(CN1_NICS);
    var bootParams = clone(CN1_BOOT_PARAMS);
    var bootParams2 = clone(CN1_BOOT_PARAMS);
    bootParams2.kernel_args.other_param = 'changed';

    mocks.napi.VALUES = {
        getNic: [
            { res: serverNics[1] },
            { err: new restify.RestError({ message: 'connect ECONNREFUSED' }) },
            { res: serverNics[1] },
            { res: serverNics[1] }
        ],
        getNics: [
            { res: serverNics },
            // not called 2nd time: error from napi.getNic() prevents this
            { res: serverNics },
            { err: new restify.RestError({ message: 'connect ECONNREFUSED' }) }
        ],
        getNicTag: [
            nicTag('admin'), nicTag('external'),
            // not called 2nd time: error from napi.getNic() prevents this
            nicTag('admin'), nicTag('external'),
            nicTag('admin'), nicTag('external')
        ],
        listAggrs: [
            { res: [] },
            { res: [] }
        ],
        listNetworkPools: [
            { res: [] },
            { res: [] },
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
    var expNetConfig = {
        aggregations: [],
        hostname: bootParams.kernel_args.hostname,
        nictags: [
            { name: 'admin', mac: serverNics[1].mac, mtu: 1500 },
            { name: 'external', mac: serverNics[0].mac, mtu: 1500 }
        ],
        admin_tag: serverNics[1].nic_tag,
        resolvers: serverNics[1].resolvers.concat(serverNics[0].resolvers),
        routes: {},
        vnics: [
            serverNics[1],
            serverNics[0]
        ]
    };

    vasync.pipeline({
    funcs: [
        // First call: things go normally
        function (_, cb) {
            getBootParams({ mac: serverNics[1].mac }, function (err, res) {
                t.ifError(err, 'expect truthy value');
                if (err) {
                    return cb();
                }

                expParams = res.bootParams;
                t.deepEqual(mod_file.cache(serverNics[1].mac), expParams,
                    '1: params written to cache file');

                t.deepEqual(mod_file.netConfig(serverNics[1].mac),
                    expNetConfig, 'network boot-time file written correctly');

                return cb();
            });
        },

        // Second call: napi.getNic() returns an error
        function (_, cb) {
            getBootParams({ mac: serverNics[1].mac }, function (err, res) {
                t.ifError(err, 'expect truthy value');
                if (err) {
                    return cb();
                }

                t.deepEqual(res.bootParams, expParams,
                    '2: same params returned');

                // Confirm we're erroring out where we expect:

                t.equal(mocks.cnapi.CALLS.getBootParams.length, 1,
                    '2: CNAPI /boot called only once');

                t.equal(mocks.napi.CALLS.getNics.length, 1,
                    '2: NAPI /nics called only once');

                t.equal(mocks.napi.CALLS.getNic.length, 2,
                    '2: NAPI /nic/:mac called twice');

                t.deepEqual(mod_file.netConfig(serverNics[1].mac), expNetConfig,
                    '2: network boot-time file still written correctly');

                return cb();
            });
        },

        // Third call: things go normally, and CNAPI returns updated params
        function (_, cb) {
            getBootParams({ mac: serverNics[1].mac }, function (err, res) {
                t.ifError(err, 'expect truthy value');
                if (err) {
                    return cb();
                }

                expParams.kernel_args.other_param =
                    bootParams2.kernel_args.other_param;
                t.deepEqual(res.bootParams, expParams, '3: params updated');

                t.equal(mocks.cnapi.CALLS.getBootParams.length, 2,
                    '3: CNAPI /boot called once more');

                t.equal(mocks.napi.CALLS.getNics.length, 2,
                    '3: NAPI /nics called once more');

                t.equal(mocks.napi.CALLS.getNic.length, 3,
                    '3: NAPI /nic/:mac called once more');

                t.deepEqual(mod_file.cache(serverNics[1].mac), expParams,
                    '3: params written to cache file');

                t.deepEqual(mod_file.netConfig(serverNics[1].mac), expNetConfig,
                    '3: network boot-time file still written correctly');

                return cb();
            });
        },

        // Fourth call: napi.getNics() returns an error
        function (_, cb) {
            getBootParams({ mac: serverNics[1].mac }, function (err, res) {
                t.ifError(err, 'expect truthy value');
                if (err) {
                    return cb();
                }

                t.deepEqual(res.bootParams, expParams,
                    '4: updated params returned');

                t.equal(mocks.cnapi.CALLS.getBootParams.length, 3,
                    '4: CNAPI /boot called once more');

                t.equal(mocks.napi.CALLS.getNics.length, 3,
                    '4: NAPI /nics called once more');

                t.equal(mocks.napi.CALLS.getNic.length, 4,
                    '4: NAPI /nic/:mac called once more');

                t.deepEqual(mod_file.netConfig(serverNics[1].mac), expNetConfig,
                    '4: network boot-time file still written correctly');

                return cb();
            });
        }
    ] }, function () {
        tearDownMocks();
        return t.end();
    });
});


test('existing CN boots: CNAPI connection error', function (t) {
    setUpMocks();
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
        getNicTag: [
            nicTag('admin'), nicTag('external')
        ],
        listAggrs: [ { res: [] } ],
        listNetworkPools: [
            { res: [] },
            { res: [] }
        ]
    };

    mocks.cnapi.VALUES = {
        getBootParams: [
            { res: bootParams },
            { err: new restify.RestError({ message: 'connect ECONNREFUSED' }) }
        ]
    };

    var expNetConfig = {
        aggregations: [],
        hostname: CN1_BOOT_PARAMS.kernel_args.hostname,
        nictags: [
            { name: 'admin', mac: serverNics[1].mac, mtu: 1500 },
            { name: 'external', mac: serverNics[0].mac, mtu: 1500 }
        ],
        admin_tag: serverNics[1].nic_tag,
        resolvers: serverNics[1].resolvers.concat(serverNics[0].resolvers),
        routes: {},
        vnics: [
            serverNics[1],
            serverNics[0]
        ]
    };
    var expParams;

    getBootParams({ mac: serverNics[1].mac }, function (err, res) {
        t.ifError(err, 'expect truthy value');
        if (err) {
            return t.end();
        }

        expParams = res.bootParams;

        t.deepEqual(mod_file.netConfig(serverNics[1].mac), expNetConfig,
            'network boot-time file written correctly');

        getBootParams({ mac: serverNics[1].mac }, function (err2, res2) {
            t.ifError(err2, 'expect truthy value');
            t.deepEqual(res2.bootParams, expParams, 'same params returned');

            // Confirm we're erroring out where we expect:

            t.equal(mocks.cnapi.CALLS.getBootParams.length, 2,
                'CNAPI /boot called twice');

            t.equal(mocks.napi.CALLS.getNics.length, 1,
                'NAPI /nics called only once');

            t.equal(mocks.napi.CALLS.getNic.length, 2,
                'NAPI /nic/:mac called twice');

            t.deepEqual(mod_file.netConfig(serverNics[1].mac), expNetConfig,
                'network boot-time still correct');

            return t.end();
        });
    });
});


test('error while provisioning nic', function (t) {
    setUpMocks();
    mocks.napi.VALUES = {
        getNic: [ { err: error404() } ],
        provisionNic: [ { err: new Error('XXX bad error') } ],
        listAggrs: [ { res: [] } ],
        listNetworkPools: [ { res: [] } ]
    };

    mocks.cnapi.VALUES = {
        getBootParams: [ { res: clone(DEFAULT_BOOT_PARAMS) } ]
    };

    getBootParams({ mac: '06:b7:ad:86:be:05' }, function (err, res) {
        t.ok(err, 'Error returned');
        if (!err) {
            return t.end();
        }

        t.equal(err.message, 'XXX bad error', 'correct error returned');
        tearDownMocks();
        t.end();
    });
});


test('invalid JSON in cache file',  function (t) {
    setUpMocks();
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
        getNicTag: [
            nicTag('admin'), nicTag('external')
        ],
        listAggrs: [ { res: [] } ],
        listNetworkPools: [
            { res: [] },
            { res: [] }
        ]
    };

    mocks.cnapi.VALUES = {
        getBootParams: [
            { res: bootParams }
        ]
    };

    getBootParams({ mac: serverNics[1].mac }, function (err, res) {
        t.ifError(err, 'expect truthy value');
        if (err) {
            return t.end();
        }

        mod_file.cache(serverNics[1].mac, 'asdf');

        getBootParams({ mac: serverNics[1].mac }, function (err2) {
            t.ok(err2, 'Error returned');
            if (!err2) {
                return t.end();
            }

            t.equal(err2.message, 'connect ECONNREFUSED',
                    'correct error returned');
            tearDownMocks();
            t.end();
        });
    });
});


test('aggregation', function (t) {
    setUpMocks();
    var serverNics = clone(CN1_NICS);
    var bootParams = clone(CN1_BOOT_PARAMS);
    var bootParams2 = clone(CN1_BOOT_PARAMS);
    bootParams2.kernel_args.admin_nic = serverNics[1].mac;

    var aggr = {
        lacp_mode: 'passive',
        macs: [ serverNics[0].mac, serverNics[1].mac ],
        name: 'aggr0',
        nic_tags_provided: [ 'admin', 'external', 'foo' ]
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
        getNicTag: [
            nicTag('admin'), nicTag('external'), nicTag('foo'),
            nicTag('admin'), nicTag('external'), nicTag('foo')
        ],
        listAggrs: [
            { res: [ aggr ] },
            { res: [ aggr ] }
        ],
        listNetworkPools: [
            { res: [] },
            { res: [] }
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
        t.ifError(err, 'expect truthy value');
        if (err) {
            return t.end();
        }

        expParams.kernel_args.admin_nic = 'aggr0';
        expParams.kernel_args.external_nic = 'aggr0';
        expParams.kernel_args.foo_nic = 'aggr0';
        expParams.kernel_args.aggr0_lacp_mode = 'passive';
        expParams.kernel_args.aggr0_aggr = util.format(
            '\"%s\"', aggr.macs.join(','));

        expParams.ip = serverNics[1].ip;
        expParams.netmask = serverNics[1].netmask;
        expParams.resolvers = serverNics[1].resolvers;

        t.deepEqual(res.bootParams, expParams, 'boot params');
        t.deepEqual(mocks.cnapi.CALLS.getBootParams, [
            { uuid: serverNics[1].belongs_to_uuid }
        ], 'CNAPI /boot called correctly');

        t.deepEqual(mocks.napi.CALLS.getNics, [
            { uuid: serverNics[1].belongs_to_uuid }
        ], 'NAPI /nics called correctly');

        t.deepEqual(mocks.napi.CALLS.listAggrs, [
            { params: { belongs_to_uuid: serverNics[1].belongs_to_uuid } }
        ], 'NAPI /aggregations called correctly');

        t.deepEqual(mod_file.netConfig(serverNics[1].mac), {
            aggregations: [
                aggr
            ],
            hostname: CN1_BOOT_PARAMS.kernel_args.hostname,
            nictags: [
                { name: 'admin', mac: 'aggr0', mtu: 1500 },
                { name: 'external', mac: 'aggr0', mtu: 1500 },
                { name: 'foo', mac: 'aggr0', mtu: 1500 }
            ],
            admin_tag: serverNics[1].nic_tag,
            resolvers: serverNics[1].resolvers.concat(serverNics[0].resolvers),
            routes: {},
            vnics: [
                serverNics[1],
                serverNics[0]
            ]
        }, 'network boot-time file written correctly');

        // Boot again, but with admin_nic overridden by CNAPI bootparams
        getBootParams({ mac: serverNics[1].mac }, function (err2, res2) {
            t.ifError(err2, 'expect truthy value');

            var expParams2 = clone(expParams);
            expParams2.kernel_args.admin_nic = serverNics[1].mac;
            t.deepEqual(res2.bootParams, expParams2, 'second boot params');

            t.deepEqual(mod_file.netConfig(serverNics[1].mac), {
                aggregations: [
                    aggr
                ],
                hostname: CN1_BOOT_PARAMS.kernel_args.hostname,
                nictags: [
                    { name: 'admin', mac: 'aggr0', mtu: 1500 },
                    { name: 'external', mac: 'aggr0', mtu: 1500 },
                    { name: 'foo', mac: 'aggr0', mtu: 1500 }
                ],
                admin_tag: serverNics[1].nic_tag,
                resolvers: serverNics[1].resolvers.concat(
                    serverNics[0].resolvers),
                routes: {},
                vnics: [
                    serverNics[1],
                    serverNics[0]
                ]
            }, 'network boot-time file written correctly');

            tearDownMocks();
            return t.end();
        });
    });
});
