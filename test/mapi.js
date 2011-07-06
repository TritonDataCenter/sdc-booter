var sys      = require('sys'),
    testCase = require('nodeunit').testCase,
    client   = require('../lib/mapi').Mapi;

function mockMAPI() {
  this.returns = {
    'GET': [],
    'POST': []
  };
  this.calls = {
    'GET': [],
    'POST': []
  };
}

mockMAPI.prototype.GET = function(args, cb) {
  var toReturn = this.returns['GET'].shift();
  this.calls['GET'].push(args);
  if (!toReturn) {
    throw(new Error("mockMAPI.GET: nothing to return"));
  }
  //console.log("fake GET " + sys.inspect(toReturn));
  cb.apply(this, toReturn);
}

mockMAPI.prototype.POST = function(args, cb) {
  var toReturn = this.returns['POST'].shift();
  this.calls['POST'].push(args);
  if (!toReturn) {
    throw(new Error("mockMAPI.POST: nothing to return"));
  }
  //console.log("fake POST " + sys.inspect(toReturn));
  cb.apply(this, toReturn);
}


var mac = '90:b8:d0:53:3e:42';
var html = '<html>an html string</html>';
var json = '{ "one": "two" }';
var getParams = { pathname: 'admin/boot/' + mac };
var postParams = { pathname: 'admin/nics',
                   params: { address: mac, nic_tag_names: 'admin' } };

exports['getBootParams'] = testCase({
  setUp: function(done) {
    this.mapi = new client();
    this.mapi.logging = false;
    this.fakeClient = new mockMAPI();
    this.mapi.client = this.fakeClient;
    done();
  },

  'fetches boot parameters on first GET': function(test) {
    var self = this;
    test.expect(3);
    this.mapi.client.returns['GET'] = [
      [ 200, json],
    ];

    this.mapi.getBootParams(mac, function(ret) {
      test.deepEqual(ret, JSON.parse(json));
      test.deepEqual(self.mapi.client.calls['GET'], [ getParams ]);
      test.deepEqual(self.mapi.client.calls['POST'], [ ]);
      test.done();
    });
  },

  'fetches boot parameters on second GET': function(test) {
    var self = this;
    test.expect(3);
    this.mapi.client.returns['GET'] = [
      [ 404, json],
      [ 200, html],
    ];
    this.mapi.client.returns['POST'] = [
      [ 201, null],
    ];

    this.mapi.getBootParams(mac, function(ret) {
      test.equal(ret, null);
      test.deepEqual(self.mapi.client.calls['GET'], [ getParams, getParams ]);
      test.deepEqual(self.mapi.client.calls['POST'], [ postParams ]);
      test.done();
    });
  },

  'returns null for invalid JSON on first GET': function(test) {
    var self = this;
    test.expect(3);
    this.mapi.client.returns['GET'] = [
      [ 200, html],
    ];

    this.mapi.getBootParams(mac, function(ret) {
      test.equal(ret, null);
      test.deepEqual(self.mapi.client.calls['GET'], [ getParams]);
      test.deepEqual(self.mapi.client.calls['POST'], [ ]);
      test.done();
    });
  },

  'returns null for invalid JSON on POST': function(test) {
    var self = this;
    test.expect(3);
    this.mapi.client.returns['GET'] = [
      [ 404, json],
    ];
    this.mapi.client.returns['POST'] = [
      [ 404, html],
    ];

    this.mapi.getBootParams(mac, function(ret) {
      test.equal(ret, null);
      test.deepEqual(self.mapi.client.calls['GET'], [ getParams]);
      test.deepEqual(self.mapi.client.calls['POST'], [ postParams ]);
      test.done();
    });
  },

  'returns null for invalid JSON on second GET': function(test) {
    var self = this;
    test.expect(3);
    this.mapi.client.returns['GET'] = [
      [ 404, json],
      [ 200, html],
    ];
    this.mapi.client.returns['POST'] = [
      [ 201, null],
    ];

    this.mapi.getBootParams(mac, function(ret) {
      test.equal(ret, null);
      test.deepEqual(self.mapi.client.calls['GET'], [ getParams, getParams ]);
      test.deepEqual(self.mapi.client.calls['POST'], [ postParams ]);
      test.done();
    });
  },

  'does not do a POST if first GET fails with non-404': function(test) {
    var self = this;
    test.expect(3);
    this.mapi.client.returns['GET'] = [
      [ 409, json],
    ];
    this.mapi.client.returns['POST'] = [
      [ 201, null],
    ];

    this.mapi.getBootParams(mac, function(ret) {
      test.equal(ret, null);
      test.deepEqual(self.mapi.client.calls['GET'], [ getParams ]);
      test.deepEqual(self.mapi.client.calls['POST'], [ ]);
      test.done();
    });
  },


});

