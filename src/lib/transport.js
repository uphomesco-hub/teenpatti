import Peer from 'peerjs';
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
} from '../game/engine';

const SIGNALING_ERROR_MESSAGE = 'Could not connect to the room host. Check the room code or host tab.';
const HOST_LEFT_MESSAGE = 'The host left the room. In peer-hosted mode the table closes with the host.';
const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

function randomRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildIceServers() {
  const turnUrls = parseList(import.meta.env.VITE_TURN_URLS || import.meta.env.VITE_TURN_URL);
  const turnUsername = String(import.meta.env.VITE_TURN_USERNAME || '').trim();
  const turnCredential = String(import.meta.env.VITE_TURN_CREDENTIAL || '').trim();

  if (!turnUrls.length) {
    return DEFAULT_ICE_SERVERS;
  }

  if (!turnUsername || !turnCredential) {
    console.warn('TURN server URL is configured, but username or credential is missing. Falling back to STUN only.');
    return DEFAULT_ICE_SERVERS;
  }

  return [
    ...DEFAULT_ICE_SERVERS,
    {
      urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls,
      username: turnUsername,
      credential: turnCredential,
    },
  ];
}

export function getTransportErrorMessage(error) {
  if (!error) {
    return SIGNALING_ERROR_MESSAGE;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error.message) {
    return error.message;
  }

  if (error.type === 'peer-unavailable') {
    return SIGNALING_ERROR_MESSAGE;
  }

  return SIGNALING_ERROR_MESSAGE;
}

class PeerSocket {
  constructor() {
    this.listeners = new Map();
    this.peer = null;
    this.hostConnection = null;
    this.connections = new Map();
    this.peerIndex = new Map();
    this.mode = 'idle';
    this.room = null;
    this.localPlayerId = '';
    this.localPlayerToken = '';
    this.joinTimeout = null;
    this.sideShowTimeout = null;
    this.turnTimeout = null;
    this.tearingDown = false;
    this.iceServers = buildIceServers();
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
  }

  off(event, handler) {
    this.listeners.get(event)?.delete(handler);
  }

  dispatch(event, payload = {}) {
    for (const handler of this.listeners.get(event) || []) {
      handler(payload);
    }
  }

  emit(event, payload = {}) {
    switch (event) {
      case 'create_room':
        this.createRoom(payload.username);
        return;
      case 'join_room':
        this.joinRoom(payload.roomId, payload.username);
        return;
      case 'reconnect_room':
        this.reconnectRoom(payload.roomId, payload.playerToken);
        return;
      case 'leave_room':
        this.leaveRoom(payload.roomId, payload.playerToken);
        return;
      case 'update_config':
        this.updateConfig(payload.roomId, payload.playerToken, payload.config);
        return;
      case 'set_player_chips':
        this.setPlayerChips(payload.roomId, payload.playerToken, payload.targetPlayerId, payload.chips);
        return;
      case 'kick_player':
        this.kickPlayer(payload.roomId, payload.playerToken, payload.targetPlayerId);
        return;
      case 'start_round':
        this.startRound(payload.roomId, payload.playerToken, payload.config);
        return;
      case 'game_command':
        this.gameCommand(payload);
        return;
      default:
        this.dispatch(event, payload);
    }
  }

  async createRoom(username) {
    try {
      await this.resetTransport();
      const roomId = randomRoomCode();
      const peer = await this.openPeer(roomId);

      this.mode = 'host';
      this.peer = peer;
      this.setupHostPeer();

      const { room, player } = createGameRoom(peer.id, username, roomId);
      this.room = room;
      this.localPlayerId = player.id;
      this.localPlayerToken = player.token;

      this.dispatch('room_created', {
        roomId: room.id,
        playerToken: player.token,
      });
      this.broadcastRoom();
    } catch (error) {
      this.dispatch('connect_error', { message: getTransportErrorMessage(error) });
    }
  }

  async joinRoom(roomId, username) {
    await this.connectToHost(roomId, {
      type: 'join_room',
      payload: { roomId, username },
    });
  }

