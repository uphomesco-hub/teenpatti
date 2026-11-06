import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/lib/transport.js', import.meta.url), 'utf8');
let moduleId = 0;

async function withTransport(href, run) {
  const original = { window: globalThis.window, WebSocket: globalThis.WebSocket, fetch: globalThis.fetch };
  const connections = [];
  class FakeWebSocket extends EventTarget {
    static OPEN = 1;
    constructor(url) {
      super();
      connections.push(new URL(url).href);
      this.readyState = 1;
      queueMicrotask(() => this.dispatchEvent(new Event('open')));
    }
    addEventListener(...args) { super.addEventListener(...args); }
    close() { this.readyState = 3; }
  }
  globalThis.window = { location: new URL(href), setTimeout, clearTimeout };
  globalThis.WebSocket = FakeWebSocket;
  try {
    const code = source.replaceAll('import.meta.env', JSON.stringify({ BASE_URL: './', DEV: false }));
    const { socket } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#${moduleId++}`);
    await run(socket, connections);
  } finally {
    Object.assign(globalThis, original);
  }
}

test('production relative base resolves to a valid local WebSocket address', async () => {
  await withTransport('http://127.0.0.1:8787/#/table/ABC123', async (socket, connections) => {
    await socket.connect();
    assert.deepEqual(connections, ['ws://127.0.0.1:8787/ws']);
  });
});

test('permanent game link discovers the PC server', async () => {
  await withTransport('https://uphomesco-hub.github.io/teenpatti/#/?join=ABC123', async (socket, connections) => {
    globalThis.fetch = async (url) => {
      assert.ok(url.startsWith('https://raw.githubusercontent.com/uphomesco-hub/teenpatti/pc-host/server.json?'));
      return { ok: true, json: async () => ({ url: 'https://test-game.trycloudflare.com' }) };
    };
    await socket.connect();
    assert.deepEqual(connections, ['wss://test-game.trycloudflare.com/ws']);
  });
});

test('failed discovery can recover and uses the updated PC address', async () => {
  await withTransport('https://uphomesco-hub.github.io/teenpatti/', async (socket, connections) => {
    globalThis.fetch = async () => ({ ok: false });
    await assert.rejects(socket.connect(), /PC game server is unavailable/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ url: 'https://new-game.trycloudflare.com' }) });
    await socket.connect();
    assert.deepEqual(connections, ['wss://new-game.trycloudflare.com/ws']);
  });
});

test('a replaced tab does not repeatedly steal the session back', async () => {
  await withTransport('http://127.0.0.1:8787/', async (socket) => {
    await socket.connect();
    socket.session = { roomId: 'ABC123', playerToken: 'stored-token' };
    const event = new Event('close');
    Object.assign(event, { code: 1000, reason: 'Session moved to a new connection' });
    socket.ws.dispatchEvent(event);
    assert.equal(socket.explicitlyLeaving, true);
    assert.equal(socket.reconnectTimer, null);
    assert.equal(socket.session.playerToken, 'stored-token');
  });
});
