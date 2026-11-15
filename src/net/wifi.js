/**
 * Sala por WiFi. El anfitrión corre este proyecto y el otro dispositivo entra al mismo origen.
 */

export function openSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/ws`);
  let opened = false;
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', () => {
      opened = true;
      resolve();
    });
    socket.addEventListener('error', () => {
      if (!opened) reject(new Error('En esta dirección no hay sala. Ábrela desde el equipo anfitrión, en la misma WiFi.'));
    });
  });
  return {
    ready,
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