  async reconnectRoom(roomId, playerToken) {
    if (this.mode === 'host' && this.room?.id === roomId) {
      const player = this.room.players.find((entry) => entry.token === playerToken);
      if (!player) {
        this.dispatch('game_error', { message: 'Reconnect token is invalid for this room.' });
        return;
      }

      player.connected = true;
      player.socketId = this.peer?.id || roomId;
      this.localPlayerId = player.id;
      this.localPlayerToken = player.token;
      this.dispatch('room_reconnected', {
        roomId,
        playerToken: player.token,
      });
      this.broadcastRoom();
      return;
    }

    await this.connectToHost(roomId, {
      type: 'reconnect_room',
      payload: { roomId, playerToken },
    });
  }

  updateConfig(roomId, playerToken, config) {
    if (this.mode === 'host' && this.room?.id === roomId) {
      const result = updateRoomConfig(this.room, this.localPlayerId, config);
      if (result.error) {
        this.dispatch('game_error', { message: result.error });
        return;
      }
      this.broadcastRoom();
      return;
    }

    this.sendToHost('update_config', { roomId, playerToken, config });
  }

  setPlayerChips(roomId, playerToken, targetPlayerId, chips) {
    if (this.mode === 'host' && this.room?.id === roomId) {
      const result = updatePlayerChips(this.room, this.localPlayerId, targetPlayerId, chips);
      if (result.error) {
        this.dispatch('game_error', { message: result.error });
        return;
      }
      this.broadcastRoom();
      return;
    }

    this.sendToHost('set_player_chips', { roomId, playerToken, targetPlayerId, chips });
  }

  kickPlayer(roomId, playerToken, targetPlayerId) {
    if (this.mode === 'host' && this.room?.id === roomId) {
      const target = this.room.players.find((player) => player.id === targetPlayerId);
      const targetSocketId = target?.socketId;
      const result = kickGamePlayer(this.room, this.localPlayerId, targetPlayerId);
      if (result.error) {
        this.dispatch('game_error', { message: result.error });
        return;
      }

      if (targetSocketId && targetSocketId !== this.peer?.id) {
        this.sendEventToPeer(targetSocketId, 'kicked', { message: 'You were removed by the host.' });
        this.connections.get(targetSocketId)?.close();
        this.connections.delete(targetSocketId);
        this.peerIndex.delete(targetSocketId);
      }

      if (!this.room.sideShowReveal) {
        this.clearSideShowTimeout();
      }
      this.broadcastRoom();
      return;
    }

    this.sendToHost('kick_player', { roomId, playerToken, targetPlayerId });
  }

  startRound(roomId, playerToken, config) {
    if (this.mode === 'host' && this.room?.id === roomId) {
      if (config) {
        const configResult = updateRoomConfig(this.room, this.localPlayerId, config);
        if (configResult.error) {
          this.dispatch('game_error', { message: configResult.error });
          return;
        }
      }
      this.clearSideShowTimeout();
      const result = startGameRound(this.room, this.localPlayerId);
      if (result.error) {
        this.dispatch('game_error', { message: result.error });
        return;
      }
      this.broadcastRoom();
      return;
    }

    this.sendToHost('start_round', { roomId, playerToken, config });
  }

  leaveRoom(roomId, playerToken) {
    if (this.mode === 'host' && this.room?.id === roomId) {
      this.closeHostedRoom();
      return;
    }

    if (this.mode === 'guest') {
      this.sendToHost('leave_room', { roomId, playerToken });
      window.setTimeout(() => {
        this.resetTransport();
      }, 100);
    }
  }

  gameCommand(payload) {
    if (this.mode === 'host' && this.room?.id === payload.roomId) {
      const result = handleCommand(this.room, this.localPlayerId, payload.type, payload.payload || {});
      if (result.error) {
        this.dispatch('game_error', { message: result.error });
        return;
      }
      this.handlePostCommandEffects(result);
      this.broadcastRoom();
      return;
    }

    this.sendToHost('game_command', payload);
  }

