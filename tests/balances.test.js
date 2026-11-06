import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoom, joinRoom, reconnectRoom, startRound, handleCommand, handleTurnTimeout,
  finalizeSideShowReveal, serializeRoomForPlayer, setPlayerChips, updateConfig,
} from '../src/game/engine.js';

function table(count = 2) {
  const { room, player: host } = createRoom('host', 'Host', 'TEST');
  const players = [host];
  for (let i = 1; i < count; i += 1) {
    players.push(joinRoom(room, `socket-${i}`, `Guest ${i}`).player);
  }
  players[1].chips = 10;
  assert.equal(startRound(room, host.id).ok, true);
  return { room, host, guest: players[1], players };
}

function command(room, player, type, payload) {
  const result = handleCommand(room, player.id, type, payload);
  assert.equal(result.error, undefined, result.error);
  return result;
}

test('a player can call and raise below zero for the current hand', () => {
  const { room, host, guest } = table();
  const actions = serializeRoomForPlayer(room, guest.id).you.availableActions;
  assert.equal(actions.canCall, true);
  assert.equal(actions.canRaise, true);
  command(room, guest, 'raise', { amount: 20 });
  assert.equal(guest.chips, -20);
  command(room, host, 'call');
  command(room, guest, 'call');
  assert.equal(guest.chips, -40);
  assert.equal(room.round.pot, 80);
});

test('winnings repay the negative balance before the player keeps the rest', () => {
  const { room, host, guest } = table();
  command(room, guest, 'call');
  assert.equal(guest.chips, -10);
  command(room, host, 'pack');
  assert.equal(room.phase, 'finished');
  assert.equal(guest.chips, 20);
  assert.equal(guest.status, 'winner');
  assert.equal(startRound(room, host.id).ok, true);
  assert.equal(guest.status, 'active');
});

test('a losing player must explicitly rejoin with fresh chips', () => {
  const { room, host, guest } = table();
  command(room, guest, 'call');
  command(room, host, 'call');
  command(room, guest, 'pack');
  assert.equal(guest.status, 'busted');
  assert.equal(guest.chips, -10);
  const before = JSON.stringify(room);
  assert.ok(startRound(room, host.id).error);
  assert.equal(JSON.stringify(room), before, 'failed start must preserve the result');
  assert.equal(serializeRoomForPlayer(room, guest.id).you.availableActions.canRejoin, true);
  command(room, guest, 'rejoin');
  assert.equal(guest.chips, room.config.startingChips);
  assert.equal(guest.status, 'waiting');
  assert.ok(handleCommand(room, guest.id, 'rejoin').error, 'no repeated free refill');
  assert.equal(startRound(room, host.id).ok, true);
  assert.equal(guest.chips, room.config.startingChips - room.config.bootAmount);
});

test('rejoining during a hand queues the player without adding them to it', () => {
  const { room, host, guest, players } = table(3);
  command(room, guest, 'pack');
  assert.equal(guest.status, 'busted');
  const pot = room.round.pot;
  const turn = room.round.actionPlayerId;
  command(room, guest, 'rejoin');
  assert.equal(guest.status, 'waiting');
  assert.equal(room.round.pot, pot);
  assert.equal(room.round.actionPlayerId, turn);
  for (const type of ['call', 'raise', 'show', 'look_cards', 'discard_cards', 'pack']) {
    assert.ok(handleCommand(room, guest.id, type).error, type);
  }
  command(room, players[2], 'pack');
  assert.equal(startRound(room, host.id).ok, true);
  assert.equal(guest.status, 'active');
});

test('zero and below-boot balances are removed after losing or timing out', () => {
  for (const remaining of [0, 5, -10]) {
    const { room, guest } = table();
    guest.chips = remaining;
    assert.equal(handleTurnTimeout(room, room.round.turnEndsAt + 1).ok, true);
    assert.equal(guest.status, 'busted');
  }
});

test('show can be paid on credit and a losing player is busted', () => {
  const { room, host, guest } = table();
  guest.hand = ['2-clubs', '5-hearts', '8-spades'];
  host.hand = ['14-clubs', '14-hearts', '14-spades'];
  for (const player of [host, guest]) {
    for (const id of player.hand) {
      const [rank, suit] = id.split('-');
      room.cardsById[id] = { id, rank: Number(rank), suit, label: id };
    }
  }
  assert.equal(serializeRoomForPlayer(room, guest.id).you.availableActions.canShow, true);
  command(room, guest, 'show');
  assert.equal(room.winnerId, host.id);
  assert.equal(guest.chips, -10);
  assert.equal(guest.status, 'busted');
});

test('side show on credit busts its loser after the reveal', () => {
  const { room, host, guest } = table(3);
  host.hasSeenCards = true;
  host.status = 'seen';
  for (const [player, ranks] of [[host, [14, 14, 14]], [guest, [2, 5, 8]]]) {
    player.hand = ranks.map((rank, index) => {
      const id = `${player.id}-${index}`;
      room.cardsById[id] = { id, rank, suit: ['clubs', 'hearts', 'spades'][index], label: String(rank) };
      return id;
    });
  }
  command(room, guest, 'look_cards');
  assert.equal(serializeRoomForPlayer(room, guest.id).you.availableActions.canRequestSideShow, true);
  command(room, guest, 'request_side_show');
  assert.equal(guest.chips, -20);
  command(room, host, 'answer_prompt', { accept: true });
  assert.equal(room.sideShowReveal.loserId, guest.id);
  assert.equal(finalizeSideShowReveal(room).ok, true);
  assert.equal(guest.status, 'busted');
});

test('host cannot change stacks or restart a live hand', () => {
  const { room, host, guest } = table();
  const before = JSON.stringify(room);
  assert.ok(setPlayerChips(room, host.id, guest.id, 1000).error);
  assert.ok(startRound(room, host.id).error);
  assert.equal(JSON.stringify(room), before);
});

test('refreshing or reconnecting does not refill a busted player', () => {
  const { room, guest } = table();
  command(room, guest, 'pack');
  assert.equal(reconnectRoom(room, 'new-socket', guest.token).player, guest);
  assert.equal(guest.status, 'busted');
  assert.equal(guest.chips, 0);
});

test('changing next-hand starting chips preserves current balances and bust state', () => {
  const { room, host, guest } = table();
  command(room, guest, 'pack');
  const balance = host.chips;
  assert.equal(updateConfig(room, host.id, { startingChips: 2000 }).ok, true);
  assert.equal(host.chips, balance);
  assert.equal(guest.status, 'busted');
  command(room, guest, 'rejoin');
  assert.equal(guest.chips, 2000);
});
