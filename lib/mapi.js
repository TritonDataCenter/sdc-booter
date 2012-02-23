var log = require('sys').log;

var QUIET = 0;

function slog(txt) {
  if (!QUIET) {
    log(txt);
  }
}


function setQuiet(val) {
  QUIET = val;
}


function lookupBootParams(mapi, key, mac_address, ip_address, callback) {
	mapi.getBootParams(mac_address, ip_address, function(err, params) {
		if (!err) {
			callback(params);
			return;
		}
		switch (err.httpCode) {
		case 404:
			var opts = { nic_tag_names: 'admin' };
			mapi.createNic(mac_address, opts, function(err) {
				if (!err) {
					mapi.getBootParams(mac_address, ip_address,
						function(err, params) {
							callback(params);
						});
					return;
				}
				slog(key + "MAPI error " + err.httpCode + " on createNic for " +
					mac_address);
				callback(null);
			});
			break;
		default:
			slog(key + "MAPI error " + err.httpCode + " on lookup for " +
				mac_address);
			callback(null);
			break;
		}
	});
}

module.exports = {
  lookupBootParams: lookupBootParams,
  setQuiet: setQuiet
}

