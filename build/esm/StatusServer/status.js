/**
 * @author Luuxis
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 */
import net from 'net';
import createBuffer from './buffer.js';
function ping(server, port, callback, timeout, protocol = '') {
    let start = new Date();
    let socket = net.connect({
        port: port,
        host: server
    }, () => {
        let handshakeBuffer = new createBuffer();
        handshakeBuffer.writeletInt(0);
        handshakeBuffer.writeletInt(protocol);
        handshakeBuffer.writeString(server);
        handshakeBuffer.writeUShort(port);
        handshakeBuffer.writeletInt(1);
        writePCBuffer(socket, handshakeBuffer);
        let setModeBuffer = new createBuffer();
        setModeBuffer.writeletInt(0);
        writePCBuffer(socket, setModeBuffer);
    });
    socket.setTimeout(timeout, () => {
        if (callback)
            callback(new Error("Socket timed out when connecting to " + server + ":" + port), null);
        socket.destroy();
    });
    let readingBuffer = Buffer.alloc(0);
    socket.on('data', data => {
        readingBuffer = Buffer.concat([readingBuffer, data]);
        let buffer = new createBuffer(readingBuffer);
        let length;
        try {
            length = buffer.readletInt();
        }
        catch (err) {
            return;
        }
        if (readingBuffer.length < length - buffer.offset())
            return;
        buffer.readletInt();
        try {
            let end = new Date();
            let json = JSON.parse(buffer.readString());
            callback(null, {
                error: false,
                ms: Math.round(end - start),
                version: json.version.name,
                playersConnect: json.players.online,
                playersMax: json.players.max
            });
        }
        catch (err) {
            return callback(err, null);
        }
        socket.destroy();
    });
    socket.once('error', err => {
        if (callback)
            callback(err, null);
        socket.destroy();
    });
}
;
function writePCBuffer(client, buffer) {
    let length = new createBuffer();
    length.writeletInt(buffer.buffer().length);
    client.write(Buffer.concat([length.buffer(), buffer.buffer()]));
}
export default class status {
    constructor(ip = '0.0.0.0', port = 25565) {
        this.ip = ip;
        this.port = port;
    }
    async getStatus() {
        return await new Promise((resolve, reject) => {
            ping(this.ip, this.port, (err, res) => {
                if (err)
                    return reject({ error: err });
                return resolve(res);
            }, 3000);
        });
    }
}
//# sourceMappingURL=status.js.map