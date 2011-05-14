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
                if (result.errors) {
                    //throw new Error(JSON.stringify(result));
                    throw JSON.stringify(result);
                }
                if (result.update) {
                    out(result);
                } else {
                    callback(null, result);
                    stream.end();
                }
            }
            buffer = chunks.pop();
        });

        stream.connect(socket);
    } catch (e) {
        callback(e);
    }
}
