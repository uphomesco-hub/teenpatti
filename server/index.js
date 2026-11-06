import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { randomInt, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { LIMITS, validMessage, createRateLimiter, allowedOrigin } from './security.js';
import {
  createRoom as createGameRoom,
  joinRoom as joinGameRoom,
  reconnectRoom as reconnectGameRoom,
  disconnectPlayer,
  leaveRoom as leaveGameRoom,
  kickPlayer as kickGamePlayer,
  updateConfig as updateRoomConfig,
  setPlayerChips as updatePlayerChips,
  startRound as startGameRound,
  handleCommand,
  handleTurnTimeout,
  finalizeSideShowReveal,
  serializeRoomForPlayer,
} from '../src/game/engine.js';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const ROOM_TTL_MS = Number(process.env.ROOM_TTL_MS || 6 * 60 * 60 * 1000);
const SIDE_SHOW_REVEAL_MS = 10_000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');

const rooms = new Map();
const clients = new Map();
const sideShowTimers = new Map();
const turnTimers = new Map();
const allowHttp = createRateLimiter(240, 60_000);
const allowConnection = createRateLimiter(60, 60_000);
const allowCommand = createRateLimiter(120, 10_000);

function clientIp(request) {
  // Forwarded addresses are trusted only from the local Cloudflare connector.
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress);
  const forwarded = local && request.headers['cf-connecting-ip'];
  return typeof forwarded === 'string' && forwarded.length <= 64 ? forwarded : request.socket.remoteAddress;
}

function createSocketId() {
  return `S-${randomUUID()}`;
}

function createRoomCode() {
  let roomId = '';
  do {
    roomId = Array.from({ length: 6 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[randomInt(36)]).join('');
  } while (rooms.has(roomId));
  return roomId;
}

function normalizeRoomId(roomId) {
  return String(roomId || '').trim().toUpperCase();
}

function sendEvent(ws, event, payload = {}) {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }
  if (ws.bufferedAmount > 64 * 1024) {
    ws.terminate();
    return;
  }

  ws.send(JSON.stringify({ kind: 'event', event, payload }));
}

function sendGameError(ws, message) {
  sendEvent(ws, 'game_error', { message });
}

function getRoom(ws, roomId) {
  const normalizedRoomId = normalizeRoomId(roomId || ws.roomId);
  if (!normalizedRoomId || !rooms.has(normalizedRoomId)) {
    sendGameError(ws, 'Table not found. Ask the host for a fresh invite code.');
    return null;
  }

  return rooms.get(normalizedRoomId);
}

function resolvePlayerId(room, ws, playerToken) {
  if (ws.playerId && room.players.some((player) => player.id === ws.playerId)) {
    const player = room.players.find((entry) => entry.id === ws.playerId);
    return player.socketId === ws.id && ws.roomId === room.id ? ws.playerId : '';
  }

  const player = room.players.find((entry) => entry.token === playerToken);
  if (!player) {
    return '';
  }

  attachPlayer(ws, room, player);
  return player.id;
}

function markRoomTouched(room) {
  room.lastTouchedAt = Date.now();
}

function broadcastRoom(room) {
  markRoomTouched(room);

  for (const player of room.players) {
    if (!player.connected || !player.socketId) {
      continue;
    }

    const ws = clients.get(player.socketId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      continue;
    }

    sendEvent(ws, 'room_state', serializeRoomForPlayer(room, player.id));
  }

  syncTurnTimeout(room);
}

function clearSideShowTimer(roomId) {
  const timer = sideShowTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    sideShowTimers.delete(roomId);
  }
}

function clearTurnTimer(roomId) {
  const timer = turnTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    turnTimers.delete(roomId);
  }
}

function deleteRoom(roomId) {
  clearSideShowTimer(roomId);
  clearTurnTimer(roomId);
  rooms.delete(roomId);
}

