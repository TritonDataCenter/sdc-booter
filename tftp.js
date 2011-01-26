var dgram = require('dgram');
var slog = require('sys').log;
var fs = require('fs');

var SERVER_HOST='0.0.0.0';
var SERVER_PORT=69;
var TFTPBOOT='/tftpboot';

var opcodes = {OPCODE_RRQ: 1,
  OPCODE_WRQ: 2,
  OPCODE_DATA: 3,
  OPCODE_ACK: 4,
  OPCODE_ERROR: 5};

var sessions = {};
var sock = null;

function log(peer, msg) {
  slog("[" + peer.address + ":" + peer.port + "] "+ msg);
}

function decodeOp(msg, peer) {
  if (msg.length < 4) {
    log(peer, 'Message too short to be valid.');
    return null;
  }

  if (msg[0] !== 0) {
    log(peer, 'Invalid Opcode, no leading zero.');
    return null;
  }

  var b = msg[1];

  for (var op in opcodes) {
    if (opcodes.hasOwnProperty(op)) {
      if (b == opcodes[op]) {
        return op;
      }
    }
  }

  log(peer, 'Invalid Opcode, no such opcode '+ b);
  return null;
}

function clearSession(peer) {
  var key = peer.address + ":" + peer.port;
  delete sessions[key];
}

function startSession(peer, file) {
  var key = peer.address + ":" + peer.port;
  sessions[key] = {'peer': peer, 'file': file};
  sendBlock(peer, file, 1);
}

function continueSession(peer, block) {
  var key = peer.address + ":" + peer.port;
  var s =  sessions[key];
  if (s !== undefined) {
    sendBlock(peer, s.file, block);
  }
  else {
    log(peer, 'Ack for unknown session');
  }
}

var ERR_UNDEFINED = 0;         // Not defined, see error message (if any)
var ERR_FILE_NOT_FOUND = 1;    // File not found
var ERR_ACCESS_VIOLATION = 2;  // Access violation
var ERR_DISK_FULL = 3;         // Disk full or allocation exceeded
var ERR_ILLEGAL_OPERATION = 4; // Illegal TFTP operation
var ERR_UNKNOWN_TRANSFER = 5;  // Unknown transfer ID
var ERR_FILE_EXISTS = 6;       // File already exists
var ERR_NO_SUCH_USER = 7;      // No such user

function sendError(peer, errorcode, msg) {
  clearSession(peer);
  if (msg === undefined) {
    msg = "";
  }
  var buf = new Buffer(6 + msg.length);
  buf[0] = 0;
  buf[1] = opcodes.OPCODE_ERROR;
  buf[2] = 0;
  buf[3] = errorcode;
  buf.write(msg, 4);
  buf[4 + msg.length] = 0;
  sock.send(buf, 0, buf.length, peer.port, peer.address);
}

function getString(buf) {
  var slen;
  for (slen = 0; slen < buf.length; slen++) {
    if (buf[slen] === 0) {
      break;
    }
  }

  return [slen, buf.toString('ascii', 0, slen)];
}

function sendBlock(peer, file, block) {
  //log(peer, 'Sending block '+ block + " of "+ file);

  fs.open(file, 'r', function(err, fp) {
    if (err) {
      log(peer, "Error opening file: "+ err);
      sendError(peer, ERR_FILE_NOT_FOUND, "Can't open file: "+ file);
      return;
    }
    var buf = new Buffer(4 + 512);
    fs.read(fp, buf, 4, 512, ( block - 1 ) * 512, function(err, bytesRead) {
      if (err) {
        log(peer, "Error reading file: "+ err);
        sendError(peer, ERR_UNDEFINED, err);
        return;
      }
      buf[0] = 0;
      buf[1] = opcodes.OPCODE_DATA;
      buf[2] = (block >> 8) & 0xFF;
      buf[3] = block & 0xFF;
      sock.send(buf, 0, 4 + bytesRead, peer.port, peer.address);
      fs.close(fp);
    });
  });
}

