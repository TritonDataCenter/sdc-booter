/*
 * Copyright (c) 2013 Joyent Inc., All rights reserved.
 *
 * From RFC2131:
 *
 * 0                   1                   2                   3
 * 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |     op (1)    |   htype (1)   |   hlen (1)    |   hops (1)    |
 * +---------------+---------------+---------------+---------------+
 * |                            xid (4)                            |
 * +-------------------------------+-------------------------------+
 * |           secs (2)            |           flags (2)           |
 * +-------------------------------+-------------------------------+
 * |                          ciaddr  (4)                          |
 * +---------------------------------------------------------------+
 * |                          yiaddr  (4)                          |
 * +---------------------------------------------------------------+
 * |                          siaddr  (4)                          |
 * +---------------------------------------------------------------+
 * |                          giaddr  (4)                          |
 * +---------------------------------------------------------------+
 * |                                                               |
 * |                          chaddr  (16)                         |
 * |                                                               |
 * |                                                               |
 * +---------------------------------------------------------------+
 * |                                                               |
 * |                          sname   (64)                         |
 * +---------------------------------------------------------------+
 * |                                                               |
 * |                          file    (128)                        |
 * +---------------------------------------------------------------+
 * |                                                               |
 * |                          options (variable)                   |
 * +---------------------------------------------------------------+
 *
 */

var pack = require('pack');
var slog = require('util').log;
var sprintf = require('sprintf').sprintf;

// define array of DHCP options
var DHCP_OPTION = [];
DHCP_OPTION[  0] = 'Pad';
DHCP_OPTION[  1] = 'Subnet Mask';
DHCP_OPTION[  2] = 'Time Offset (deprecated)';
DHCP_OPTION[  3] = 'Router';
DHCP_OPTION[  4] = 'Time Server';
DHCP_OPTION[  5] = 'Name Server';
DHCP_OPTION[  6] = 'Domain Name Server';
DHCP_OPTION[  7] = 'Log Server';
DHCP_OPTION[  8] = 'Quote Server';
DHCP_OPTION[ 12] = 'Host Name';
DHCP_OPTION[ 13] = 'Boot File Size';
DHCP_OPTION[ 15] = 'Domain Name';
DHCP_OPTION[ 16] = 'Swap Server';
DHCP_OPTION[ 17] = 'Root Path';
DHCP_OPTION[ 18] = 'Extensions Path';
DHCP_OPTION[ 19] = 'IP Forwarding enable/disable';
DHCP_OPTION[ 20] = 'Non-local Source Routing enable/disable';
DHCP_OPTION[ 21] = 'Policy Filter';
DHCP_OPTION[ 22] = 'Maximum Datagram Reassembly Size';
DHCP_OPTION[ 23] = 'Default IP Time-to-live';
DHCP_OPTION[ 24] = 'Path MTU Aging Timeout';
DHCP_OPTION[ 25] = 'Path MTU Plateau Table';
DHCP_OPTION[ 26] = 'Interface MTU';
DHCP_OPTION[ 27] = 'All Subnets are Local';
DHCP_OPTION[ 28] = 'Broadcast Address';
DHCP_OPTION[ 29] = 'Perform Mask Discovery';
DHCP_OPTION[ 30] = 'Mask supplier';
DHCP_OPTION[ 31] = 'Perform router discovery';
DHCP_OPTION[ 32] = 'Router solicitation address';
DHCP_OPTION[ 33] = 'Static routing table';
DHCP_OPTION[ 34] = 'Trailer encapsulation';
DHCP_OPTION[ 35] = 'ARP cache timeout';
DHCP_OPTION[ 36] = 'Ethernet encapsulation';
DHCP_OPTION[ 37] = 'Default TCP TTL';
DHCP_OPTION[ 38] = 'TCP keepalive interval';
DHCP_OPTION[ 39] = 'TCP keepalive garbage';
DHCP_OPTION[ 42] = 'NTP servers';
DHCP_OPTION[ 43] = 'Vendor specific information';
DHCP_OPTION[ 50] = 'Requested IP Address';
DHCP_OPTION[ 51] = 'IP address lease time';
DHCP_OPTION[ 52] = 'Option overload';
DHCP_OPTION[ 53] = 'DHCP message type';
DHCP_OPTION[ 54] = 'Server identifier';
DHCP_OPTION[ 55] = 'Parameter request list';
DHCP_OPTION[ 56] = 'Message';
DHCP_OPTION[ 57] = 'Maximum DHCP message size';
DHCP_OPTION[ 58] = 'Renew time value';
DHCP_OPTION[ 59] = 'Rebinding time value';
DHCP_OPTION[ 60] = 'Class-identifier';
DHCP_OPTION[ 61] = 'Client-identifier';
DHCP_OPTION[ 66] = 'TFTP server name';
DHCP_OPTION[ 67] = 'Bootfile name';
DHCP_OPTION[ 77] = 'User Class';
DHCP_OPTION[ 81] = 'FQDN, Fully Qualified Domain Name';
DHCP_OPTION[ 82] = 'Relay Agent Information';
DHCP_OPTION[ 91] = 'client-last-transaction-time';
DHCP_OPTION[ 92] = 'associated-ip';
DHCP_OPTION[ 93] = 'Client System Architecture Type';
DHCP_OPTION[ 94] = 'Client Network Interface Identifier';
DHCP_OPTION[ 97] = 'Client Machine Identifier';
DHCP_OPTION[100] = 'IEEE 1003.1 TZ String';
DHCP_OPTION[117] = 'Name Service Search';
DHCP_OPTION[118] = 'Subnet Selection';
DHCP_OPTION[119] = 'DNS domain search list';
DHCP_OPTION[124] = 'Vendor-Identifying Vendor Class';
DHCP_OPTION[125] = 'Vendor-Identifying Vendor-Specific';
DHCP_OPTION[150] = 'TFTP server address';
DHCP_OPTION[175] = 'Etherboot';
DHCP_OPTION[177] = 'Etherboot';
DHCP_OPTION[208] = 'pxelinux.magic';
DHCP_OPTION[209] = 'pxelinux.configfile (text)';
DHCP_OPTION[210] = 'pxelinux.pathprefix (text)';
DHCP_OPTION[211] = 'pxelinux.reboottime (unsigned integer 32 bits)';
DHCP_OPTION[220] = 'Subnet Allocation';
DHCP_OPTION[221] = 'Virtual Subnet Selection';
DHCP_OPTION[254] = 'Private use';
DHCP_OPTION[255] = 'End of Options';

