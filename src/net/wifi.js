/**
 * Sala de dos. Si esta página corre con el servidor local, usa esa WiFi.
 * En GitHub Pages los dos navegadores se encuentran con el código.
 */

import { createCloudSession } from './cloud.js';

function onGitHubPages() {
  return typeof location !== 'undefined' && /(^|\.)github\.io$/.test(location.hostname);
}

function wrapSocket(socket) {
  return {
    ready: Promise.resolve(),
    send(message) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
    listen(handler) {
      socket.addEventListener('message', (event) => {
        try {
          handler(JSON.parse(event.data));
        } catch {
          handler({ type: 'error', message: 'Mensaje ilegible' });
        }
      });
    },
    close() {
      socket.close();
    },
  };
}

function tryLocal(timeout = 1200) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return new Promise((resolve) => {
    let socket;
    try {
      socket = new WebSocket(`${protocol}//${location.host}/ws`);
    } catch {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      socket.close();
      finish(null);
    }, timeout);
    socket.addEventListener('open', () => finish(wrapSocket(socket)));
    socket.addEventListener('error', () => {
      socket.close();
      finish(null);
    });
  });
}

export async function openMatch() {
  if (!onGitHubPages()) {
    const local = await tryLocal();
    if (local) return local;
  }
  return createCloudSession();
}

export async function hostAddresses() {
  try {
    const response = await fetch('/api/host');
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.urls) ? data.urls : [];
  } catch {
    return [];
  }
}
