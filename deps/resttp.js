// exposes HTTP methods for public API.
//
// for unauthed calls:
// api = require("./lib/resttp").using("https://api.no.de")
//
// authed calls:
// auth = api.as("joe":"abc123")
// as() or as(null) or etc, will produce unauthed calls, e.g.,
// auth.as(null).POST(newAccount, callback)
// or even auth.as("joe":"abc123")
// Both expose GET PUT POST DELETE methods.

var request = require('./request/main')
var url = require('url')
var qs = require('querystring')


// Crockford: Chapter 3, verse 5.
var recreate = function(o) {
  var F = function () {};
  F.prototype = o;
  return new F();
}

var defaulterrcallback = function(code, body) {
  console.error("Unexpected response! " + code + " : " + body);
  throw new Error("Unhandled unexpected response: " + code + " : " + body);
}

var _use = function _use(endpoint, opts) {
  // TODO: sanity check for absolutely req'd values?
  if (typeof endpoint == 'string') {
    endpoint = url.parse(endpoint);
  }
  
  var api = {
    endpoint : endpoint,
    as : _as,
  }
  
  api.options = opts || {};

  api.GET = makeRequest.bind(api, endpoint, "GET", opts);
  api.PUT = makeRequest.bind(api, endpoint, "PUT", opts);
  api.POST = makeRequest.bind(api, endpoint, "POST", opts);
  api.DELETE = makeRequest.bind(api, endpoint, "DELETE", opts);
  api.errcallback = this.errcallback || defaulterrcallback;
  
  return api;
}
exports.use = exports.using = _use;

// TODO: should modify existing object, not create new.
var _as = function _as(user, pass) {
  var authEndpoint = url.parse(url.format(this.endpoint));
  if (user && pass) {
    authEndpoint.auth = qs.escape(user) + ":" + qs.escape(pass);
    // gets around client.request preferring cached host over constructing u:p@host
    delete authEndpoint.host;
  } else {
    delete authEndpoint.auth;
  }
  return _use(authEndpoint, this.options);
}

// TODO: merge endpoint, method into opts.
var makeRequest = function(endpoint, method, opts, resource, callback) {
  var options = requestOptions(endpoint, method, opts, resource);
  request(options, handleResponse(this.errcallback, callback));
}

var requestOptions = function(endpoint, method, options, resource) {
  var reqOptions = {};
  var body = '';
  var uri = recreate(endpoint);
  reqOptions.method = method;
  // pathname. We might have both terminal / and initial /. Normalize it out.
  uri.pathname = endpoint.pathname ? endpoint.pathname.match(/(.*?)\/?$/)[1] : "";
  
  // should perhaps be model.uri? whither the properties thing?
  uri.pathname += "/" + (resource.pathname ? resource.pathname.match(/^\/?(.*)/)[1] : "");
  
  reqOptions.uri = url.format(uri);

  reqOptions.headers = reqOptions.headers || {};
  
  if (resource.params) {
    if (!options || !options.postbody || options.postbody == 'multipart') {
      var boundary = "----------------------------38c9344c8b0f";
      body = simpleMultipart(boundary, resource.params);
      var contentType = 'multipart/form-data; boundary=' + boundary;
    } else {
      body = urlencoded(resource.params);
      var contentType = 'application/x-www-form-urlencoded';
    }

    if (body.length > 0) {         
      reqOptions.headers['content-type'] = contentType;
      reqOptions.body = body;
    } else {
      // request doesn't add content-length w/o a body.
      reqOptions.headers['content-length'] = 0;
    }
  } else {
    // request doesn't add content-length w/o a body.
    reqOptions.headers['content-length'] = 0;
  }
  return reqOptions;
}

// prefer simple objects only per node 0.3 querystring changes.
// TODO: newline normalisation.
// TODO: reserved chars only?
// neither req'd for CA.
var urlencoded = function(obj) {
  var body = qs.stringify(obj).replace(/%20/g, "+");
  return new Buffer(body);
}

// simple objects only per node 0.3 querystring
var simpleMultipart = function(boundary, map) {
  var body = '';
  for (key in map) {
    body += "--" + boundary + "\r\n";
    body += 'Content-Disposition: form-data; name="' + key + '"\r\n';
    body += "\r\n";
    body += map[key] + '\r\n';
  }
  body = body.length > 0 ? body + "--" + boundary + "--\r\n" : '';
  // FIXME PORTAL-131: why? shouldn't standard string be OK? if not, good to know why not.
  // TODO: upgrade, new request seems to do this.
  return new Buffer(body);
}

// TODO: fix up.
// expects a callback taking (code, body) params.
var handleResponse = function(errcallback, callback) {
  return function(err, resp, body) {
    if (err) {
      errcallback(err, resp, body);
    } else {
      callback(resp.statusCode, body);
    }
  }
}
