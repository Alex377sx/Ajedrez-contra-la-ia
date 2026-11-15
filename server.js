import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};
const rooms = new Map();

function lanAddresses() {
  const urls = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) urls.push(`http://${entry.address}:${port}`);
    }
  }
  return urls;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 200_000) {
        reject(new Error('cuerpo demasiado grande'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function proxyAi(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'JSON inválido' }));
    return;
  }
  if (!payload.apiKey || !Array.isArray(payload.messages)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Faltan clave o mensajes' }));
    return;
  }
  const upstream = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${payload.apiKey}`,
    },
    body: JSON.stringify({
      model: payload.model || 'grok-3',
      messages: payload.messages,
      temperature: payload.temperature ?? 0.4,
    }),
  });
  const text = await upstream.text();
  res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(text);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const requested = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(root, requested);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    res.writeHead(403);
    res.end('Prohibido');
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado');
      return;
    }
    const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' };
    if (req.method === 'HEAD') {
      res.writeHead(200, headers);
      res.end();
      return;
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    const bytes = randomBytes(4);
    for (const byte of bytes) code += alphabet[byte % alphabet.length];
  } while (rooms.has(code));
  return code;
}

function sendText(socket, text) {
  if (!socket || socket.destroyed) return;
  const data = Buffer.from(text);
  const len = data.length;
  let header;
  if (len < 126) header = Buffer.from([0x81, len]);
  else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  socket.write(Buffer.concat([header, data]));
}

function sendJson(socket, payload) {
  sendText(socket, JSON.stringify(payload));
}

function attachSocket(socket, onMessage, onClose) {
  let buf = Buffer.alloc(0);
  let fragments = [];
  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    onClose();
  };
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const opcode = buf[0] & 0x0f;
      const fin = (buf[0] & 0x80) !== 0;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        const big = buf.readBigUInt64BE(2);
        if (big > 1_000_000n) {
          socket.destroy();
          finish();
          return;
        }
        len = Number(big);
        offset = 10;
      }
      const maskLen = masked ? 4 : 0;
      if (buf.length < offset + maskLen + len) return;
      let payload = buf.subarray(offset + maskLen, offset + maskLen + len);
      if (masked) {
        const mask = buf.subarray(offset, offset + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
      }
      buf = buf.subarray(offset + maskLen + len);
      if (opcode === 0x8) {
        socket.end();
        finish();
        return;
      }
      if (opcode === 0x9) {
        const pong = Buffer.concat([Buffer.from([0x8a, payload.length]), payload]);
        socket.write(pong);
        continue;
      }
      if (opcode === 0x1) fragments = [payload];
      else if (opcode === 0x0) fragments.push(payload);
      else continue;
      if (fin) {
        const text = Buffer.concat(fragments).toString('utf8');
        fragments = [];
        onMessage(text);
      }
    }
  });
  socket.on('close', finish);
  socket.on('error', finish);
}

function broadcast(room, payload) {
  for (const seat of [room.host, room.guest]) {
    if (seat?.socket) sendJson(seat.socket, payload);
  }
}

function seatByToken(room, token) {
  if (room.host?.token === token) return room.host;
  if (room.guest?.token === token) return room.guest;
  return null;
}

function handleClient(socket) {
  let room = null;
  let seat = null;
  const leave = () => {
    if (!room || !seat) return;
    const code = room.code;
    const other = seat === room.host ? room.guest : room.host;
    if (seat === room.host) room.host = null;
    else room.guest = null;
    if (other?.socket) sendJson(other.socket, { type: 'left' });
    if (!room.host && !room.guest) rooms.delete(code);
    room = null;
    seat = null;
  };
  attachSocket(socket, (text) => {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      sendJson(socket, { type: 'error', message: 'Mensaje ilegible' });
      return;
    }
    if (msg.type === 'create') {
      const code = roomCode();
      const color = msg.color === 'b' ? 'b' : msg.color === 'w' ? 'w' : (Math.random() < 0.5 ? 'w' : 'b');
      room = {
        code,
        mode: msg.mode === 'didactic' ? 'didactic' : 'classic',
        clock: typeof msg.clock === 'string' ? msg.clock : '10+0',
        host: { socket, token: randomBytes(16).toString('hex'), color, role: 'host' },
        guest: null,
      };
      seat = room.host;
      rooms.set(code, room);
      sendJson(socket, {
        type: 'lobby',
        role: 'host',
        room: code,
        token: seat.token,
        color,
        mode: room.mode,
        clock: room.clock,
        urls: [`http://127.0.0.1:${port}`, ...lanAddresses()],
      });
      return;
    }
    if (msg.type === 'join') {
      const found = rooms.get(String(msg.room || '').toUpperCase());
      if (!found || !found.host) {
        sendJson(socket, { type: 'error', message: 'Esa sala no existe' });
        return;
      }
      if (found.guest) {
        sendJson(socket, { type: 'error', message: 'La sala ya está completa' });
        return;
      }
      room = found;
      seat = {
        socket,
        token: randomBytes(16).toString('hex'),
        color: room.host.color === 'w' ? 'b' : 'w',
        role: 'guest',
      };
      room.guest = seat;
      const info = { mode: room.mode, clock: room.clock, room: room.code };
      sendJson(room.host.socket, { type: 'begin', ...info, color: room.host.color, token: room.host.token });
      sendJson(socket, { type: 'begin', ...info, color: seat.color, token: seat.token });
      return;
    }
    if (msg.type === 'action') {
      const current = room && seatByToken(room, msg.token);
      if (!current || !room.guest) {
        sendJson(socket, { type: 'error', message: 'La sala todavía no está completa' });
        return;
      }
      broadcast(room, { type: 'action', action: msg.action });
    }
  }, leave);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/api/host') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ urls: [`http://127.0.0.1:${port}`, ...lanAddresses()] }));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/ai') {
      await proxyAi(req, res);
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(req, res);
      return;
    }
    res.writeHead(405);
    res.end('Método no permitido');
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Error del servidor');
  }
});

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const key = req.headers['sec-websocket-key'];
  if (url.pathname !== '/ws' || !key) {
    socket.destroy();
    return;
  }
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  handleClient(socket);
});

server.listen(port, '0.0.0.0', () => {
  console.log([`http://127.0.0.1:${port}`, ...lanAddresses()].join('\n'));
});
