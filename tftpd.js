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
      EE = require('events').EventEmitter;

var SERVER_HOST = '127.0.0.1';
var SERVER_PORT = 69;
var TFTP_BOOT = './';

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


var Session = function(client, filename, mode, options) {
  this.client = client;
  this.filename = filename;
  this.mode = mode;
  this.options = options || {};
  this.block = 1; 

  var self = this;

  this.on('error', function() {
    console.log('GOT AN ERROR');
  });

  this.on('data', function(data) {
    var opcode = OPCODES[data[1]];
    
    switch (opcode) {
      case 'RRQ':
        console.log('< RRQ');
        break;
      case 'WRQ':
        break;
      case 'DATA':
        break;
      case 'ACK':
        var ack = pack.unpack('CCn', data.toString('binary'));
        this.emit('ack', ack[2]);
        break;
      case 'ERROR':
        var err = pack.unpack('nna*', data.toString('binary'));
        this.emit('error');    
        break;
      case 'OPACK':
        break;
    }

  });

  this.start();

}

Session.prototype = new EE;

Session.create = function(client, data) {
  var req = pack.unpack('CCa*a*a*a*', data.toString('binary'));
  var filename = req[2];
  var mode = req[3];
  var options = {};

  console.log(req);
  // XXX
  var pos = 4;
  while (req[pos] != undefined && req[pos] != '') {
    options[req[pos]] = req[pos+1];
    pos += 2;
  }

  console.log('Creating new session for ' + client.address);
  return new Session(client, filename, mode, options);
}


Session.prototype.start = function() {
  console.log("< RRQ filename: " + this.filename);
  var bsize = this.options.blksize || 512;
  var rs = fs.createReadStream(this.filename, {'bufferSize': bsize});
  var self = this;
 
  rs.on('data', function(data) {
    send(data);
    rs.pause();
  });

  rs.on('end', function() {
    send();
  });

  this.on('ack', function(ackblock) {
    if (self.block == ackblock) {
      self.block = ackblock + 1; //next block
      rs.resume();
    } 
  });

  var send = function(data) {
    if (data == undefined) {
      var buffer = new Buffer(4);
    } 
    else {
      var buffer = new Buffer(4 + data.length);
      data.copy(buffer, 4, 0);
    }

    buffer[0] = 0;
    buffer[1] = 3; // DATA OPCODE
    buffer[2] = (self.block >> 8) & 0xFF;
    buffer[3] = self.block & 0xFF;
    sock.send(buffer, 0, buffer.length, self.client.port, self.client.address);
  }

}

var sock = dgram.createSocket('udp4', function (data, client) {
  var key = client.address + ':' + client.port;
  var session = sessions[key];
 
  if (session == undefined) {
    session = Session.create(client, data);
    sessions[key] = session;
  }
  else {
    session.emit('data', data);
  }

});

sock.on('listening', function() {
  console.log("TFTP Server listening on " + SERVER_HOST + ":" + SERVER_PORT);

});

sock.bind(SERVER_PORT, SERVER_HOST);
