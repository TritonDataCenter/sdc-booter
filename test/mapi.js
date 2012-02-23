var sys = require('sys');
var test = require('tap').test;
var mapi = require('../lib/mapi');

mapi.setQuiet(1);

//--- mock MAPI

function mockMAPI() {
  this.returns = {
    'getBootParams': [],
    'createNic': []
  };
  this.calls = {
    'getBootParams': [],
    'createNic': []
  };
}


mockMAPI.prototype.getBootParams = function(mac, ip, cb) {
  this.calls.getBootParams.push([mac, ip]);

  var toReturn = this.returns.getBootParams.shift();
  if (!toReturn) {
    throw(new Error("mockMAPI.getBootParams: nothing to return"));
  }
  cb.apply(this, toReturn);
}


mockMAPI.prototype.createNic = function(mac, opts, cb) {
  this.calls.createNic.push([mac, opts]);

  var toReturn = this.returns.createNic.shift();
  if (!toReturn) {
    throw(new Error("mockMAPI.createNic: nothing to return"));
  }
  cb.apply(this, toReturn);
}



//--- tests


var mac = '90:b8:d0:53:3e:42';
var ip = '0.0.0.0';
var json = '{ "one": "two" }';
var opts = { nic_tag_names: 'admin' };


test('fetches boot parameters', function(t) {
  var mock = new mockMAPI();
  mock.returns.getBootParams = [
    [null, json],
  ];

  mapi.lookupBootParams(mock, '', mac, ip, function(ret) {
    t.deepEqual(ret, json);
    t.deepEqual(mock.calls.getBootParams, [ [ mac, ip ] ]);
    t.end();
  });
});


test("fetches boot parameters if nic doesn't exist", function(t) {
  var mock = new mockMAPI();
  mock.returns.getBootParams = [
    [{'httpCode': 404}, null],
    [null, json]
  ];
  mock.returns.createNic = [
    [null, null]
  ];

  mapi.lookupBootParams(mock, '', mac, ip, function(ret) {
    t.equal(ret, json);
    t.deepEqual(mock.calls.getBootParams, [[mac, ip], [mac, ip]]);
    t.deepEqual(mock.calls.createNic, [[mac, opts]]);
    t.end();
  });
});

test("doesn't do a createNic if first getBootParams fails with non-404", function(t) {
  var mock = new mockMAPI();
  mock.returns.getBootParams = [
    [{'httpCode': 500}, null],
  ];

  mapi.lookupBootParams(mock, '', mac, ip, function(ret) {
    t.equal(ret, null);
    t.deepEqual(mock.calls.getBootParams, [[mac, ip]]);
    t.deepEqual(mock.calls.createNic, []);
    t.end();
  });
});

test("doesn't do a second getBootParams if createNic fails", function(t) {
  var mock = new mockMAPI();
  mock.returns.getBootParams = [
    [{'httpCode': 404}, null],
  ];
  mock.returns.createNic = [
    [{'httpCode': 500}, null],
  ];

  mapi.lookupBootParams(mock, '', mac, ip, function(ret) {
    t.equal(ret, null);
    t.deepEqual(mock.calls.getBootParams, [[mac, ip]]);
    t.deepEqual(mock.calls.createNic, [[mac, opts]]);
    t.end();
  });
});
