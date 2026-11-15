/**
 * Sala entre dos navegadores. El anfitrión reparte color y comienzo;
 * el código de cuatro letras es el punto de encuentro.
 */

import { connectBroker } from './mqtt.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeCode(bytes = crypto.getRandomValues(new Uint8Array(4))) {
  return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

export function makeClientId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `a${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function hostColor(value) {
  if (value === 'w' || value === 'b') return value;
  return Math.random() < 0.5 ? 'w' : 'b';
}

export function createCloudSession({
  connect = connectBroker,
  page = typeof location !== 'undefined' ? location.href : '',
  code = makeCode,
  selfId = makeClientId(),
  retryMs = 1500,
  joinTimeout = 12000,
} = {}) {
  let handler = () => {};
  let link = null;
  let role = null;
  let room = null;
  let guestId = null;
  let started = false;
  let closed = false;
  let helloTimer = null;
  let joinTimer = null;

  function emit(message) {
    handler(message);
  }

  function stopWaiting() {
    clearInterval(helloTimer);
    clearTimeout(joinTimer);
    helloTimer = null;
    joinTimer = null;
  }

  async function open(roomCode) {
    if (link) return;
    link = await connect(`ajedrez/${roomCode}`, selfId);
    link.onmessage = onPacket;
    link.onclose = () => {
      if (!closed) emit({ type: 'left' });
    };
  }

  function onPacket(data) {
    if (!data || data.from === selfId) return;
    if (data.type === 'bye') {
      emit({ type: 'left' });
      return;
    }
    if (role === 'host' && data.type === 'hello') {
      if (started) {
        if (data.from !== guestId) link.publish({ type: 'full', to: data.from, from: selfId });
        return;
      }
      guestId = data.from;
      started = true;
      const guestColor = room.color === 'w' ? 'b' : 'w';
      emit({ type: 'begin', mode: room.mode, clock: room.clock, color: room.color, room: room.code });
      link.publish({
        type: 'start',
        from: selfId,
        mode: room.mode,
        clock: room.clock,
        color: guestColor,
        room: room.code,
      });
      return;
    }
    if (role === 'guest' && data.type === 'start' && !started) {
      started = true;
      stopWaiting();
      emit({ type: 'begin', mode: data.mode, clock: data.clock, color: data.color, room: data.room });
      return;
    }
    if (role === 'guest' && data.type === 'full' && data.to === selfId && !started) {
      stopWaiting();
      emit({ type: 'error', message: 'La sala ya está completa' });
      return;
    }
    if (data.type === 'play' && data.action) emit({ type: 'action', action: data.action });
  }

  return {
    ready: Promise.resolve(),
    listen(next) {
      handler = next;
    },
    async send(message) {
      if (message.type === 'create') {
        role = 'host';
        const color = hostColor(message.color);
        room = {
          code: code(),
          mode: message.mode === 'didactic' ? 'didactic' : 'classic',
          clock: typeof message.clock === 'string' ? message.clock : '10+0',
          color,
        };
        await open(room.code);
        const pageUrl = page.split('#')[0].split('?')[0];
        emit({
          type: 'lobby',
          role: 'host',
          room: room.code,
          color,
          mode: room.mode,
          clock: room.clock,
          online: true,
          urls: pageUrl ? [pageUrl] : [],
        });
        return;
      }
      if (message.type === 'join') {
        role = 'guest';
        const roomCode = String(message.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
        if (roomCode.length !== 4) {
          emit({ type: 'error', message: 'Esa sala no existe' });
          return;
        }
        await open(roomCode);
        const hello = () => link?.publish({ type: 'hello', from: selfId, room: roomCode });
        hello();
        helloTimer = setInterval(hello, retryMs);
        joinTimer = setTimeout(() => {
          stopWaiting();
          if (!started && !closed) emit({ type: 'error', message: 'Esa sala no existe' });
        }, joinTimeout);
        return;
      }
      if (message.type === 'action' && link) {
        link.publish({ type: 'play', from: selfId, action: message.action });
        emit({ type: 'action', action: message.action });
      }
    },
    close() {
      closed = true;
      stopWaiting();
      try { link?.publish({ type: 'bye', from: selfId }); } catch { /* la sala ya se cerró */ }
      link?.close();
      link = null;
    },
  };
}
