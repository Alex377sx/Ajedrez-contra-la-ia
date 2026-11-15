import assert from 'node:assert/strict';
import test from 'node:test';
import { concat, connectPacket, parsePackets, publishPacket, publishPayload, subscribePacket } from '../src/net/mqtt.js';
import { createCloudSession, makeCode } from '../src/net/cloud.js';

test('los paquetes MQTT se leen completos', () => {
  const connect = connectPacket('abc', 'ajedrez/ABCD', '{"type":"bye"}');
  const subscribe = subscribePacket(1, 'ajedrez/ABCD');
  const publish = publishPacket('ajedrez/ABCD', { type: 'hello', from: 'abc' });
  const parsed = parsePackets(concat([connect, subscribe, publish]));
  assert.equal(parsed.rest.length, 0);
  assert.equal(parsed.packets.length, 3);
  assert.equal(parsed.packets[0].type >> 4, 1);
  assert.equal(parsed.packets[1].type >> 4, 8);
  assert.equal(JSON.parse(publishPayload(parsed.packets[2].body)).type, 'hello');
});

test('un paquete cortado espera el resto', () => {
  const publish = publishPacket('ajedrez/ABCD', { ok: true });
  const head = parsePackets(publish.slice(0, 4));
  assert.equal(head.packets.length, 0);
  const done = parsePackets(concat([head.rest, publish.slice(4)]));
  assert.equal(JSON.parse(publishPayload(done.packets[0].body)).ok, true);
});

function memoryConnect() {
  const topics = new Map();
  return (topic) => {
    if (!topics.has(topic)) topics.set(topic, new Set());
    const room = topics.get(topic);
    let onmessage = () => {};
    let onclose = () => {};
    const api = {
      publish(value) {
        for (const other of room) if (other !== api) other._in(value);
      },
      _in(value) { onmessage(value); },
      close() {
        room.delete(api);
        onclose();
      },
      set onmessage(fn) { onmessage = fn; },
      get onmessage() { return onmessage; },
      set onclose(fn) { onclose = fn; },
    };
    room.add(api);
    return Promise.resolve(api);
  };
}

test('el anfitrión crea la sala y el invitado entra con el color contrario', async () => {
  const connect = memoryConnect();
  let n = 0;
  const host = createCloudSession({
    connect,
    page: 'https://alex377sx.github.io/Ajedrez-contra-la-ia/',
    code: () => makeCode(new Uint8Array([0, 1, 2, 3])),
    selfId: 'host',
    retryMs: 20,
    joinTimeout: 200,
  });
  const guest = createCloudSession({
    connect,
    selfId: 'guest',
    retryMs: 20,
    joinTimeout: 200,
  });
  const hostEvents = [];
  const guestEvents = [];
  host.listen((message) => hostEvents.push(message));
  guest.listen((message) => guestEvents.push(message));
  await host.send({ type: 'create', mode: 'classic', clock: '10+0', color: 'w' });
  assert.equal(hostEvents[0].type, 'lobby');
  assert.equal(hostEvents[0].room, 'ABCD');
  assert.equal(hostEvents[0].online, true);
  await guest.send({ type: 'join', room: 'abcd' });
  await new Promise((resolve) => setTimeout(resolve, 30));
  const hostBegin = hostEvents.find((message) => message.type === 'begin');
  const guestBegin = guestEvents.find((message) => message.type === 'begin');
  assert.equal(hostBegin.color, 'w');
  assert.equal(guestBegin.color, 'b');
  assert.equal(guestBegin.mode, 'classic');
  await host.send({ type: 'action', action: { kind: 'move', input: { from: 'e2', to: 'e4' } } });
  await guest.send({ type: 'action', action: { kind: 'move', input: { from: 'e7', to: 'e5' } } });
  const hostMoves = hostEvents.filter((message) => message.type === 'action');
  const guestMoves = guestEvents.filter((message) => message.type === 'action');
  assert.equal(hostMoves.length, 2);
  assert.equal(guestMoves.length, 2);
  assert.equal(hostMoves[1].action.input.to, 'e5');
  assert.equal(guestMoves[0].action.input.to, 'e4');
  host.close();
  guest.close();
});

test('un código sin anfitrión avisa que la sala no existe', async () => {
  const guest = createCloudSession({
    connect: memoryConnect(),
    selfId: 'guest',
    retryMs: 20,
    joinTimeout: 40,
  });
  const events = [];
  guest.listen((message) => events.push(message));
  await guest.send({ type: 'join', room: 'ZZZZ' });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(events.at(-1).message, 'Esa sala no existe');
  guest.close();
});