function syncTurnTimeout(room) {
  clearTurnTimer(room.id);

  if (
    room.phase !== 'betting' ||
    room.prompt ||
    room.sideShowReveal ||
    !room.round?.actionPlayerId ||
    !room.round?.turnEndsAt
  ) {
    return;
  }

  const delay = Math.max(0, room.round.turnEndsAt - Date.now());
  const timer = setTimeout(() => {
    const liveRoom = rooms.get(room.id);
    if (!liveRoom) {
      return;
    }

    handleTurnTimeout(liveRoom);
    turnTimers.delete(room.id);
    broadcastRoom(liveRoom);
  }, delay + 20);

  turnTimers.set(room.id, timer);
}

function handlePostCommandEffects(room, result) {
  if (!result?.effect) {
    return;
  }

  if (result.effect.type === 'side_show_reveal_started') {
    clearSideShowTimer(room.id);
    const timer = setTimeout(() => {
      const liveRoom = rooms.get(room.id);
      if (!liveRoom) {
        return;
      }

      finalizeSideShowReveal(liveRoom);
      sideShowTimers.delete(room.id);
      broadcastRoom(liveRoom);
    }, SIDE_SHOW_REVEAL_MS);
    sideShowTimers.set(room.id, timer);
  }
}

function attachPlayer(ws, room, player, previousSocketId = player.socketId) {
  const previous = clients.get(previousSocketId);
  if (previous && previous !== ws) {
    previous.roomId = '';
    previous.playerId = '';
    previous.playerToken = '';
    previous.close(1000, 'Session moved to a new connection');
  }
  ws.roomId = room.id;
  ws.playerId = player.id;
  ws.playerToken = player.token;
  player.socketId = ws.id;
  player.connected = true;
}

function handleCreateRoom(ws, payload) {
  if (ws.roomId || rooms.size >= LIMITS.maxRooms) {
    sendGameError(ws, ws.roomId ? 'Leave your current table before creating another.' : 'Server is full. Try again later.');
    return;
  }
  const roomId = createRoomCode();
  const { room, player } = createGameRoom(ws.id, payload.username, roomId);
  room.lastTouchedAt = Date.now();
  rooms.set(room.id, room);
  attachPlayer(ws, room, player);
  sendEvent(ws, 'room_created', {
    roomId: room.id,
    playerToken: player.token,
  });
  broadcastRoom(room);
}

function handleJoinRoom(ws, payload) {
  if (ws.roomId) {
    sendGameError(ws, 'Leave your current table before joining another.');
    return;
  }
  const room = getRoom(ws, payload.roomId);
  if (!room) {
    return;
  }

  const result = joinGameRoom(room, ws.id, payload.username);
  if (result.error) {
    sendGameError(ws, result.error);
    return;
  }

  attachPlayer(ws, room, result.player);
  sendEvent(ws, 'room_joined', {
    roomId: room.id,
    playerToken: result.player.token,
  });
  broadcastRoom(room);
}

function handleReconnectRoom(ws, payload) {
  if (ws.roomId && ws.roomId !== normalizeRoomId(payload.roomId)) {
    sendGameError(ws, 'Leave your current table before reconnecting elsewhere.');
    return;
  }
  const room = getRoom(ws, payload.roomId);
  if (!room) {
    return;
  }

  const previousSocketId = room.players.find((player) => player.token === payload.playerToken)?.socketId;
  const result = reconnectGameRoom(room, ws.id, payload.playerToken);
  if (result.error) {
    sendGameError(ws, result.error);
    return;
  }

  attachPlayer(ws, room, result.player, previousSocketId);
  sendEvent(ws, 'room_reconnected', {
    roomId: room.id,
    playerToken: result.player.token,
  });
  broadcastRoom(room);
}

function handleLeaveRoom(ws, payload) {
  const room = getRoom(ws, payload.roomId);
  if (!room) {
    return;
  }

  const playerId = resolvePlayerId(room, ws, payload.playerToken);
  if (!playerId) {
    sendGameError(ws, 'Player session not found.');
    return;
  }

  const result = leaveGameRoom(room, playerId);
  ws.roomId = '';
  ws.playerId = '';
  ws.playerToken = '';

  if (result.deleted) {
    deleteRoom(room.id);
    return;
  }

  if (!room.sideShowReveal) {
    clearSideShowTimer(room.id);
  }
  broadcastRoom(room);
}