exports.DHCP_OPTION = DHCP_OPTION;

var DHCP_MESSAGE_TYPE = [];
DHCP_MESSAGE_TYPE[1] = 'DHCPDISCOVER';
DHCP_MESSAGE_TYPE[2] = 'DHCPOFFER';
DHCP_MESSAGE_TYPE[3] = 'DHCPREQUEST';
DHCP_MESSAGE_TYPE[4] = 'DHCPDECLINE';
DHCP_MESSAGE_TYPE[5] = 'DHCPACK';
DHCP_MESSAGE_TYPE[6] = 'DHCPNAK';
DHCP_MESSAGE_TYPE[7] = 'DHCPRELEASE';
DHCP_MESSAGE_TYPE[8] = 'DHCPINFORM';
exports.DHCP_MESSAGE_TYPE = DHCP_MESSAGE_TYPE;

var DHCPPacket = function (op, htype, hlen, hops, xid, secs, flags, ciaddr,
    yiaddr, siaddr, giaddr, chaddr, sname, file, options) {
    this.op      = op;
    this.htype   = htype || 1;
    this.hlen    = hlen || 6;
    this.hops    = hops || 0;
    this.xid     = xid || 0;
    this.secs    = secs || 0;
    this.flags   = flags || 0;
    this.ciaddr  = ciaddr || 0;
    this.yiaddr  = yiaddr || 0;
    this.siaddr  = siaddr || 0;
    this.giaddr  = giaddr || 0;
    this.chaddr  = chaddr || 0;
    this.sname   = sname || '';
    this.file    = file || '';
    this.options = options || [];
};

exports.DHCPPacket = DHCPPacket;


DHCPPacket.parse = function (data) {
    var res =
        pack.unpack('CCCCNnnNNNNC16a64a128CCCCC*', data.toString('binary'));

    var pkt_op     = res[0];     // C
    var pkt_htype  = res[1];     // C
    var pkt_hlen   = res[2];     // C

    // assert pkt_hlen == 6

    var pkt_hops   = res[3];     // C
    var pkt_xid    = res[4];     // N
    var pkt_secs   = res[5];     // n
    var pkt_flags  = res[6];     // n
    var pkt_ciaddr = res[7];     // N
    var pkt_yiaddr = res[8];     // N
    var pkt_siaddr = res[9];     // N
    var pkt_giaddr = res[10];    // N
    var pkt_chaddr = sprintf('%02x:%02x:%02x:%02x:%02x:%02x',
        res[11], res[12], res[13], res[14], res[15], res[16]);

    // skip 17-26 as unused chaddr (since hlen == 6)

    var pkt_sname  = res[27];    // a64
    var pkt_file   = res[28];    // a128

    // TODO: check magic numbers in options
    // assert(99 == res[29]);
    // assert(130 == res[30]);
    // assert(83 == res[31]);
    // assert(99 == res[32]);

    var i = 33;
    var options = [];

    while (i < res.length) {
            var option = parseInt(res[i++], 10);
            if (option === 0) {
                    continue;
            }

            if (option == 255) {
                    // end of options option
                    break;
            } else {
                    // an option that will have data
                    var olen = res[i++]; // length of option data
                    var value = [];
                    for (var x = 0; x < olen; x++) {
                             value.push(res[i++]);
                    }
                    options[option] = value;
            }
    }

    return (new DHCPPacket(
        pkt_op, pkt_htype, pkt_hlen, pkt_hops, pkt_xid, pkt_secs,
        pkt_flags, pkt_ciaddr, pkt_yiaddr, pkt_siaddr, pkt_giaddr,
        pkt_chaddr, pkt_sname, pkt_file, options));
};


