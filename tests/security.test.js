import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { WebSocket } from 'ws';
import { validMessage, createRateLimiter } from '../server/security.js';
import { sandboxProfile, gameEnvironment } from '../scripts/game-sandbox.mjs';

let server;
let url;
let port;
const sockets = [];
before(async () => {
  const listener = createServer().listen(0, '127.0.0.1');
  await once(listener, 'listening');
  port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  url = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) }, stdio: 'pipe',
  });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (data) => { if (String(data).includes('listening')) resolve(); });
    server.once('error', reject);
    server.once('exit', (code) => reject(new Error(`Server exited: ${code}`)));
  });
});
after(async () => {
  for (const ws of sockets) ws.terminate();
  server.kill('SIGTERM');
  await once(server, 'exit');
});
async function connect(options) {
  const ws = new WebSocket(url.replace('http:', 'ws:') + '/ws', options);
  ws.on('error', () => {});
  sockets.push(ws);
  await once(ws, 'open');
  return ws;
}
function command(ws, type, payload, expected) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`Timeout: ${type}`)), 3000);
    const receive = (raw) => {
      const message = JSON.parse(raw);
      if (message.event === expected) finish(null, message.payload);
      else if (message.event === 'game_error') finish(new Error(message.payload.message));
    };
    function finish(error, result) {
      clearTimeout(timer);
      ws.off('message', receive);
      if (error) reject(error); else resolve(result);
    }
    ws.on('message', receive);
    ws.send(JSON.stringify({ kind: 'command', type, payload }));
  });
}
async function health() {
  const response = await fetch(`${url}/health`);
  assert.equal(response.status, 200);
  return response.json();
}

test('malformed HTTP paths cannot crash the server', async () => {
  assert.equal((await fetch(`${url}/%ZZ`)).status, 400);
  assert.equal((await health()).ok, true);
});

test('only public build assets are served, including symlink containment', async () => {
  for (const target of ['/.env', '/.git/config', '/server/index.js', '/etc/passwd', '/%2e%2e/.ssh/id_rsa']) {
    assert.equal((await fetch(url + target)).status, 404, target);
  }
  const directory = path.join(os.tmpdir(), `teenpatti-probe-${process.pid}`);
  await mkdir(directory, { recursive: true });
  const canary = path.join(directory, 'canary');
  const linked = path.resolve(`dist/assets/security-probe-${process.pid}.js`);
  await mkdir(path.dirname(linked), { recursive: true });
  await writeFile(canary, 'private-canary-data');
  await symlink(canary, linked);
  try {
    const response = await fetch(`${url}/assets/${path.basename(linked)}`);
    assert.equal(response.status, 404);
    assert.ok(!(await response.text()).includes('private-canary-data'));
  } finally {
    await rm(linked);
    await rm(directory, { recursive: true });
  }
});

test('invalid WebSocket frames close that connection without crashing Node', async () => {
  const ws = await connect();
  const closed = once(ws, 'close');
  ws._socket.write(Buffer.from([0xc1, 0x80, 0, 0, 0, 0]));
  await closed;
  assert.equal((await health()).ok, true);
});

test('oversized WebSocket messages are rejected', async () => {
  const ws = await connect();
  const closed = once(ws, 'close');
  ws.send('x'.repeat(32 * 1024));
  assert.equal((await closed)[0], 1009);
  assert.equal((await health()).ok, true);
});

test('malformed command types cannot crash a room or the process', async () => {
  const ws = await connect();
  const created = await command(ws, 'create_room', { username: 'Security QA' }, 'room_created');
  const malformed = await command(ws, 'update_config', { roomId: created.roomId, config: { jokerRanks: {} } }, 'game_error');
  assert.equal(malformed.message, 'Malformed message.');
  assert.equal((await health()).ok, true);
});

test('one socket cannot create an unlimited number of orphaned rooms', async () => {
  const ws = await connect();
  const initial = (await health()).rooms;
  await command(ws, 'create_room', { username: 'One room only' }, 'room_created');
  for (let i = 0; i < 3; i += 1) {
    const result = await command(ws, 'create_room', { username: 'Another room' }, 'game_error');
    assert.match(result.message, /Leave your current table/);
  }
  assert.equal((await health()).rooms, initial + 1);
});