  async connectToHost(roomId, joinMessage) {
    try {
      await this.resetTransport();
      const peerId = `P-${Math.random().toString(36).slice(2, 10)}`;
      const peer = await this.openPeer(peerId);
      this.mode = 'guest';
      this.peer = peer;

      peer.on('error', (error) => {
        if (!this.tearingDown) {
          this.dispatch('connect_error', { message: getTransportErrorMessage(error) });
        }
      });

      const connection = peer.connect(roomId, {
        reliable: true,
        serialization: 'json',
      });
      this.hostConnection = connection;

      connection.on('open', () => {
        this.clearJoinTimeout();
        this.joinTimeout = window.setTimeout(() => {
          this.dispatch('connect_error', { message: SIGNALING_ERROR_MESSAGE });
        }, 8000);

        connection.send({
          kind: 'command',
          type: joinMessage.type,
          payload: joinMessage.payload,
        });
      });

      connection.on('data', (message) => {
        this.handleGuestMessage(message);
      });

      connection.on('close', () => {
        if (!this.tearingDown) {
          this.dispatch('connect_error', { message: HOST_LEFT_MESSAGE });
        }
      });

      connection.on('error', (error) => {
        this.dispatch('connect_error', { message: getTransportErrorMessage(error) });
      });
    } catch (error) {
      this.dispatch('connect_error', { message: getTransportErrorMessage(error) });
    }
  }

  setupHostPeer() {
    this.peer.on('connection', (connection) => {
      connection.on('open', () => {
        this.connections.set(connection.peer, connection);
      });

      connection.on('data', (message) => {
        this.handleHostMessage(connection.peer, message);
      });

      connection.on('close', () => {
        this.connections.delete(connection.peer);
        const playerId = this.peerIndex.get(connection.peer);
        if (!playerId || !this.room) {
          return;
        }
        this.peerIndex.delete(connection.peer);
        disconnectPlayer(this.room, playerId);
        this.broadcastRoom();
      });
    });

    this.peer.on('disconnected', () => {
      if (!this.tearingDown) {
        this.peer?.reconnect();
      }
    });

    this.peer.on('error', (error) => {
      if (!this.tearingDown) {
        this.dispatch('connect_error', { message: getTransportErrorMessage(error) });
      }
    });
  }

  handleHostMessage(peerId, message) {
    if (!this.room || message?.kind !== 'command') {
      return;
    }

    switch (message.type) {
      case 'join_room':
        this.handleHostJoin(peerId, message.payload);
        return;
      case 'reconnect_room':
        this.handleHostReconnect(peerId, message.payload);
        return;
      case 'leave_room':
        this.handleHostLeave(peerId, message.payload);
        return;
      case 'update_config':
        this.handleHostUpdateConfig(peerId, message.payload);
        return;
      case 'set_player_chips':
        this.handleHostSetPlayerChips(peerId, message.payload);
        return;
      case 'kick_player':
        this.handleHostKickPlayer(peerId, message.payload);
        return;
      case 'start_round':
        this.handleHostStartRound(peerId, message.payload);
        return;
      case 'game_command':
        this.handleHostGameCommand(peerId, message.payload);
        return;
      default:
        this.sendEventToPeer(peerId, 'game_error', { message: 'Unknown room command.' });
    }
  }

  handleHostJoin(peerId, payload) {
    const result = joinGameRoom(this.room, peerId, payload.username);
    if (result.error) {
      this.sendEventToPeer(peerId, 'game_error', { message: result.error });
      return;
    }

    this.peerIndex.set(peerId, result.player.id);
    this.sendEventToPeer(peerId, 'room_joined', {
      roomId: this.room.id,
      playerToken: result.player.token,
    });
    this.broadcastRoom();
  }

  handleHostReconnect(peerId, payload) {
    const result = reconnectGameRoom(this.room, peerId, payload.playerToken);
    if (result.error) {
      this.sendEventToPeer(peerId, 'game_error', { message: result.error });
      return;
    }

    this.peerIndex.set(peerId, result.player.id);
    this.sendEventToPeer(peerId, 'room_reconnected', {
      roomId: this.room.id,
      playerToken: result.player.token,
    });
    this.broadcastRoom();
  }

  handleHostLeave(peerId, payload) {
    const playerId = this.resolvePlayerId(peerId, payload.playerToken);
    if (!playerId) {
      this.sendEventToPeer(peerId, 'game_error', { message: 'Player session not found.' });
      return;
    }

    const result = leaveGameRoom(this.room, playerId);
    this.peerIndex.delete(peerId);
    this.connections.get(peerId)?.close();
    this.connections.delete(peerId);

    if (result.deleted) {
      this.closeHostedRoom();
      return;
    }

    if (!this.room.sideShowReveal) {
      this.clearSideShowTimeout();
    }
    this.broadcastRoom();
  }

