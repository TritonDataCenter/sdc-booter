/* 

-----------------------------------
TFTP Protocol "Library"
-----------------------------------

http://tools.ietf.org/html/rfc1350
http://tools.ietf.org/html/rfc2347
http://tools.ietf.org/html/rfc2348

*/

var pack = require('./pack'),
    slog = require('sys').log,
   dgram = require('dgram'),
      fs = require('fs'),
		path = require('path'),
  config = require('./config').config,
      EE = require('events').EventEmitter;
    mapi = require('./mapi'),
     sys = require('sys');

var SERVER_HOST = config.host;
var SERVER_PORT = 69;
var TFTPROOT = '/tftpboot';

var sessions = {};

var OPCODES = (
  { 1: 'RRQ'
  , 2: 'WRQ'
  , 3: 'DATA'
  , 4: 'ACK'
  , 5: 'ERROR'
  , 6: 'OPACK'
  });

var ERR_UNDEFINED = 0;         // Not defined, see error message (if any)
var ERR_FILE_NOT_FOUND = 1;    // File not found
var ERR_ACCESS_VIOLATION = 2;  // Access violation
var ERR_DISK_FULL = 3;         // Disk full or allocation exceeded
var ERR_ILLEGAL_OPERATION = 4; // Illegal TFTP operation
var ERR_UNKNOWN_TRANSFER = 5;  // Unknown transfer ID
var ERR_FILE_EXISTS = 6;       // File already exists
var ERR_NO_SUCH_USER = 7;      // No such user
var ERR_NO_OPTION = 8;         // Option does not exist

var Session = function(client) {
  this.client = client;
  this.filename = null;
  this.mode = null;
  this.options = {};
  this.block = 1; 
	var self = this;
  
  this.on('message', function(data) {
    var opcode = OPCODES[data[1]];
    switch (opcode) {
      case 'RRQ':
        parseRRQ(data);
        break;
      case 'WRQ':
        self.sendError(ERR_ACCESS_VIOLATION, "Read only TFTP");
        break;
      case 'DATA':
        self.sendError(ERR_ACCESS_VIOLATION, "Read only TFTP");
        break;
      case 'ACK':
        parseACK(data);
        break;
      case 'ERROR':
        var err = pack.unpack('nna*', data.toString('binary'));
        slog("< ERROR: " + err);
        break;
    }
  });

  var parseACK = function(data) {
    var ack = pack.unpack('CCn', data.toString('binary'));
    var ackblock = ack[2];
    //slog("[" + self.client.address + ':' + self.client.port + "] < ACK: " + ackblock);
    if (ackblock == (self.block % 65536)) {
      self.block +=1;
      self.sendData();
    }
  }

	var parseRRQ = function(data) {
		var req = pack.unpack('CCa*a*a*a*a*a*a*', data.toString('binary'));
		self.filename = TFTPROOT + '/' + req[2];
		self.mode = req[3];
		self.block = 1;
		var pos = 4;
    
    // parse the rest of the option in requests
		while (req[pos] != undefined && req[pos] != '') {
			self.options[req[pos]] = req[pos+1];
			console.log(req[pos]);
			switch (req[pos]) {
				case 'timeout':
					slog("Got a TIMEOUT packet");
					break;
				case 'tsize':
				  try {
            stats = fs.statSync(self.filename)
            self.options['tsize'] = stats.size;
          } 
          catch(err) {
            self.sendError(ERR_FILE_NOT_FOUND, "File not found: " + self.filename);
            return;
          }
				  break;
			}
			pos += 2;
		}
	
    self.sendOack();
    self.sendData();

	}

}

Session.prototype = new EE;

