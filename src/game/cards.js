export const SUITS = [
  { value: 'spades', symbol: '♠' },
  { value: 'hearts', symbol: '♥' },
  { value: 'diamonds', symbol: '♦' },
  { value: 'clubs', symbol: '♣' },
];

export const RANKS = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

function randomId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatRank(rank) {
  if (rank === 14) {
    return 'A';
  }
  if (rank === 13) {
    return 'K';
  }
  if (rank === 12) {
    return 'Q';
  }
  if (rank === 11) {
    return 'J';
  }
  return String(rank);
}

export function createDeck(deckCount = 1) {
  const cardsById = {};
  const drawPile = [];

  for (let deckIndex = 0; deckIndex < deckCount; deckIndex += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const id = randomId();
        cardsById[id] = {
          id,
          rank,
          suit: suit.value,
          suitSymbol: suit.symbol,
          label: `${formatRank(rank)}${suit.symbol}`,
        };
        drawPile.push(id);
      }
    }
  }

  return {
    cardsById,
    drawPile: shuffle(drawPile),
  };
}

export function shuffle(items) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = next[index];
    next[index] = next[swapIndex];
    next[swapIndex] = current;
  }
  return next;
}
