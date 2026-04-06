import { createDeck, RANKS, SUITS } from './cards';
import { compareTeenPattiHands, evaluateBestTeenPattiHand } from './evaluator';
import { buildConfigFromPreset, normalizeConfig } from './variants';

function randomId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function generateRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function sanitizeUsername(value) {
  return String(value || 'Player').trim().slice(0, 20) || 'Player';
}

function pushHistory(room, message) {
  room.history.push({
    id: randomId(),
    message,
    createdAt: Date.now(),
  });
  room.history = room.history.slice(-24);
}

function createPlayer(socketId, username) {
  return {
    id: randomId(),
    token: randomId(),
    socketId,
    connected: true,
    name: sanitizeUsername(username),
    seat: null,
    chips: 0,
    status: 'waiting',
    hasSeenCards: false,
    hand: [],
    discarded: [],
    pendingDiscardCount: 0,
  };
}

function getPlayer(room, playerId) {
  return room.players.find((player) => player.id === playerId) || null;
}

function getPlayerByToken(room, playerToken) {
  return room.players.find((player) => player.token === playerToken) || null;
}

function getPlayerCards(room, player) {
  return player.hand.map((cardId) => room.cardsById[cardId]).filter(Boolean);
}

function sampleOne(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function sampleMany(items, count) {
  const pool = [...items];
  const picked = [];
  const safeCount = Math.max(0, Math.min(Number(count || 0), pool.length));

  for (let index = 0; index < safeCount; index += 1) {
    const choice = sampleOne(pool);
    picked.push(choice);
    pool.splice(pool.indexOf(choice), 1);
  }

  return picked;
}

function resolveRoundJokers(config) {
  const availableRanks = RANKS.filter((rank) => !(config.jokerRanks || []).includes(rank));
  const availableSuits = SUITS.filter((suit) => !(config.jokerSuits || []).includes(suit.value));
  const activeJokerRanks = Array.from(
    new Set([
      ...(config.jokerRanks || []),
      ...(config.randomJokerRank ? sampleMany(availableRanks, config.randomJokerRankCount) : []),
    ]),
  ).sort((left, right) => right - left);
  const activeJokerSuits = Array.from(
    new Set([
      ...(config.jokerSuits || []),
      ...(config.randomJokerSuit ? sampleMany(availableSuits, config.randomJokerSuitCount).map((suit) => suit.value) : []),
    ]),
  );

  return {
    activeJokerRanks,
    activeJokerSuits,
  };
}

function getRoundJokerSettings(room) {
  return {
    jokerRanks: room.round?.activeJokerRanks || room.config.jokerRanks || [],
    jokerSuits: room.round?.activeJokerSuits || room.config.jokerSuits || [],
    specialHandMode: room.config.specialHandMode || 'standard',
  };
}

function isJokerCard(room, card) {
  const jokerSettings = getRoundJokerSettings(room);
  return (
    jokerSettings.jokerRanks.includes(card.rank) ||
    jokerSettings.jokerSuits.includes(card.suit)
  );
}

function serializeCard(room, cardId) {
  const card = room.cardsById[cardId];
  if (!card) {
    return null;
  }

  return {
    id: card.id,
    rank: card.rank,
    suit: card.suit,
    suitSymbol: card.suitSymbol,
    label: card.label,
    isJoker: isJokerCard(room, card),
  };
}

function serializeBestHand(room, cards) {
  if (!cards?.length) {
    return [];
  }

  return cards.map((card) => ({
    id: card.id || `${card.rank}-${card.suit}`,
    rank: card.rank,
    suit: card.suit,
    suitSymbol: card.suitSymbol || '',
    label: card.label || `${card.rank}`,
    isJoker: isJokerCard(room, card),
  }));
}

function serializeAssumedWildCards(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `assumed-${index}`,
    label: 'Assumed',
    isAssumed: true,
  }));
}

function serializeDiscardCards(room, cards) {
  if (!cards?.length) {
    return [];
  }

  return cards.map((card) => ({
    id: card.id,
    rank: card.rank,
    suit: card.suit,
    suitSymbol: card.suitSymbol || '',
    label: card.label || `${card.rank}`,
    isJoker: isJokerCard(room, card),
  }));
}