  handleHostUpdateConfig(peerId, payload) {
    const playerId = this.resolvePlayerId(peerId, payload.playerToken);
    if (!playerId) {
      this.sendEventToPeer(peerId, 'game_error', { message: 'Player session not found.' });
      return;
    }

    const result = updateRoomConfig(this.room, playerId, payload.config);
    if (result.error) {
      this.sendEventToPeer(peerId, 'game_error', { message: result.error });
      return;
    }

    this.broadcastRoom();
  }

  handleHostSetPlayerChips(peerId, payload) {
    const playerId = this.resolvePlayerId(peerId, payload.playerToken);
    if (!playerId) {
      this.sendEventToPeer(peerId, 'game_error', { message: 'Player session not found.' });
      return;
    }

    const result = updatePlayerChips(this.room, playerId, payload.targetPlayerId, payload.chips);
    if (result.error) {
      this.sendEventToPeer(peerId, 'game_error', { message: result.error });
      return;
    }

    this.broadcastRoom();
  }

  handleHostKickPlayer(peerId, payload) {
    const playerId = this.resolvePlayerId(peerId, payload.playerToken);
    if (!playerId) {
      this.sendEventToPeer(peerId, 'game_error', { message: 'Player session not found.' });
      return;
    }

    const target = this.room.players.find((player) => player.id === payload.targetPlayerId);
    const targetSocketId = target?.socketId;
    const result = kickGamePlayer(this.room, playerId, payload.targetPlayerId);
    if (result.error) {
      this.sendEventToPeer(peerId, 'game_error', { message: result.error });
      return;
    }

    if (targetSocketId && targetSocketId !== this.peer?.id) {
      this.sendEventToPeer(targetSocketId, 'kicked', { message: 'You were removed by the host.' });
      this.connections.get(targetSocketId)?.close();
      this.connections.delete(targetSocketId);
      this.peerIndex.delete(targetSocketId);
    }

    if (!this.room.sideShowReveal) {
      this.clearSideShowTimeout();
    }
    this.broadcastRoom();
  }

  handleHostStartRound(peerId, payload) {
    const playerId = this.resolvePlayerId(peerId, payload.playerToken);
    if (!playerId) {
      this.sendEventToPeer(peerId, 'game_error', { message: 'Player session not found.' });
      return;
    }

    if (payload.config) {
      const configResult = updateRoomConfig(this.room, playerId, payload.config);
      if (configResult.error) {
        this.sendEventToPeer(peerId, 'game_error', { message: configResult.error });
        return;
      }
    }

    this.clearSideShowTimeout();
    const result = startGameRound(this.room, playerId);
    if (result.error) {
      this.sendEventToPeer(peerId, 'game_error', { message: result.error });
      return;
    }

    this.broadcastRoom();
  }

  handleHostGameCommand(peerId, payload) {
    const playerId = this.resolvePlayerId(peerId, payload.playerToken);
    if (!playerId) {
      this.sendEventToPeer(peerId, 'game_error', { message: 'Player session not found.' });
      return;
    }

    const result = handleCommand(this.room, playerId, payload.type, payload.payload || {});
    if (result.error) {
      this.sendEventToPeer(peerId, 'game_error', { message: result.error });
      return;
    }

    this.handlePostCommandEffects(result);
    this.broadcastRoom();
  }

  handlePostCommandEffects(result) {
    if (!result?.effect) {
      return;
    }

    if (result.effect.type === 'side_show_reveal_started') {
      this.clearSideShowTimeout();
      this.sideShowTimeout = window.setTimeout(() => {
        if (!this.room) {
          return;
        }
        finalizeSideShowReveal(this.room);
        this.broadcastRoom();
        this.sideShowTimeout = null;
      }, 10_000);
    }
  }

  handleGuestMessage(message) {
    if (message?.kind !== 'event') {
      return;
    }

    if (message.event === 'room_joined' || message.event === 'room_reconnected') {
      this.clearJoinTimeout();
      this.localPlayerToken = message.payload.playerToken;
      this.dispatch(message.event, message.payload);
      return;
    }

    if (message.event === 'kicked') {
      this.dispatch(message.event, message.payload);
      window.setTimeout(() => {
        this.resetTransport();
      }, 50);
      return;
    }

    this.dispatch(message.event, message.payload);
  }