DHCPPacket.prototype.raw = function () {
    var opt_len = 0;
    var options = new Buffer(1200);
    var mac_octets = this.chaddr.split(':');

    for (var option in this.options) {
        if ((option > 0) && (option < 255)) {
            var value = this.options[parseInt(option, 10)];
            opt_len += options.write(pack.pack('CC',
                parseInt(option, 10), value.length), opt_len,
                'binary');
            for (var i = 0; i < value.length; i++) {
                opt_len += options.write(
                    pack.pack('C', value[i]), opt_len,
                    'binary');
            }
        }
    }

    options.write(pack.pack('C', parseInt('ff', 16)), opt_len++, 'binary');
    for (i = 0; i < 9; i++) {
        options.write(pack.pack('C', parseInt('00', 16)), opt_len++,
            'binary');
    }

    var res = pack.pack('CCCCNnnNNNNC16a64a128CCCC',
        this.op,
        this.htype,
        this.hlen,
        this.hops,
        this.xid,
        this.secs,
        this.flags,
        this.ciaddr,
        this.yiaddr,
        this.siaddr,
        this.giaddr,
        parseInt(mac_octets[0], 16),
        parseInt(mac_octets[1], 16),
        parseInt(mac_octets[2], 16),
        parseInt(mac_octets[3], 16),
        parseInt(mac_octets[4], 16),
        parseInt(mac_octets[5], 16),
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        this.sname,
        this.file,
        99,
        130,
        83,
        99);

    var raw = new Buffer(res.length + opt_len);
    var pos = raw.write(res, 0, 'binary');
    raw.write(options.toString('binary'), pos, 'binary');

    return (raw);
};


DHCPPacket.build_reply = function (packet, data) {
    var ip_octets;
    var pkt = new DHCPPacket;

    data['op'] = 2;  // request = 1, reply = 2

    for (var prop in packet) {
        if (prop != 'options') {
            if (data[prop] == undefined) {
                pkt[prop] = packet[prop];
            } else {
                switch (prop) {
                    case 'ciaddr':
                    case 'yiaddr':
                    case 'siaddr':
                    case 'giaddr':
                        ip_octets =
                            data[prop].split('.');
                        pkt[prop] = pack.unpack('N', pack.pack('CCCC',
                            parseInt(ip_octets[0], 10),
                            parseInt(ip_octets[1], 10),
                            parseInt(ip_octets[2], 10),
                            parseInt(ip_octets[3], 10)))[0];
                        break;
                    default:
                        pkt[prop] = data[prop];
                        break;
                }
            }
        } else {
            for (var opt in data['options']) {
                var value = data['options'][opt];

                switch (parseInt(opt, 10)) {
                    // 1 byte integer
                    case 53: // message type
                        pkt.options[opt] = [DHCP_MESSAGE_TYPE.indexOf(value)];
                        break;
                    // IP options
                    case 54: // server identifier
                    case 3:  // router
                    case 1:  // subnet mask
                        ip_octets = value.split('.');
                        pkt.options[opt] = [
                                parseInt(ip_octets[0], 10),
                                parseInt(ip_octets[1], 10),
                                parseInt(ip_octets[2], 10),
                                parseInt(ip_octets[3], 10)];
                        break;
                    // IP list options
                    case 6:  // domain name server
                        var ip_list = [];

                        for (var i = 0; i < value.length; i++) {
                            ip_octets = value[i].split('.');
                            ip_list.push(parseInt(ip_octets[0], 10));
                            ip_list.push(parseInt(ip_octets[1], 10));
                            ip_list.push(parseInt(ip_octets[2], 10));
                            ip_list.push(parseInt(ip_octets[3], 10));
                        }
                        pkt.options[opt] = ip_list;
                        break;
                    // string options
                    case 150: // grub menu
                    case 67:  // boot filename
                    case 12:  // hostname
                        pkt.options[opt] = [];
                        for (var j = 0; j < value.length; j++) {
                                pkt.options[opt].push(value.charCodeAt(j));
                        }
                        break;
                    // 4 byte integers
                    case 51:  // lease time
                        pkt.options[opt] = pack.unpack('CCCC',
                                pack.pack('N', parseInt(value, 10)));
                        break;
                    default:
                        throw new Error('Ignoring unhandled option ' + opt);
                }

                if (pkt.options[opt] != undefined) {
                    var arg_array = [];
                    var fmt = '';
                    for (var k = 0; k < pkt.options[opt].length; k++) {
                            arg_array.push(pkt.options[opt][k]);
                            fmt = '%02x ' +fmt;
                    }
                    arg_array.unshift(fmt);
                }
            }
        }
    }

    return (pkt);
};