function handleUpdateConfig(ws, payload) {
  const room = getRoom(ws, payload.roomId);
  if (!room) {
    return;
  }

  const playerId = resolvePlayerId(room, ws, payload.playerToken);
  if (!playerId) {
    sendGameError(ws, 'Player session not found.');
    return;
  }

  const result = updateRoomConfig(room, playerId, payload.config);
  if (result.error) {
    sendGameError(ws, result.error);
    return;
  }

  broadcastRoom(room);
}

function handleSetPlayerChips(ws, payload) {
  const room = getRoom(ws, payload.roomId);
  if (!room) {
    return;
  }

  const playerId = resolvePlayerId(room, ws, payload.playerToken);
  if (!playerId) {
    sendGameError(ws, 'Player session not found.');
    return;
  }

  const result = updatePlayerChips(room, playerId, payload.targetPlayerId, payload.chips);
  if (result.error) {
    sendGameError(ws, result.error);
    return;
  }

  broadcastRoom(room);
}

function handleKickPlayer(ws, payload) {
  const room = getRoom(ws, payload.roomId);
  if (!room) {
    return;
  }

  const playerId = resolvePlayerId(room, ws, payload.playerToken);
  if (!playerId) {
    sendGameError(ws, 'Player session not found.');
    return;
  }

  const target = room.players.find((player) => player.id === payload.targetPlayerId);
  const targetSocketId = target?.socketId;
  const result = kickGamePlayer(room, playerId, payload.targetPlayerId);
  if (result.error) {
    sendGameError(ws, result.error);
    return;
  }

  const targetSocket = clients.get(targetSocketId);
  if (targetSocket) {
    targetSocket.roomId = '';
    targetSocket.playerId = '';
    targetSocket.playerToken = '';
    sendEvent(targetSocket, 'kicked', { message: 'You were removed by the host.' });
    targetSocket.close(1000, 'kicked');
  }

  if (!room.sideShowReveal) {
    clearSideShowTimer(room.id);
  }
  broadcastRoom(room);
}

function handleStartRound(ws, payload) {
  const room = getRoom(ws, payload.roomId);
  if (!room) {
    return;
  }

  const playerId = resolvePlayerId(room, ws, payload.playerToken);
  if (!playerId) {
    sendGameError(ws, 'Player session not found.');
    return;
  }

  if (payload.config) {
    const configResult = updateRoomConfig(room, playerId, payload.config);
    if (configResult.error) {
      sendGameError(ws, configResult.error);
      return;
    }
  }

  clearSideShowTimer(room.id);
  const result = startGameRound(room, playerId);
  if (result.error) {
    sendGameError(ws, result.error);
    return;
  }

  broadcastRoom(room);
}

function handleGameCommand(ws, payload) {
  const room = getRoom(ws, payload.roomId);
  if (!room) {
    return;
  }

  const playerId = resolvePlayerId(room, ws, payload.playerToken);
  if (!playerId) {
    sendGameError(ws, 'Player session not found.');
    return;
  }

  const result = handleCommand(room, playerId, payload.type, payload.payload || {});
  if (result.error) {
    sendGameError(ws, result.error);
    return;
  }

  handlePostCommandEffects(room, result);
  broadcastRoom(room);
}

