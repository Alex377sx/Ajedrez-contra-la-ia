/**
 * Cliente mínimo MQTT 3.1.1 sobre WebSocket, para que dos navegadores
 * se encuentren sin un servidor propio.
 */

const BROKERS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeRemaining(length) {
  const out = [];
  let n = length;
  do {
    let digit = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) digit |= 0x80;
    out.push(digit);
  } while (n > 0);
  return out;
}

export function concat(parts) {
  const len = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function strField(value) {
  const body = encoder.encode(value);
  const out = new Uint8Array(2 + body.length);
  out[0] = body.length >> 8;
  out[1] = body.length & 0xff;
  out.set(body, 2);
  return out;
}

function packet(typeByte, body) {
  return concat([new Uint8Array([typeByte, ...encodeRemaining(body.length)]), body]);
}

export function connectPacket(clientId, willTopic, willPayload) {
  return packet(0x10, concat([
    strField('MQTT'),
    new Uint8Array([4, 0x06, 0x00, 0x3c]),
    strField(clientId),
    strField(willTopic),
    strField(willPayload),
  ]));
}

export function subscribePacket(id, topic) {
  return packet(0x82, concat([
    new Uint8Array([(id >> 8) & 0xff, id & 0xff]),
    strField(topic),
    new Uint8Array([0]),
  ]));
}

export function publishPacket(topic, payload) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return packet(0x30, concat([strField(topic), encoder.encode(text)]));
}

export function parsePackets(buffer) {
  const packets = [];
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let index = 0;
  while (index < bytes.length) {
    const type = bytes[index];
    let multiplier = 1;
    let remaining = 0;
    let cursor = index + 1;
    let encoded = 0;
    for (;;) {
      if (cursor >= bytes.length) return { packets, rest: bytes.slice(index) };
      const digit = bytes[cursor++];
      remaining += (digit & 127) * multiplier;
      encoded += 1;
      if (encoded > 4) throw new Error('Paquete MQTT inválido');
      multiplier *= 128;
      if ((digit & 128) === 0) break;
    }
    if (cursor + remaining > bytes.length) return { packets, rest: bytes.slice(index) };
    packets.push({ type, body: bytes.slice(cursor, cursor + remaining) });
    index = cursor + remaining;
  }
  return { packets, rest: new Uint8Array(0) };
}

export function publishPayload(body) {
  const topicLength = (body[0] << 8) | body[1];
  return decoder.decode(body.slice(2 + topicLength));
}

export function connectBroker(topic, clientId, { timeout = 4000 } = {}) {
  const will = JSON.stringify({ type: 'bye', from: clientId });
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const attempt = (index) => {
      if (index >= BROKERS.length) {
        fail(new Error('No se pudo abrir la sala. Inténtalo de nuevo.'));
        return;
      }
      let socket;
      try {
        socket = new WebSocket(BROKERS[index], ['mqtt']);
      } catch {
        attempt(index + 1);
        return;
      }
      socket.binaryType = 'arraybuffer';
      let rest = new Uint8Array(0);
      let opened = false;
      let moved = false;
      let ping = null;
      const next = () => {
        if (moved || opened || settled) return;
        moved = true;
        clearTimeout(giveUp);
        attempt(index + 1);
      };
      const giveUp = setTimeout(() => {
        try { socket.close(); } catch { /* el intento ya murió */ }
        next();
      }, timeout);
      const api = {
        publish(value) {
          if (socket.readyState === WebSocket.OPEN) socket.send(publishPacket(topic, value));
        },
        close() {
          clearInterval(ping);
          socket.close();
        },
        onmessage() {},
        onclose() {},
      };
      socket.addEventListener('open', () => {
        socket.send(connectPacket(clientId, topic, will));
      });
      socket.addEventListener('error', () => {
        if (!opened) socket.close();
      });
      socket.addEventListener('close', () => {
        clearInterval(ping);
        if (!opened) next();
        else api.onclose();
      });
      socket.addEventListener('message', (event) => {
        const chunk = new Uint8Array(event.data);
        const parsed = parsePackets(concat([rest, chunk]));
        rest = parsed.rest;
        for (const item of parsed.packets) {
          const kind = item.type >> 4;
          if (kind === 2) {
            if (item.body[1] !== 0) {
              socket.close();
              return;
            }
            socket.send(subscribePacket(1, topic));
          } else if (kind === 9) {
            if (opened) continue;
            opened = true;
            settled = true;
            clearTimeout(giveUp);
            ping = setInterval(() => {
              if (socket.readyState === WebSocket.OPEN) socket.send(new Uint8Array([0xc0, 0x00]));
            }, 25000);
            resolve(api);
          } else if (kind === 3) {
            try {
              api.onmessage(JSON.parse(publishPayload(item.body)));
            } catch {
              /* un aviso ajeno no corta la partida */
            }
          }
        }
      });
    };
    attempt(0);
  });
}