function serializeResolvedAssumedCards(room, cards) {
  if (!cards?.length) {
    return [];
  }

  return cards.map((card, index) => ({
    id: card.id || `resolved-assumed-${index}`,
    rank: card.rank,
    suit: card.suit,
    suitSymbol: card.suitSymbol || '',
    label: card.label || `${card.rank}${card.suit ? ` ${card.suit}` : ''}`,
    isAssumed: true,
    isJoker: false,
  }));
}

function formatKissMissDetail(score) {
  if (!score?.pairs?.length || !score?.leftoverCard) {
    return '';
  }

  const pairText = score.pairs
    .map((pair) => `${pair.kind === 'kiss' ? 'Kiss' : 'Miss'} ${pair.cards.map((card) => card.label).join('-')}`)
    .join(' • ');

  return `${pairText} • Leftover ${score.leftoverCard.label} makes the trail`;
}

function getActivePlayers(room) {
  return room.players.filter((player) => player.status === 'active' || player.status === 'seen');
}

function getActiveSeatPlayers(room) {
  return getActivePlayers(room).sort((left, right) => left.seat - right.seat);
}

function getNextActivePlayer(room, currentPlayerId) {
  const ordered = getActiveSeatPlayers(room);
  if (!ordered.length) {
    return null;
  }

  const currentIndex = ordered.findIndex((player) => player.id === currentPlayerId);
  if (currentIndex === -1) {
    return ordered[0];
  }

  return ordered[(currentIndex + 1) % ordered.length];
}

function getPreviousSeenPlayer(room, currentPlayerId) {
  const ordered = getActiveSeatPlayers(room);
  const startIndex = ordered.findIndex((player) => player.id === currentPlayerId);
  if (startIndex === -1) {
    return null;
  }

  for (let offset = 1; offset < ordered.length; offset += 1) {
    const candidate = ordered[(startIndex - offset + ordered.length) % ordered.length];
    if (candidate.id !== currentPlayerId && candidate.hasSeenCards) {
      return candidate;
    }
  }

  return null;
}

function assignSeats(room) {
  room.players.forEach((player, index) => {
    player.seat = index;
  });
}

function beginBetting(room) {
  room.phase = 'betting';
  pushHistory(
    room,
    `All players locked in their final hand: ${room.config.cardsToKeep} kept card(s) + ${room.config.assumedWildCards} assumed card(s).`,
  );
}

function evaluateWinner(room, leftPlayer, rightPlayer) {
  const comparison = compareTeenPattiHands(
    getPlayerCards(room, leftPlayer),
    getPlayerCards(room, rightPlayer),
    getRoundJokerSettings(room),
    room.config.assumedWildCards,
    room.config.handRankingMode,
  );

  if (comparison.winner >= 0) {
    return {
      winnerPlayer: leftPlayer,
      loserPlayer: rightPlayer,
      comparison,
    };
  }

  return {
    winnerPlayer: rightPlayer,
    loserPlayer: leftPlayer,
    comparison,
  };
}

function finishRound(room, winnerPlayer, reason) {
  room.phase = 'finished';
  room.winnerId = winnerPlayer.id;
  room.round.winnerId = winnerPlayer.id;
  winnerPlayer.chips += room.round.pot;
  winnerPlayer.status = 'winner';

  pushHistory(room, `${winnerPlayer.name} won ${room.round.pot} chips. ${reason}`);
}

function maybeFinishRound(room) {
  const activePlayers = getActivePlayers(room);
  if (activePlayers.length !== 1) {
    return false;
  }

  finishRound(room, activePlayers[0], 'Everyone else packed.');
  return true;
}

function advanceTurn(room, fromPlayerId) {
  if (maybeFinishRound(room)) {
    return;
  }

  const nextPlayer = getNextActivePlayer(room, fromPlayerId);
  if (!nextPlayer) {
    return;
  }

  room.round.actionPlayerId = nextPlayer.id;
}

function clearRoundState(room) {
  room.prompt = null;
  room.sideShowReveal = null;
  room.cardsById = {};
  room.drawPile = [];
  room.winnerId = null;
  room.players.forEach((player) => {
    player.status = player.chips > 0 ? 'waiting' : 'busted';
    player.hasSeenCards = false;
    player.hand = [];
    player.discarded = [];
    player.pendingDiscardCount = 0;
  });
}