function handleCommandMessage(ws, message) {
  if (message?.kind !== 'command') {
    return;
  }

  switch (message.type) {
    case 'create_room':
      handleCreateRoom(ws, message.payload || {});
      return;
    case 'join_room':
      handleJoinRoom(ws, message.payload || {});
      return;
    case 'reconnect_room':
      handleReconnectRoom(ws, message.payload || {});
      return;
    case 'leave_room':
      handleLeaveRoom(ws, message.payload || {});
      return;
    case 'update_config':
      handleUpdateConfig(ws, message.payload || {});
      return;
    case 'set_player_chips':
      handleSetPlayerChips(ws, message.payload || {});
      return;
    case 'kick_player':
      handleKickPlayer(ws, message.payload || {});
      return;
    case 'start_round':
      handleStartRound(ws, message.payload || {});
      return;
    case 'game_command':
      handleGameCommand(ws, message.payload || {});
      return;
    default:
      sendGameError(ws, 'Unknown room command.');
  }
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

async function serveStatic(request, response) {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    if (!allowHttp(clientIp(request))) {
      response.writeHead(429, { 'retry-after': '60' });
      response.end('Too many requests.');
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { allow: 'GET, HEAD', connection: 'close' });
      response.end('Method not allowed.');
      return;
    }
    let requestedPath;
    try {
      requestedPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      response.writeHead(400);
      response.end('Invalid request path.');
      return;
    }
    if (requestedPath === '/health') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ ok: true, rooms: rooms.size }));
      return;
    }
    const publicFile = requestedPath === '/' || ['/index.html', '/favicon.svg', '/icons.svg'].includes(requestedPath) ||
      /^\/assets\/[a-z0-9_-]+\.(js|css|png|svg|webp|woff2?)$/i.test(requestedPath);
    if (!publicFile) {
      response.writeHead(404);
      response.end('Not found.');
      return;
    }
    const canonicalDist = await realpath(distDir);
    const targetPath = await realpath(path.join(distDir, requestedPath === '/' ? 'index.html' : requestedPath));
    if (!targetPath.startsWith(`${canonicalDist}${path.sep}`)) throw new Error('Outside public directory');
    const body = await readFile(targetPath);
    response.writeHead(200, {
      'content-type': mimeTypes[path.extname(targetPath)] || 'application/octet-stream',
      'cache-control': targetPath.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found.');
  }
}

const server = createServer(serveStatic);
server.maxConnections = 128;
server.headersTimeout = 10_000;
server.requestTimeout = 10_000;
server.keepAliveTimeout = 5000;
server.maxRequestsPerSocket = 100;
const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.maxPayload, perMessageDeflate: false });

server.on('upgrade', (request, socket, head) => {
  socket.on('error', () => {});
  let validPath = false;
  try { validPath = new URL(request.url, 'http://localhost').pathname === '/ws'; } catch { /* Reject malformed upgrades. */ }
  const ip = clientIp(request);
  const fromIp = [...clients.values()].filter((client) => client.ip === ip).length;
  if (!validPath || !allowedOrigin(request) || clients.size >= LIMITS.maxClients || fromIp >= LIMITS.maxClientsPerIp || !allowConnection(ip)) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    ws.ip = ip;
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  ws.id = createSocketId();
  ws.isAlive = true;
  clients.set(ws.id, ws);
  ws.on('error', () => ws.terminate());

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (rawMessage, isBinary) => {
    ws.commandCount = (ws.commandCount || 0) + 1;
    const now = Date.now();
    if (!ws.commandWindow || now - ws.commandWindow >= 10_000) {
      ws.commandWindow = now;
      ws.commandCount = 1;
    }
    if (ws.commandCount > 40 || !allowCommand(ws.ip)) {
      ws.close(1008, 'Too many commands');
      return;
    }
    let message = null;
    try {
      if (isBinary) throw new Error('Binary messages are not supported');
      message = JSON.parse(rawMessage);
      if (!validMessage(message)) throw new Error('Invalid command');
    } catch {
      sendGameError(ws, 'Malformed message.');
      return;
    }

    try {
      handleCommandMessage(ws, message);
    } catch {
      sendGameError(ws, 'That command could not be processed.');
    }
  });

  ws.on('close', () => {
    clients.delete(ws.id);
    const room = rooms.get(ws.roomId);
    if (!room || !ws.playerId) {
      return;
    }

    const player = room.players.find((entry) => entry.id === ws.playerId);
    if (player?.socketId !== ws.id) return;
    disconnectPlayer(room, ws.playerId);
    broadcastRoom(room);
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);

setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    const hasConnectedPlayers = room.players.some((player) => player.connected);
    if (!hasConnectedPlayers && now - (room.lastTouchedAt || now) > ROOM_TTL_MS) {
      deleteRoom(roomId);
    }
  }
}, 60_000);

server.listen(PORT, HOST, () => {
  console.log(`Teen Patti server listening on ${HOST}:${PORT}`);
});

function shutdown() {
  for (const roomId of rooms.keys()) {
    deleteRoom(roomId);
  }
  for (const client of wss.clients) {
    client.terminate();
  }
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
