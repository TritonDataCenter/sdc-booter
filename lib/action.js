var net = require('net');

exports.sendAction = function(action, data, socket, callback)
{
    var stream = net.Stream();
    var packet = { "action": action, "payload": data };
    var chunks, buffer = '';

    try {
        stream.setEncoding('utf8');

        stream.on('connect', function () {
            stream.write(JSON.stringify(packet) + '\n\n');
        });

        stream.on('data', function (chunk) {
            var result;
            buffer += chunk.toString();
            chunks = buffer.split('\n');
            while (chunks.length > 1) {
                result = JSON.parse(chunks.shift());
                switch (result.type) {
                case 'update':
                    out(result);
                    break;
                case 'success':
                    callback(null, result);
                    stream.end();
                    break;
                case 'failure':
                default:
                    //throw new Error(JSON.stringify(result));
                    callback(JSON.stringify(result));
                }
            }
            buffer = chunks.pop();
        });

        stream.connect(socket);
    } catch (e) {
        callback(e);
    }
}