  broadcastRoom() {
    if (!this.room) {
      return;
    }

    for (const player of this.room.players) {
      const roomState = serializeRoomForPlayer(this.room, player.id);

      if (player.id === this.localPlayerId) {
        this.dispatch('room_state', roomState);
        continue;
      }

      if (!player.connected || !player.socketId) {
        continue;
      }

      this.sendEventToPeer(player.socketId, 'room_state', roomState);
    }

    this.syncTurnTimeout();
  }

  syncTurnTimeout() {
    this.clearTurnTimeout();

    if (
      this.mode !== 'host' ||
      !this.room ||
      this.room.phase !== 'betting' ||
      this.room.prompt ||
      this.room.sideShowReveal ||
      !this.room.round?.actionPlayerId ||
      !this.room.round?.turnEndsAt
    ) {
      return;
    }

    const delay = Math.max(0, this.room.round.turnEndsAt - Date.now());
    this.turnTimeout = window.setTimeout(() => {
      if (!this.room) {
        return;
      }

      handleTurnTimeout(this.room);
      this.turnTimeout = null;
      this.broadcastRoom();
    }, delay + 20);
  }

  resolvePlayerId(peerId, playerToken) {
    if (peerId === this.peer?.id) {
      return this.localPlayerId;
    }

    const indexed = this.peerIndex.get(peerId);
    if (indexed) {
      return indexed;
    }

    const player = this.room?.players.find((entry) => entry.token === playerToken);
    if (!player) {
      return '';
    }

    this.peerIndex.set(peerId, player.id);
    player.socketId = peerId;
    player.connected = true;
    return player.id;
  }

  sendToHost(type, payload) {
    if (!this.hostConnection?.open) {
      this.dispatch('connect_error', { message: SIGNALING_ERROR_MESSAGE });
      return;
    }

    this.hostConnection.send({
      kind: 'command',
      type,
      payload,
    });
  }

  sendEventToPeer(peerId, event, payload) {
    const connection = this.connections.get(peerId);
    if (!connection?.open) {
      return;
    }

    connection.send({
      kind: 'event',
      event,
      payload,
    });
  }

  async openPeer(peerId) {
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerId, {
        debug: 1,
        config: {
          iceServers: this.iceServers,
        },
      });

      const timeoutId = window.setTimeout(() => {
        peer.destroy();
        reject(new Error(SIGNALING_ERROR_MESSAGE));
      }, 8000);

      peer.on('open', () => {
        window.clearTimeout(timeoutId);
        resolve(peer);
      });

      peer.on('error', (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  clearJoinTimeout() {
    if (this.joinTimeout) {
      window.clearTimeout(this.joinTimeout);
      this.joinTimeout = null;
    }
  }

  clearSideShowTimeout() {
    if (this.sideShowTimeout) {
      window.clearTimeout(this.sideShowTimeout);
      this.sideShowTimeout = null;
    }
  }

  clearTurnTimeout() {
    if (this.turnTimeout) {
      window.clearTimeout(this.turnTimeout);
      this.turnTimeout = null;
    }
  }

  closeHostedRoom() {
    for (const connection of this.connections.values()) {
      connection.close();
    }
    this.resetTransport();
  }

  async resetTransport() {
    this.tearingDown = true;
    this.clearJoinTimeout();
    this.clearSideShowTimeout();
    this.clearTurnTimeout();

    for (const connection of this.connections.values()) {
      connection.close();
    }
    this.connections.clear();
    this.peerIndex.clear();

    if (this.hostConnection) {
      this.hostConnection.close();
    }

    if (this.peer) {
      this.peer.destroy();
    }

    this.peer = null;
    this.hostConnection = null;
    this.mode = 'idle';
    this.room = null;
    this.localPlayerId = '';
    this.localPlayerToken = '';
    this.tearingDown = false;
  }
}

export const socket = new PeerSocket();

export function emitGameCommand(roomId, playerToken, type, payload = {}) {
  socket.emit('game_command', {
    roomId,
    playerToken,
    type,
    payload,
  });
}
