const SIGNALING_ERROR_MESSAGE = 'Could not connect to the game server. Check your connection and try again.';
const SERVER_LEFT_MESSAGE = 'The game server connection dropped. Reconnecting...';
const KNOWN_COMMANDS = new Set([
  'create_room',
  'join_room',
  'reconnect_room',
  'leave_room',
  'update_config',
  'set_player_chips',
  'kick_player',
  'start_round',
  'game_command',
]);

function getServerUrl() {
  const configuredUrl = String(import.meta.env.VITE_WS_URL || '').trim();
  if (configuredUrl) {
    return configuredUrl;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const isViteDevHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  const host = isViteDevHost ? `${window.location.hostname}:8787` : window.location.host;
  const basePath = String(import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${protocol}//${host}${basePath}/ws`;
}

export function getTransportErrorMessage(error) {
  if (!error) {
    return SIGNALING_ERROR_MESSAGE;
  }

  if (typeof error === 'string') {
    return error;
  }

  return error.message || SIGNALING_ERROR_MESSAGE;
}

class WebSocketTransport {
  constructor() {
    this.listeners = new Map();
    this.ws = null;
    this.connectPromise = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.pendingCommands = [];
    this.explicitlyLeaving = false;
    this.session = {
      roomId: '',
      playerToken: '',
    };
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
    if (!KNOWN_COMMANDS.has(event)) {
      this.dispatch(event, payload);
      return;
    }

    if (event === 'leave_room') {
      this.explicitlyLeaving = true;
    }

    this.sendCommand(event, payload);
  }

  sendCommand(type, payload = {}) {
    this.connect()
      .then(() => {
        this.sendRaw({ kind: 'command', type, payload });
      })
      .catch((error) => {
        this.dispatch('connect_error', { message: getTransportErrorMessage(error) });
      });
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(getServerUrl());
      this.ws = ws;

      const timeoutId = window.setTimeout(() => {
        reject(new Error(SIGNALING_ERROR_MESSAGE));
        ws.close();
      }, 8000);

      ws.addEventListener('open', () => {
        window.clearTimeout(timeoutId);
        this.connectPromise = null;
        this.reconnectAttempts = 0;
        this.explicitlyLeaving = false;
        resolve();
      });

      ws.addEventListener('message', (event) => {
        this.handleMessage(event.data);
      });

      ws.addEventListener('close', () => {
        window.clearTimeout(timeoutId);
        this.connectPromise = null;
        this.ws = null;

        if (!this.explicitlyLeaving) {
          this.dispatch('connect_error', { message: SERVER_LEFT_MESSAGE });
          this.scheduleReconnect();
        }
      });

      ws.addEventListener('error', () => {
        reject(new Error(SIGNALING_ERROR_MESSAGE));
      });
    });

    return this.connectPromise;
  }

  scheduleReconnect() {
    if (this.reconnectTimer || !this.session.roomId || !this.session.playerToken) {
      return;
    }

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 8000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect()
        .then(() => {
          this.sendRaw({
            kind: 'command',
            type: 'reconnect_room',
            payload: {
              roomId: this.session.roomId,
              playerToken: this.session.playerToken,
            },
          });
        })
        .catch(() => {
          this.scheduleReconnect();
        });
    }, delay);
  }

  handleMessage(rawMessage) {
    let message = null;
    try {
      message = JSON.parse(rawMessage);
    } catch {
      return;
    }

    if (message?.kind !== 'event') {
      return;
    }

    const payload = message.payload || {};
    if (message.event === 'room_created' || message.event === 'room_joined' || message.event === 'room_reconnected') {
      this.session = {
        roomId: payload.roomId || this.session.roomId,
        playerToken: payload.playerToken || this.session.playerToken,
      };
    }

    if (message.event === 'room_state') {
      this.session.roomId = payload.id || this.session.roomId;
      this.session.playerToken = payload.you?.playerToken || this.session.playerToken;
    }

    if (message.event === 'kicked') {
      this.session = { roomId: '', playerToken: '' };
      this.explicitlyLeaving = true;
      this.ws?.close();
    }

    this.dispatch(message.event, payload);
  }

  sendRaw(message) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.pendingCommands.push(message);
      return;
    }

    while (this.pendingCommands.length) {
      this.ws.send(JSON.stringify(this.pendingCommands.shift()));
    }
    this.ws.send(JSON.stringify(message));
  }
}

export const socket = new WebSocketTransport();

export function emitGameCommand(roomId, playerToken, type, payload = {}) {
  socket.emit('game_command', {
    roomId,
    playerToken,
    type,
    payload,
  });
}