sock = dgram.createSocket("udp4", function (msg, peer) {
  var key = peer.address + ":" + peer.port;
  var op = decodeOp(msg, peer);
	var buff = null;
	if (op === null) {
    sendError(peer, ERR_UNDEFINED, 'Unable to decode opcode');
    return;
  }

  switch (op) {
    case "OPCODE_RRQ":
      buf = msg.slice(2, msg.length);
      var tmp = getString(buf);
      buf = buf.slice(tmp[0]+1, buf.length);

      var filename = tmp[1];
      tmp = getString(buf);
      var mode = tmp[1];
			requestHandler(peer, filename, mode);
      break;
    case "OPCODE_WRQ":
      sendError(peer, ERR_ACCESS_VIOLATION, 'Read only tftp server');
      break;
    case "OPCODE_DATA":
      sendError(peer, ERR_ACCESS_VIOLATION, 'Read only tftp server');
      break;
    case "OPCODE_ACK":
      buf = msg.slice(2, msg.length);
      var block = (parseInt(buf[0]) << 8) +parseInt(buf[1]);
      continueSession(peer, block + 1);
      break;
    case "OPCODE_ERROR":
      clearSession(peer);
      break;
  }
});

function requestHandler(peer, filename, mode) {
  var macReg = /menu.lst.01([0-9A-F]{12})/;
	
	log(peer, "requested file: "+ filename);
	log(peer, "mode: "+ mode);

	// TODO check with MAPI to see what to boot.
	if ( macReg.test(filename) ) {
    var mac = macReg.exec(filename)[1].match(/.{2}/g).join(':');
		menu = buildMenu(mac);
		fs.writeFile(TFTPBOOT + '/' + filename, menu, function(err) {
			log(peer, "menu created. saving to " + filename);
			startSession(peer, TFTPBOOT + '/' + filename);
		});
	}
	else {
		fs.stat(TFTPBOOT + '/' + filename, function (err, stats) {
			if (!err && stats.isFile()) {
				startSession(peer, TFTPBOOT + '/' + filename);
			}
			else {
				sendError(peer, ERR_FILE_NOT_FOUND, "not a file: "+ filename);
			}
		});
	}
}

function getConfig(mac) {
  var hostname = mac.replace(/:/g,'-');
  var config = (
    { 'hostname': hostname
    , 'mac': mac
    , 'external': 'aa:aa:aa:aa:aa:aa'
    , 'internal': 'bb:bb:bb:bb:bb:bb'
		, 'kernel': '/platform/i86pc/kernel/amd64/unix'
		, 'module': '/platform/i86pc/amd64/boot_archive'
    , 'kargs': 'console=text,rabbitmq=192.168.1.1:1234,admin_nic=' + mac
		, 'kargs_debug': 'prom_debug=true,map_debug=true,kbm_debug=true'
    });
	return config;
}

function rebootMenu(mac, timeout) {
	var timeout = timeout || 60;
	var template = function() {
		return (
		[ "default=0"
		, "timeout=" + timeout
		, "min_mem64 1024"
		, "color dark-gray/red white/red"
    , ""
		, "title Hit Enter to Reboot"
		, "  reboot"
    ].join('\n'));
	}

	return template();

}

function buildMenu(mac) {
  var c = getConfig(mac); 

  var template = function() {
		return (
		[ "default=0"
		, "timeout=5"
		, "min_mem64 1024"
		, "color cyan/blue white/blue"
		, ""
		, "title Live 64-bit"
		, "kernel " + c.kernel + " -B " + c.kargs
		, "module " + c.module
		, ""
		, "title Live 64-bit KMDB"
		, "  kernel " + c.kernel + " -k -B " + c.kargs + ',' + c.kargs_debug
		, "  module " + c.module
		, ""
		, "title Live 64-bit Debug"
		, "  kernel " + c.kernel + " -kdv -B " + c.kargs + ',' + c.kargs_debug
		, "  module " + c.module
		, ""
		, "title Live 64-bit Rescue (no importing zpool)"
		, "  kernel " + c.kernel + " -kdv -B " + c.kargs + ',noimport=true'
		, "  module " + c.module
		, ""
		].join('\n'));
	}

	return template();

}

sock.on('listening', function() {
  slog('Bound to '+ SERVER_HOST + ':' + SERVER_PORT);
});

sock.bind(SERVER_PORT, SERVER_HOST);
