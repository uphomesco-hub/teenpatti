import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';

test('ten real WebSocket players complete a hand on credit and rejoin the next hand', { timeout: 20000 }, async (t) => {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) }, stdio: 'pipe',
  });
  const clients = [];
  t.after(async () => {
    for (const client of clients) client.ws.terminate();
    server.kill('SIGTERM');
    await once(server, 'exit');
  });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (data) => { if (String(data).includes('listening')) resolve(); });
    server.once('error', reject);
    server.once('exit', (code) => reject(new Error(`Server exited: ${code}`)));
  });

  async function connect() {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const client = { ws, state: null, token: '' };
    clients.push(client);
    ws.on('message', (raw) => {
      const message = JSON.parse(raw);
      if (message.event === 'room_state') client.state = message.payload;
      if (message.payload.playerToken) client.token = message.payload.playerToken;
    });
    await once(ws, 'open');
    return client;
  }

  function request(client, type, payload, event = 'room_state', predicate = () => true) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => done(new Error(`Timed out: ${type}`)), 4000);
      const receive = (raw) => {
        const message = JSON.parse(raw);
        if (message.event === 'game_error') done(new Error(message.payload.message));
        if (message.event === event && predicate(message.payload)) done(null, message.payload);
      };
      function done(error, result) {
        clearTimeout(timeout);
        client.ws.off('message', receive);
        if (error) reject(error); else resolve(result);
      }
      client.ws.on('message', receive);
      client.ws.send(JSON.stringify({ kind: 'command', type, payload }));
    });
  }

  const host = await connect();
  const created = await request(host, 'create_room', { username: 'Host' }, 'room_created');
  const roomId = created.roomId;
  for (let i = 1; i < 10; i += 1) {
    await request(await connect(), 'join_room', { roomId, username: `Player ${i}` });
  }
  await request(host, 'update_config', { roomId, playerToken: host.token, config: { startingChips: 10 } }, 'room_state', (next) => next.config.startingChips === 10);
  let state = await request(host, 'start_round', { roomId, playerToken: host.token }, 'room_state', (next) => next.round?.number === 1);
  assert.equal(state.players.length, 10);
  assert.equal(state.round.pot, 100);
  const playersById = new Map(clients.map((client) => [client.state.you.playerId, client]));
  const play = async (client, type) => {
    const previousPot = state.round.pot;
    const playerId = client.state.you.playerId;
    return request(client, 'game_command', { roomId, playerToken: client.token, type }, 'room_state', (next) => {
      if (type === 'call') return next.round.pot === previousPot + 10;
      return next.players.find((player) => player.id === playerId).status === (type === 'pack' ? 'busted' : 'waiting');
    });
  };
  for (let i = 0; i < 10; i += 1) state = await play(playersById.get(state.round.actionPlayerId), 'call');
  assert.equal(state.round.pot, 200);
  assert.ok(state.players.every((player) => player.chips === -10));
  for (let i = 0; i < 9; i += 1) state = await play(playersById.get(state.round.actionPlayerId), 'pack');
  assert.equal(state.phase, 'finished');
  assert.equal(state.players.filter((player) => player.status === 'busted').length, 9);
  assert.equal(state.players.find((player) => player.id === state.winnerId).chips, 190);
  for (const client of clients.slice(1)) state = await play(client, 'rejoin');
  state = await request(host, 'start_round', { roomId, playerToken: host.token }, 'room_state', (next) => next.round?.number === 2);
  assert.equal(state.round.number, 2);
  assert.equal(state.players.filter((player) => player.status === 'active').length, 10);
});