function ensureController(room) {
  const controller = getPlayer(room, room.controllerPlayerId);
  if (controller && controller.status !== 'busted') {
    return;
  }

  const fallback = room.players.find((player) => player.status !== 'busted');
  room.controllerPlayerId = fallback?.id || room.hostPlayerId;
}

function getCallAmount(room, player) {
  return room.round.currentStake * (player.hasSeenCards ? 2 : 1);
}

function getRaiseStep(player) {
  return player.hasSeenCards ? 2 : 1;
}

function getMinRaiseAmount(room, player) {
  return getCallAmount(room, player) + getRaiseStep(player);
}

function getRaiseAmount(room, player) {
  const minRaiseAmount = getMinRaiseAmount(room, player);
  const doubled = getCallAmount(room, player) * 2;
  const stepped = Math.ceil(doubled / getRaiseStep(player)) * getRaiseStep(player);
  return Math.max(minRaiseAmount, stepped);
}

function debitPlayer(player, amount) {
  if (player.chips < amount) {
    return false;
  }

  player.chips -= amount;
  return true;
}

function creditPot(room, amount) {
  room.round.pot += amount;
}

function revealAllHands(room) {
  room.round.showAllCards = true;
}

export function createRoom(hostSocketId, username, roomId) {
  const room = {
    id: roomId || generateRoomId(),
    phase: 'lobby',
    players: [],
    hostPlayerId: '',
    controllerPlayerId: '',
    winnerId: '',
    history: [],
    prompt: null,
    sideShowReveal: null,
    config: buildConfigFromPreset('classic'),
    cardsById: {},
    drawPile: [],
    round: null,
  };

  const player = createPlayer(hostSocketId, username);
  player.chips = room.config.startingChips;
  room.players.push(player);
  room.hostPlayerId = player.id;
  room.controllerPlayerId = player.id;
  assignSeats(room);
  pushHistory(room, `${player.name} opened the table.`);

  return { room, player };
}

export function joinRoom(room, socketId, username) {
  if (room.players.length >= room.config.maxPlayers) {
    return { error: 'This table is full.' };
  }

  const cleanName = sanitizeUsername(username);
  const nameTaken = room.players.some((player) => player.name.toLowerCase() === cleanName.toLowerCase());
  if (nameTaken) {
    return { error: 'That player name is already in use.' };
  }

  const player = createPlayer(socketId, cleanName);
  player.chips = room.config.startingChips;
  room.players.push(player);
  assignSeats(room);
  pushHistory(
    room,
    room.phase === 'lobby' || room.phase === 'finished'
      ? `${player.name} joined seat ${player.seat + 1}.`
      : `${player.name} joined seat ${player.seat + 1} and will play next round.`,
  );
  return { player };
}

export function reconnectRoom(room, socketId, playerToken) {
  const player = getPlayerByToken(room, playerToken);
  if (!player) {
    return { error: 'Reconnect token is invalid for this room.' };
  }

  player.socketId = socketId;
  player.connected = true;
  pushHistory(room, `${player.name} reconnected.`);
  return { player };
}

export function disconnectPlayer(room, playerId) {
  const player = getPlayer(room, playerId);
  if (!player) {
    return;
  }

  player.connected = false;
  player.socketId = null;
}

export function leaveRoom(room, playerId) {
  const player = getPlayer(room, playerId);
  if (!player) {
    return { deleted: false };
  }

  room.players = room.players.filter((entry) => entry.id !== playerId);
  assignSeats(room);
  ensureController(room);

  if (room.hostPlayerId === playerId) {
    room.hostPlayerId = room.players[0]?.id || '';
  }

  if (!room.players.length) {
    return { deleted: true };
  }

  pushHistory(room, `${player.name} left the table.`);
  if (room.phase !== 'lobby' && room.phase !== 'finished') {
    maybeFinishRound(room);
  }
  return { deleted: false };
}

export function updateConfig(room, playerId, payload) {
  if (room.phase !== 'lobby' && room.phase !== 'finished') {
    return { error: 'Only lobby tables or finished rounds can change rules.' };
  }

  if (playerId !== room.hostPlayerId) {
    return { error: 'Only the host can edit the table rules.' };
  }

  room.config = normalizeConfig({
    ...room.config,
    ...payload,
  });

  for (const player of room.players) {
    if (player.status === 'waiting') {
      player.chips = room.config.startingChips;
    }
  }

  pushHistory(room, `${getPlayer(room, playerId)?.name || 'The host'} updated the table rules.`);
  return { ok: true };
}