DHCPPacket.prototype.log_dump = function (logger) {
    if (typeof (logger) == 'undefined') {
        logger = function (msg) {
            slog(msg);
        };
    }

    logger('==== BEGIN PACKET ====');
    logger(sprintf('OP:     0x%02x', this.op));
    logger(sprintf('HTYPE:  0x%02x', this.htype));
    logger(sprintf('HLEN:   0x%02x', this.hlen));
    logger(sprintf('HOPS:   0x%02x', this.hops));
    logger(sprintf('XID:    0x%08x', this.xid));
    logger(sprintf('SECS:   0x%04x (%d)', this.secs, this.secs));
    logger(sprintf('FLAGS:  0x%04x', this.flags));
    logger(sprintf('CIADDR: 0x%08x', this.ciaddr));
    logger(sprintf('YIADDR: 0x%08x', this.yiaddr));
    logger(sprintf('SIADDR: 0x%08x', this.siaddr));
    logger(sprintf('GIADDR: 0x%08x', this.giaddr));
    logger(sprintf('CHADDR: %s',     this.chaddr));
    logger(sprintf('SNAME:  %s',     this.sname));
    logger(sprintf('FILE:   %s',     this.file));

    for (var key in this.options) {
        var arg_array = [];
        var fmt = '';
        for (var i = 0; i < this.options[key].length; i++) {
            arg_array.push(this.options[key][i]);
            fmt = '%02x ' + fmt;
        }
        arg_array.unshift(fmt);
        var data = sprintf.apply(null, arg_array);
        if (DHCP_OPTION[key] == 'DHCP message type') {
            logger(sprintf('OPTION[DHCP message type] = %d = %s',
                this.options[key], DHCP_MESSAGE_TYPE[this.options[key]]));
        } else {
            logger(sprintf('OPTION[%d][%s]: len: %d (%s)',
                key, DHCP_OPTION[key], this.options[key].length, data));
        }
    }
    logger('===== END PACKET =====');
};


DHCPPacket.prototype.dump = function () {
    var packet = {
        op: sprintf('0x%02x', this.op),
        htype: sprintf('0x%02x', this.htype),
        hlen: sprintf('0x%02x', this.hlen),
        hops: sprintf('0x%02x', this.hops),
        xid: sprintf('0x%08x', this.xid),
        secs: sprintf('0x%04x (%d)', this.secs, this.secs),
        flags: sprintf('0x%04x', this.flags),
        ciaddr: sprintf('0x%08x', this.ciaddr),
        yiaddr: sprintf('0x%08x', this.yiaddr),
        siaddr: sprintf('0x%08x', this.siaddr),
        giaddr: sprintf('0x%08x', this.giaddr),
        chaddr: sprintf('%s', this.chaddr),
        sname: sprintf('%s', this.sname),
        file: sprintf('%s', this.file),
        options: { }
    };

    for (var key in this.options) {
        var arg_array = [];
        var fmt = '';
        for (var i = 0; i < this.options[key].length; i++) {
            arg_array.push(this.options[key][i]);
            fmt = '%02x ' + fmt;
        }
        arg_array.unshift(fmt);
        var data = sprintf.apply(null, arg_array);
        if (DHCP_OPTION[key] == 'DHCP message type') {
            packet.options['DHCP message type'] = {
                value: this.options[key],
                desc: DHCP_MESSAGE_TYPE[this.options[key]]
            };
        } else {
            packet.options[key] = {
                value: data,
                len: this.options[key].length,
                desc: DHCP_OPTION[key]
            };
        }
    }

    return packet;
};
