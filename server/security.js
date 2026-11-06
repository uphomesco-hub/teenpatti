const COMMANDS = new Set([
  'create_room', 'join_room', 'reconnect_room', 'leave_room', 'update_config',
  'set_player_chips', 'kick_player', 'start_round', 'game_command',
]);
const ACTIONS = new Set([
  'rejoin', 'discard_cards', 'look_cards', 'call', 'raise', 'pack',
  'request_side_show', 'answer_prompt', 'show', 'set_card_reveal',
]);
const SUITS = new Set(['spades', 'hearts', 'diamonds', 'clubs']);
const NUMBERS = {
  bootAmount: [1, 100000], startingChips: [10, 1000000], cardsDealt: [1, 10],
  cardsToKeep: [1, 5], assumedWildCards: [0, 2], randomJokerRankCount: [1, 13],
  randomJokerSuitCount: [1, 4], minPlayers: [2, 2], maxPlayers: [10, 10],
};
const BOOLEANS = new Set(['randomJokerRank', 'randomJokerSuit', 'sideShowEnabled', 'showEnabled']);
export const LIMITS = Object.freeze({ maxPayload: 16 * 1024, maxRooms: 16, maxClients: 64, maxClientsPerIp: 32 });
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

function validConfig(config) {
  if (!object(config)) return false;
  return Object.entries(config).every(([key, value]) => {
    if (Object.hasOwn(NUMBERS, key)) return integer(value, ...NUMBERS[key]);
    if (BOOLEANS.has(key)) return typeof value === 'boolean';
    if (key === 'tableName') return string(value, 48);
    if (key === 'jokerRanks') return Array.isArray(value) && value.length <= 13 && value.every((rank) => integer(rank, 2, 14));
    if (key === 'jokerSuits') return Array.isArray(value) && value.length <= 4 && value.every((suit) => SUITS.has(suit));
    if (key === 'handRankingMode') return ['classic', 'muflis'].includes(value);
    if (key === 'specialHandMode') return ['standard', 'kiss_miss'].includes(value);
    return false;
  });
}

export function validMessage(message) {
  if (!object(message) || message.kind !== 'command' || !COMMANDS.has(message.type) || !object(message.payload)) return false;
  const payload = message.payload;
  if (payload.roomId !== undefined && (!string(payload.roomId, 6) || !/^[a-z0-9]{6}$/i.test(payload.roomId))) return false;
  if (payload.playerToken !== undefined && !string(payload.playerToken, 128)) return false;
  if (['create_room', 'join_room'].includes(message.type) && (!string(payload.username, 20) || !payload.username.trim())) return false;
  if (['join_room', 'reconnect_room'].includes(message.type) && !payload.roomId) return false;
  if (message.type === 'reconnect_room' && !string(payload.playerToken, 128)) return false;
  if (payload.config !== undefined && !validConfig(payload.config)) return false;
  if (message.type === 'update_config' && !validConfig(payload.config)) return false;
  if (['set_player_chips', 'kick_player'].includes(message.type) && !string(payload.targetPlayerId, 128)) return false;
  if (message.type === 'set_player_chips' && !integer(payload.chips, 0, 1000000000)) return false;
  if (message.type === 'game_command') {
    if (!ACTIONS.has(payload.type) || (payload.payload !== undefined && !object(payload.payload))) return false;
    const action = payload.payload || {};
    if (payload.type === 'raise' && action.amount !== undefined && !integer(action.amount, 1, 1000000000)) return false;
    if (payload.type === 'discard_cards' && (!Array.isArray(action.discardIds) || action.discardIds.length > 10 || !action.discardIds.every((id) => string(id, 128)))) return false;
    if (payload.type === 'answer_prompt' && typeof action.accept !== 'boolean') return false;
    if (payload.type === 'set_card_reveal' && typeof action.reveal !== 'boolean') return false;
  }
  return true;
}

export function createRateLimiter(maximum, windowMs, maxKeys = 2048) {
  const buckets = new Map();
  return (key, now = Date.now()) => {
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.since >= windowMs) {
      if (buckets.size >= maxKeys) {
        for (const [entry, value] of buckets) if (now - value.since >= windowMs) buckets.delete(entry);
        if (buckets.size >= maxKeys && !buckets.has(key)) return false;
      }
      bucket = { since: now, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    return bucket.count <= maximum;
  };
}

export function allowedOrigin(request) {
  if (!request.headers.origin) return true; // Non-browser clients still require player tokens.
  try {
    const origin = new URL(request.headers.origin);
    return origin.origin === 'https://uphomesco-hub.github.io' ||
      (['http:', 'https:'].includes(origin.protocol) && origin.host === request.headers.host);
  } catch { return false; }
}