export function setPlayerChips(room, playerId, targetPlayerId, chips) {
  if (playerId !== room.hostPlayerId) {
    return { error: 'Only the host can set player chips.' };
  }

  const target = getPlayer(room, targetPlayerId);
  if (!target) {
    return { error: 'Player not found.' };
  }

  target.chips = Math.max(0, Number(chips) || 0);
  target.status = target.chips > 0 ? 'waiting' : 'busted';
  pushHistory(room, `${target.name} now has ${target.chips} chips.`);
  return { ok: true };
}

export function startRound(room, playerId) {
  if (playerId !== room.hostPlayerId) {
    return { error: 'Only the host can start the game.' };
  }

  clearRoundState(room);
  ensureController(room);

  const eligiblePlayers = room.players.filter((player) => player.chips >= room.config.bootAmount);
  if (eligiblePlayers.length < room.config.minPlayers) {
    return { error: 'At least 2 players with enough chips for boot are required.' };
  }

  const cardsNeeded = eligiblePlayers.length * room.config.cardsDealt;
  const deckCount = Math.max(1, Math.ceil(cardsNeeded / 52));
  const deck = createDeck(deckCount);
  const resolvedJokers = resolveRoundJokers(room.config);
  room.cardsById = deck.cardsById;
  room.drawPile = deck.drawPile;
  room.round = {
    id: randomId(),
    number: (room.round?.number || 0) + 1,
    pot: 0,
    currentStake: room.config.bootAmount,
    dealerPlayerId: room.hostPlayerId,
    actionPlayerId: '',
    winnerId: '',
    showAllCards: false,
    activeJokerRanks: resolvedJokers.activeJokerRanks,
    activeJokerSuits: resolvedJokers.activeJokerSuits,
  };

  assignSeats(room);
  room.phase = 'betting';
  room.prompt = null;
  room.sideShowReveal = null;

  for (const player of room.players) {
    if (!eligiblePlayers.some((entry) => entry.id === player.id)) {
      player.status = player.chips > 0 ? 'waiting' : 'busted';
      continue;
    }

    debitPlayer(player, room.config.bootAmount);
    creditPot(room, room.config.bootAmount);
    player.status = 'active';
    player.hasSeenCards = false;
    player.hand = room.drawPile.splice(0, room.config.cardsDealt);
    player.discarded = [];
    player.pendingDiscardCount = room.config.cardsDealt - room.config.cardsToKeep;
  }

  const opener = getNextActivePlayer(room, room.round.dealerPlayerId) || eligiblePlayers[0];
  room.round.actionPlayerId = opener.id;

  pushHistory(
    room,
    `Round ${room.round.number} started with ${deckCount} deck${deckCount === 1 ? '' : 's'}. Boot is ${room.config.bootAmount}, pot is ${room.round.pot}, and ${opener.name} acts first.`,
  );

  if (room.config.specialHandMode === 'kiss_miss') {
    pushHistory(room, 'Kiss Miss is active. Make two kiss/miss pairs from 5 cards and the leftover rank decides the trail.');
  } else if (room.round.activeJokerRanks.length || room.round.activeJokerSuits.length) {
    pushHistory(
      room,
      `Active jokers this round: ${
        [
          room.round.activeJokerRanks.length ? `number ${room.round.activeJokerRanks.join(', ')}` : '',
          room.round.activeJokerSuits.length ? `color ${room.round.activeJokerSuits.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join(' • ')
      }.`,
    );
  }

  pushHistory(room, 'Betting is live. Everyone starts blind until they look at their cards.');
  if (room.config.cardsDealt > room.config.cardsToKeep) {
    pushHistory(
      room,
      `Discard is optional after seeing cards. Keep playing blind if you want, or open later and discard ${room.config.cardsDealt - room.config.cardsToKeep} card(s).`,
    );
  }

  return { ok: true };
}

function handleDiscard(room, player, payload) {
  if (room.phase !== 'betting') {
    return { error: 'Discard is only available during an active betting round.' };
  }
  if (!player.pendingDiscardCount) {
    return { error: 'Your hand is already locked.' };
  }
  if (!player.hasSeenCards) {
    return { error: 'See your cards before discarding.' };
  }

  const discardIds = Array.from(new Set(payload.discardIds || []));
  if (discardIds.length !== player.pendingDiscardCount) {
    return { error: `Discard exactly ${player.pendingDiscardCount} card(s).` };
  }

  const ownsAllCards = discardIds.every((cardId) => player.hand.includes(cardId));
  if (!ownsAllCards) {
    return { error: 'You can only discard cards from your own hand.' };
  }

  player.hand = player.hand.filter((cardId) => !discardIds.includes(cardId));
  player.discarded = discardIds;
  player.pendingDiscardCount = 0;
  pushHistory(
    room,
    `${player.name} locked ${room.config.cardsToKeep} actual card(s) with ${room.config.assumedWildCards} assumed card(s).`,
  );

  const pending = room.players.some((entry) => entry.pendingDiscardCount > 0);
  if (!pending && room.config.cardsDealt > room.config.cardsToKeep) {
    beginBetting(room);
  }

  return { ok: true };
}

function handleLookCards(room, player) {
  if (room.phase !== 'betting') {
    return { error: 'Cards can only be opened during an active round.' };
  }
  if (room.round.actionPlayerId !== player.id && !player.pendingDiscardCount) {
    return { error: 'It is not your turn.' };
  }
  if (player.hasSeenCards) {
    return { error: 'You have already seen your cards.' };
  }

  player.hasSeenCards = true;
  if (player.pendingDiscardCount > 0) {
    player.status = 'seen';
    pushHistory(room, `${player.name} saw their cards and can now discard whenever they want.`);
  } else {
    player.status = 'seen';
    pushHistory(room, `${player.name} saw their cards and is now playing seen.`);
  }
  return { ok: true };
}

function handleBet(room, player, mode, payload = {}) {
  if (room.phase !== 'betting') {
    return { error: 'Betting is not active right now.' };
  }
  if (room.round.actionPlayerId !== player.id) {
    return { error: 'It is not your turn.' };
  }

  const amount = mode === 'raise'
    ? Number(payload.amount || getRaiseAmount(room, player))
    : getCallAmount(room, player);

  if (mode === 'raise') {
    const minRaiseAmount = getMinRaiseAmount(room, player);
    const raiseStep = getRaiseStep(player);

    if (!Number.isInteger(amount) || amount < minRaiseAmount) {
      return { error: `Raise must be at least ${minRaiseAmount} chips.` };
    }
    if (amount % raiseStep !== 0) {
      return { error: `Raise must increase in steps of ${raiseStep} chip(s).` };
    }
  }

  if (!debitPlayer(player, amount)) {
    return { error: 'You do not have enough chips for that bet.' };
  }

  creditPot(room, amount);
  if (mode === 'raise') {
    room.round.currentStake = player.hasSeenCards ? amount / 2 : amount;
  }

  pushHistory(
    room,
    `${player.name} ${mode === 'raise' ? 'raised' : 'called'} for ${amount} chips ${player.hasSeenCards ? '(seen)' : '(blind)'}.`,
  );

  advanceTurn(room, player.id);
  return { ok: true };
}

function handlePack(room, player) {
  if (room.phase !== 'betting') {
    return { error: 'You can only pack during betting.' };
  }
  if (room.round.actionPlayerId !== player.id) {
    return { error: 'It is not your turn.' };
  }

  player.status = 'packed';
  pushHistory(room, `${player.name} packed.`);
  advanceTurn(room, player.id);
  return { ok: true };
}

function handleSideShowRequest(room, player) {
  if (!room.config.sideShowEnabled) {
    return { error: 'Side show is disabled at this table.' };
  }
  if (room.phase !== 'betting') {
    return { error: 'Side show is only available during betting.' };
  }
  if (room.round.actionPlayerId !== player.id) {
    return { error: 'It is not your turn.' };
  }
  if (!player.hasSeenCards) {
    return { error: 'Only seen players can request a side show.' };
  }
  if (getActivePlayers(room).length <= 2) {
    return { error: 'Use show when only two players remain.' };
  }

  const target = getPreviousSeenPlayer(room, player.id);
  if (!target) {
    return { error: 'No previous seen player is available for a side show.' };
  }

  const stake = getCallAmount(room, player);
  if (!debitPlayer(player, stake)) {
    return { error: 'You do not have enough chips to request a side show.' };
  }

  creditPot(room, stake);
  room.prompt = {
    kind: 'side_show',
    requestorId: player.id,
    targetId: target.id,
    stake,
  };
  pushHistory(room, `${player.name} requested a side show from ${target.name}.`);
  return { ok: true };
}

function handlePromptAnswer(room, player, payload) {
  if (!room.prompt) {
    return { error: 'There is no pending prompt.' };
  }
  if (room.prompt.kind !== 'side_show') {
    return { error: 'Unknown prompt.' };
  }
  if (room.prompt.targetId !== player.id) {
    return { error: 'This prompt is not for you.' };
  }

  const requestor = getPlayer(room, room.prompt.requestorId);
  const target = getPlayer(room, room.prompt.targetId);
  if (!requestor || !target) {
    room.prompt = null;
    return { error: 'The side show players are no longer active.' };
  }

  if (!payload.accept) {
    pushHistory(room, `${target.name} rejected the side show.`);
    room.prompt = null;
    advanceTurn(room, requestor.id);
    return { ok: true };
  }

  const result = evaluateWinner(room, requestor, target);
  room.prompt = null;
  room.phase = 'side_show_reveal';
  room.sideShowReveal = {
    requestorId: requestor.id,
    targetId: target.id,
    winnerId: result.winnerPlayer.id,
    loserId: result.loserPlayer.id,
    endsAt: Date.now() + 10_000,
  };
  pushHistory(room, `${target.name} accepted the side show. Showing both hands for 10 seconds.`);
  return { ok: true, effect: { type: 'side_show_reveal_started' } };
}

function handleShow(room, player) {
  if (!room.config.showEnabled) {
    return { error: 'Show is disabled at this table.' };
  }
  if (room.phase !== 'betting') {
    return { error: 'Show is only available during betting.' };
  }
  if (room.round.actionPlayerId !== player.id) {
    return { error: 'It is not your turn.' };
  }

  const activePlayers = getActivePlayers(room);
  if (activePlayers.length !== 2) {
    return { error: 'Show is only available when exactly two players remain.' };
  }

  const stake = getCallAmount(room, player);
  if (!debitPlayer(player, stake)) {
    return { error: 'You do not have enough chips to ask for show.' };
  }

  creditPot(room, stake);
  const opponent = activePlayers.find((entry) => entry.id !== player.id);
  const result = evaluateWinner(room, player, opponent);
  revealAllHands(room);
  finishRound(room, result.winnerPlayer, `${player.name} asked for show against ${opponent.name}.`);
  return { ok: true };
}

export function handleCommand(room, playerId, type, payload = {}) {
  const player = getPlayer(room, playerId);
  if (!player) {
    return { error: 'Player session not found.' };
  }

  if (!room.round) {
    return { error: 'The round has not started yet.' };
  }

  if (room.sideShowReveal) {
    return { error: 'Wait for the side show reveal to finish.' };
  }

  if (room.prompt && type !== 'answer_prompt') {
    return { error: 'Resolve the current prompt before taking another action.' };
  }

  switch (type) {
    case 'discard_cards':
      return handleDiscard(room, player, payload);
    case 'look_cards':
      return handleLookCards(room, player);
    case 'call':
      return handleBet(room, player, 'call');
    case 'raise':
      return handleBet(room, player, 'raise', payload);
    case 'pack':
      return handlePack(room, player);
    case 'request_side_show':
      return handleSideShowRequest(room, player);
    case 'answer_prompt':
      return handlePromptAnswer(room, player, payload);
    case 'show':
      return handleShow(room, player);
    default:
      return { error: 'Unknown command.' };
  }
}

function getAvailableActions(room, player) {
  const activeCount = getActivePlayers(room).length;
  const isTurn = room.round?.actionPlayerId === player.id;
  const sideShowTarget = getPreviousSeenPlayer(room, player.id);
  const callAmount = room.round ? getCallAmount(room, player) : 0;
  const minRaiseAmount = room.round ? getMinRaiseAmount(room, player) : 0;

  return {
    canDiscard: room.phase === 'betting' && player.pendingDiscardCount > 0 && player.hasSeenCards,
    canLook: room.phase === 'betting' && !player.hasSeenCards && (isTurn || player.pendingDiscardCount > 0),
    canCall:
      room.phase === 'betting' &&
      isTurn &&
      (player.status === 'active' || player.status === 'seen') &&
      player.chips >= callAmount,
    canRaise:
      room.phase === 'betting' &&
      isTurn &&
      (player.status === 'active' || player.status === 'seen') &&
      player.chips >= minRaiseAmount,
    canPack: room.phase === 'betting' && isTurn && (player.status === 'active' || player.status === 'seen'),
    canRequestSideShow:
      room.phase === 'betting' &&
      isTurn &&
      room.config.sideShowEnabled &&
      player.hasSeenCards &&
      activeCount > 2 &&
      Boolean(sideShowTarget) &&
      player.chips >= callAmount,
    canShow:
      room.phase === 'betting' &&
      isTurn &&
      room.config.showEnabled &&
      activeCount === 2 &&
      player.chips >= callAmount,
    sideShowTargetId: sideShowTarget?.id || '',
    callAmount,
    raiseAmount: room.round ? getRaiseAmount(room, player) : 0,
    minRaiseAmount,
    maxRaiseAmount: player.chips,
    raiseStep: getRaiseStep(player),
  };
}

function serializePlayer(room, player, isSelf) {
  const revealCards =
    room.phase === 'finished' ||
    room.round?.showAllCards ||
    (isSelf && player.hasSeenCards);
  const cards = revealCards ? player.hand.map((cardId) => serializeCard(room, cardId)) : [];
  const handScore = revealCards && player.hand.length >= room.config.cardsToKeep
    ? evaluateBestTeenPattiHand(
        getPlayerCards(room, player),
        getRoundJokerSettings(room),
        room.config.cardsToKeep,
        room.config.assumedWildCards,
        room.config.handRankingMode,
      )
    : null;

  return {
    id: player.id,
    name: player.name,
    seat: player.seat,
    chips: player.chips,
    connected: player.connected,
    status: player.status,
    hasSeenCards: player.hasSeenCards,
    handCount: player.hand.length,
    pendingDiscardCount: player.pendingDiscardCount,
    cards,
    handLabel: handScore?.label || '',
  };
}

function serializePrompt(room, playerId) {
  if (!room.prompt) {
    return null;
  }

  if (room.prompt.kind === 'side_show') {
    const requestor = getPlayer(room, room.prompt.requestorId);
    const target = getPlayer(room, room.prompt.targetId);
    return {
      kind: 'side_show',
      stake: room.prompt.stake,
      requestorId: room.prompt.requestorId,
      targetId: room.prompt.targetId,
      requestorName: requestor?.name || 'Player',
      targetName: target?.name || 'Player',
      awaitingYou: room.prompt.targetId === playerId,
    };
  }

  return null;
}

function serializeSideShowReveal(room, playerId) {
  if (!room.sideShowReveal) {
    return null;
  }

  const requestor = getPlayer(room, room.sideShowReveal.requestorId);
  const target = getPlayer(room, room.sideShowReveal.targetId);
  const winner = getPlayer(room, room.sideShowReveal.winnerId);
  const loser = getPlayer(room, room.sideShowReveal.loserId);
  const viewerIsParticipant =
    playerId === room.sideShowReveal.requestorId || playerId === room.sideShowReveal.targetId;

  const requestorHand = requestor?.hand?.length >= room.config.cardsToKeep
    ? evaluateBestTeenPattiHand(
        getPlayerCards(room, requestor),
        getRoundJokerSettings(room),
        room.config.cardsToKeep,
        room.config.assumedWildCards,
        room.config.handRankingMode,
      )
    : null;
  const targetHand = target?.hand?.length >= room.config.cardsToKeep
    ? evaluateBestTeenPattiHand(
        getPlayerCards(room, target),
        getRoundJokerSettings(room),
        room.config.cardsToKeep,
        room.config.assumedWildCards,
        room.config.handRankingMode,
      )
    : null;

  return {
    requestorId: room.sideShowReveal.requestorId,
    targetId: room.sideShowReveal.targetId,
    winnerId: room.sideShowReveal.winnerId,
    loserId: room.sideShowReveal.loserId,
    requestorName: requestor?.name || 'Player',
    targetName: target?.name || 'Player',
    winnerName: winner?.name || 'Player',
    loserName: loser?.name || 'Player',
    requestorHandLabel: requestorHand?.label || '',
    targetHandLabel: targetHand?.label || '',
    requestorCards: viewerIsParticipant ? requestor?.hand.map((cardId) => serializeCard(room, cardId)).filter(Boolean) || [] : [],
    targetCards: viewerIsParticipant ? target?.hand.map((cardId) => serializeCard(room, cardId)).filter(Boolean) || [] : [],
    endsAt: room.sideShowReveal.endsAt,
    visibleToYou: viewerIsParticipant,
  };
}

export function finalizeSideShowReveal(room) {
  if (!room.sideShowReveal) {
    return { error: 'No side show reveal is active.' };
  }

  const requestor = getPlayer(room, room.sideShowReveal.requestorId);
  const loser = getPlayer(room, room.sideShowReveal.loserId);
  const winner = getPlayer(room, room.sideShowReveal.winnerId);

  if (loser) {
    loser.status = 'packed';
  }

  pushHistory(room, `${loser?.name || 'A player'} packed after the side show. ${winner?.name || 'The winner'} won the comparison.`);
  room.sideShowReveal = null;
  room.phase = 'betting';

  if (!maybeFinishRound(room) && requestor) {
    advanceTurn(room, requestor.id);
  }

  return { ok: true };
}

export function serializeRoomForPlayer(room, playerId) {
  const viewer = getPlayer(room, playerId);
  const canViewerSeeHand = Boolean(
    viewer && (viewer.hasSeenCards || room.phase === 'finished' || room.round?.showAllCards),
  );
  const viewerBestHand = canViewerSeeHand && viewer?.hand?.length >= room.config.cardsToKeep
    ? evaluateBestTeenPattiHand(
        getPlayerCards(room, viewer),
        getRoundJokerSettings(room),
        room.config.cardsToKeep,
        room.config.assumedWildCards,
        room.config.handRankingMode,
      )
    : null;
  return {
    id: room.id,
    phase: room.phase,
    hostPlayerId: room.hostPlayerId,
    controllerPlayerId: room.controllerPlayerId,
    winnerId: room.winnerId,
    config: room.config,
    history: room.history,
    prompt: serializePrompt(room, playerId),
    sideShowReveal: serializeSideShowReveal(room, playerId),
    round: room.round
      ? {
          number: room.round.number,
          pot: room.round.pot,
          currentStake: room.round.currentStake,
          dealerPlayerId: room.round.dealerPlayerId,
          actionPlayerId: room.round.actionPlayerId,
          showAllCards: room.round.showAllCards,
          activeJokerRanks: room.round.activeJokerRanks || [],
          activeJokerSuits: room.round.activeJokerSuits || [],
          specialHandMode: room.config.specialHandMode,
        }
      : null,
    players: room.players
      .slice()
      .sort((left, right) => left.seat - right.seat)
      .map((player) => serializePlayer(room, player, viewer?.id === player.id)),
    you: viewer
      ? {
          playerId: viewer.id,
          playerToken: viewer.token,
          chips: viewer.chips,
          hasSeenCards: viewer.hasSeenCards,
          handVisible: canViewerSeeHand,
          handCount: viewer.hand.length,
          hand: canViewerSeeHand ? viewer.hand.map((cardId) => serializeCard(room, cardId)).filter(Boolean) : [],
          discarded: canViewerSeeHand ? viewer.discarded.map((cardId) => serializeCard(room, cardId)).filter(Boolean) : [],
          bestHandLabel: viewerBestHand?.label || '',
          bestHandDetail: room.config.specialHandMode === 'kiss_miss' ? formatKissMissDetail(viewerBestHand) : '',
          bestHandCards: serializeBestHand(room, viewerBestHand?.cards || []),
          recommendedDiscardCards: serializeDiscardCards(room, viewerBestHand?.discardedCards || []),
          assumedWildCards: room.config.assumedWildCards,
          assumedCardsPreview: serializeAssumedWildCards(room.config.assumedWildCards),
          resolvedAssumedCards: serializeResolvedAssumedCards(room, viewerBestHand?.assumedCards || []),
          pendingDiscardCount: viewer.pendingDiscardCount,
          availableActions: getAvailableActions(room, viewer),
          isHost: viewer.id === room.hostPlayerId,
          isController: viewer.id === room.controllerPlayerId,
        }
      : null,
  };
}