Session.prototype.sendMenuLst = function() {
  var bsize = parseInt(this.options.blksize || 512);
  var buffer = new Buffer(4 + bsize);
  var start = (this.block -1 ) * bsize;
  var self = this;

  console.log("start=" + start);
  console.log("bsize=" + bsize);
  var end = start + bsize;
  console.log("end=" + end);
  console.log("menuLst.length=" + self.menuLst.length);
  if (end > self.menuLst.length) {
    end = self.menuLst.length;
  }
  console.log("end (after)=" + end);
  var sendLength = 4 + end - start;
  var toSend = '';
  if (sendLength > 0) {
    toSend = self.menuLst.substring(start, end)
  } else {
    sendLength = 4;
  }
  console.log("start=" + start + ", end=" + end + ", length=" + self.menuLst.length + ", send length=" + sendLength);
  buffer.write(pack.pack("CCn", 0, 3, self.block), 0, 'binary');
  buffer.write(self.menuLst.substring(start, end), 4);
  console.log("==\n" + toSend  + "\n==");
  sock.send(buffer, 0, sendLength, self.client.port, self.client.address, function(err, bytes) {
    if (err) throw err;
  });
}

Session.prototype.sendData = function() {
  var self = this;
  var macReg = /menu.lst.01([0-9A-F]{12})/;
	if ( macReg.test(self.filename) ) {
    var mac = macReg.exec(self.filename)[1].match(/.{2}/g).join(':');
    console.log("mac=" + mac);
    if ( !self.menuLst ) {
      console.log("menu.lst requested, building...");
      mapi.buildMenuLst(mac, function(menu) {
          self.menuLst = menu;
          console.log("MENU LST\n==" + menu + "\n==");
          self.sendMenuLst();
      });
    } else {
      self.sendMenuLst();
    }
  } else {
    this.sendFile();
  }
}

Session.prototype.sendFile = function() {
  var bsize = this.options.blksize || 512;
  var buffer = new Buffer(4 + parseInt(bsize));
  var pos = (this.block -1 ) * bsize;
  var sendBlk = this.block % 65536;
  var self = this;
  
  if (this.block == 1) {
    console.log("Sending data, filename="+ self.filename);
  }
  fs.open(self.filename, 'r', function(err, fp) {
    if (err) {
      self.sendError(ERR_FILE_NOT_FOUND, "File not found: " + self.filename);
      return;
    }
    
    fs.read(fp, buffer, 4, bsize, pos, function(err, bytesRead) {
      if (err) {
        slog("Error reading file: "+ err);
        sendError(ERR_UNDEFINED, err);
        return;
      }
      fs.close(fp);
  
      buffer.write(pack.pack("CCn", 0, 3, sendBlk), 0, 'binary');
      sock.send(buffer, 0, 4 + bytesRead, self.client.port, self.client.address, function(err, bytes) {
        if (err) throw err;
        //slog("[" + self.client.address + ':' + self.client.port + "] > DATA Wrote " + bytes + " bytes to socket for block " + self.block);
      });
    });
  });

}

Session.prototype.sendOack = function() {
  var msg = pack.pack("CC", 0, 6);
  for (var key in this.options) {
    msg += pack.pack("a*a*", key, this.options[key]);
  }
  var buffer = new Buffer(msg);
	sock.send(buffer, 0, buffer.length, this.client.port, this.client.address);
}

Session.prototype.sendError = function(code, msg) {
	var buffer = new Buffer(4 + msg.length);
	buffer.write(pack.pack("CCnA*", 0, 5, code, msg), 'binary');
	//slog("> ERROR len: " + buffer.length + " block: " + this.block);
	sock.send(buffer, 0, buffer.length, this.client.port, this.client.address);
}


var sock = dgram.createSocket('udp4', function (data, client) {
  var key = client.address + ':' + client.port;
  var session = sessions[key];
 
  if (session == undefined) {
    var session = new Session(client);
    sessions[key] = session;
  } 
 
  session.emit('message', data);

});

sock.on('listening', function() {
  slog("TFTP Server listening on " + SERVER_HOST + ":" + SERVER_PORT);
});

sock.bind(SERVER_PORT, SERVER_HOST);