test('reconnecting replaces the old socket without marking the new session offline', { timeout: 5000 }, async () => {
  const old = await connect();
  const created = await command(old, 'create_room', { username: 'Reconnect QA' }, 'room_created');
  const moved = once(old, 'close');
  const replacement = await connect();
  await command(replacement, 'reconnect_room', { roomId: created.roomId, playerToken: created.playerToken }, 'room_reconnected');
  await moved;
  const state = await command(replacement, 'update_config', { roomId: created.roomId, config: { tableName: 'Reconnected' } }, 'room_state');
  assert.equal(state.players.find((player) => player.id === state.you.playerId).connected, true);
});

test('a guest cannot grant themselves host privileges with a player ID', async () => {
  const host = await connect();
  const created = await command(host, 'create_room', { username: 'Host auth QA' }, 'room_created');
  const guest = await connect();
  const state = await command(guest, 'join_room', { roomId: created.roomId, username: 'Guest auth QA' }, 'room_state');
  const denied = await command(guest, 'update_config', {
    roomId: created.roomId, playerToken: state.hostPlayerId, config: { startingChips: 2000 },
  }, 'game_error');
  assert.match(denied.message, /Only the host/);
});

test('a browser from another website cannot open the game WebSocket', async () => {
  const ws = new WebSocket(url.replace('http:', 'ws:') + '/ws', { origin: 'https://untrusted.example' });
  const error = await new Promise((resolve) => ws.once('error', resolve));
  assert.match(error.message, /403/);
  assert.equal((await health()).ok, true);
});

test('message flood closes only the abusive connection', async () => {
  const ws = await connect();
  const closed = once(ws, 'close');
  for (let i = 0; i < 45; i += 1) ws.send('{}');
  assert.equal((await closed)[0], 1008);
  assert.equal((await health()).ok, true);
});

test('schemas reject wrong types and the rate limiter bounds its key count', () => {
  for (const config of [{ jokerRanks: {} }, { jokerSuits: 1 }, { bootAmount: 'ten' }, { cardsDealt: 1.5 }, JSON.parse('{"__proto__":{}}')]) {
    assert.equal(validMessage({ kind: 'command', type: 'update_config', payload: { config } }), false);
  }
  assert.equal(validMessage(null), false);
  const limit = createRateLimiter(2, 100, 2);
  assert.equal(limit('a', 1), true);
  assert.equal(limit('a', 2), true);
  assert.equal(limit('a', 3), false);
  assert.equal(limit('b', 3), true);
  assert.equal(limit('c', 4), false);
  assert.equal(limit('c', 102), true);
});

test('macOS sandbox blocks private file reads, writes, shell execution and outbound networking', { skip: process.platform !== 'darwin' }, async () => {
  const root = process.cwd();
  const directory = path.join(root, '.pc-host.local');
  await mkdir(directory, { recursive: true });
  const profile = path.join(directory, 'security-test.sb');
  await writeFile(profile, sandboxProfile(root, process.execPath, port));
  const probe = `
    import fs from 'node:fs'; import cp from 'node:child_process'; import net from 'node:net';
    for (const [name, action] of [
      ['read', () => fs.readFileSync(${JSON.stringify(profile)})],
      ['write', () => fs.writeFileSync(${JSON.stringify(path.join(directory, 'blocked-test.txt'))}, 'test')],
      ['shell', () => cp.execFileSync('/bin/sh', ['-c', 'true'])],
    ]) { try { action(); throw new Error(name + ' was allowed'); } catch (error) {
      if (error.code !== 'EPERM') throw error; console.log(name + ':blocked');
    }}
    const socket = net.connect(${port}, '127.0.0.1');
    socket.on('connect', () => { socket.destroy(); process.exitCode = 1; });
    socket.on('error', error => { if (error.code !== 'EPERM') throw error; console.log('network:blocked'); });
  `;
  const result = spawnSync('/usr/bin/sandbox-exec', ['-f', profile, process.execPath, '--input-type=module', '-e', probe], {
    cwd: '/', env: gameEnvironment(port), encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  for (const name of ['read', 'write', 'shell', 'network']) assert.ok(result.stdout.includes(`${name}:blocked`), result.stdout);
});
