import { formatRank, RANKS, SUITS } from './cards';

const CATEGORY_ORDER = {
  highCard: 1,
  pair: 2,
  color: 3,
  sequence: 4,
  pureSequence: 5,
  trail: 6,
};

function compareVectors(left = [], right = []) {
  const size = Math.max(left.length, right.length);
  for (let index = 0; index < size; index += 1) {
    const leftValue = left[index] || 0;
    const rightValue = right[index] || 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }
  return 0;
}

function compareScores(left, right) {
  if (left.categoryRank > right.categoryRank) {
    return 1;
  }
  if (left.categoryRank < right.categoryRank) {
    return -1;
  }
  return compareVectors(left.tiebreaker, right.tiebreaker);
}

function compareScoresForMode(left, right, rankingMode = 'classic') {
  const comparison = compareScores(left, right);
  return rankingMode === 'muflis' ? comparison * -1 : comparison;
}

function formatRanksList(ranks) {
  return ranks.map((rank) => formatRank(rank)).join('-');
}

function getStraightValue(ranks) {
  const sorted = [...ranks].sort((left, right) => right - left);
  if (sorted[0] === 14 && sorted[1] === 3 && sorted[2] === 2) {
    return 3;
  }

  if (sorted[0] - 1 === sorted[1] && sorted[1] - 1 === sorted[2]) {
    return sorted[0];
  }

  return 0;
}

function evaluateConcreteHand(cards, jokerCountUsed) {
  const ranks = cards.map((card) => card.rank);
  const suits = cards.map((card) => card.suit);
  const rankCounts = new Map();

  for (const rank of ranks) {
    rankCounts.set(rank, (rankCounts.get(rank) || 0) + 1);
  }

  const counts = Array.from(rankCounts.entries()).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return right[0] - left[0];
  });

  const flush = suits.every((suit) => suit === suits[0]);
  const straightValue = getStraightValue(ranks);

  if (counts[0][1] === 3) {
    const trailRank = counts[0][0];
    return {
      category: 'trail',
      categoryRank: CATEGORY_ORDER.trail,
      tiebreaker: [trailRank],
      jokerCountUsed,
      label: `Trail ${formatRank(trailRank)}`,
    };
  }

  if (flush && straightValue && jokerCountUsed === 0) {
    const straightRanks = [...ranks].sort((left, right) => right - left);
    return {
      category: 'pureSequence',
      categoryRank: CATEGORY_ORDER.pureSequence,
      tiebreaker: [straightValue],
      jokerCountUsed,
      label: `Pure Sequence ${formatRanksList(straightRanks)}`,
    };
  }

  if (straightValue) {
    const straightRanks = [...ranks].sort((left, right) => right - left);
    return {
      category: 'sequence',
      categoryRank: CATEGORY_ORDER.sequence,
      tiebreaker: [straightValue],
      jokerCountUsed,
      label: `Sequence ${formatRanksList(straightRanks)}`,
    };
  }

  if (flush) {
    const highCard = [...ranks].sort((left, right) => right - left)[0];
    return {
      category: 'color',
      categoryRank: CATEGORY_ORDER.color,
      tiebreaker: [...ranks].sort((left, right) => right - left),
      jokerCountUsed,
      label: `Color ${formatRank(highCard)} high`,
    };
  }

  if (counts[0][1] === 2) {
    const pairRank = counts[0][0];
    const kicker = counts[1][0];
    return {
      category: 'pair',
      categoryRank: CATEGORY_ORDER.pair,
      tiebreaker: [pairRank, kicker],
      jokerCountUsed,
      label: `Pair of ${formatRank(pairRank)}`,
    };
  }

  const highCard = [...ranks].sort((left, right) => right - left)[0];
  return {
    category: 'highCard',
    categoryRank: CATEGORY_ORDER.highCard,
    tiebreaker: [...ranks].sort((left, right) => right - left),
    jokerCountUsed,
    label: `${formatRank(highCard)} high`,
  };
}

function buildCandidates(cards, jokerRanks, assumedWildCards = 0) {
  const concrete = [];
  const jokers = [];

  for (const card of cards) {
    if (jokerRanks.includes(card.rank)) {
      jokers.push({
        source: 'joker',
        card,
      });
    } else {
      concrete.push(card);
    }
  }

  for (let index = 0; index < assumedWildCards; index += 1) {
    jokers.push({
      source: 'assumed',
      card: {
        id: `assumed-${index}`,
        assumed: true,
      },
    });
  }

  if (!jokers.length) {
    return [{ cards: concrete, jokerCountUsed: 0 }];
  }

  const substitutions = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      substitutions.push({
        rank,
        suit: suit.value,
        suitSymbol: suit.symbol,
        label: `${formatRank(rank)}${suit.symbol}`,
      });
    }
  }

  const candidates = [];

  function walk(index, currentCards, assumedCards) {
    if (index === jokers.length) {
      candidates.push({
        cards: [...concrete, ...currentCards],
        assumedCards: [...assumedCards],
        jokerCountUsed: jokers.length,
      });
      return;
    }

    for (const substitute of substitutions) {
      currentCards.push(substitute);
      if (jokers[index].source === 'assumed') {
        assumedCards.push(substitute);
      }
      walk(index + 1, currentCards, assumedCards);
      currentCards.pop();
      if (jokers[index].source === 'assumed') {
        assumedCards.pop();
      }
    }
  }

  walk(0, [], []);
  return candidates;
}

export function evaluateTeenPattiHand(cards, jokerRanks = [], assumedWildCards = 0) {
  let best = null;

  for (const candidate of buildCandidates(cards, jokerRanks, assumedWildCards)) {
    const score = evaluateConcreteHand(candidate.cards, candidate.jokerCountUsed);
    if (!best || compareScores(score, best) > 0) {
      best = {
        ...score,
        assumedCards: candidate.assumedCards,
        resolvedCards: candidate.cards,
      };
    }
  }

  return best;
}

function combinations(items, size) {
  const results = [];

  function walk(startIndex, current) {
    if (current.length === size) {
      results.push([...current]);
      return;
    }

    for (let index = startIndex; index < items.length; index += 1) {
      current.push(items[index]);
      walk(index + 1, current);
      current.pop();
    }
  }

  walk(0, []);
  return results;
}

export function evaluateBestTeenPattiHand(
  cards,
  jokerRanks = [],
  keepCount = 3,
  assumedWildCards = 0,
  rankingMode = 'classic',
) {
  if (!cards?.length) {
    return null;
  }

  if (cards.length <= keepCount) {
    const score = evaluateTeenPattiHand(cards, jokerRanks, assumedWildCards);
    return {
      ...score,
      cards,
      discardedCards: [],
      assumedWildCards,
      assumedCards: score.assumedCards || [],
      resolvedCards: score.resolvedCards || cards,
    };
  }

  let best = null;

  for (const candidateCards of combinations(cards, keepCount)) {
    const score = evaluateTeenPattiHand(candidateCards, jokerRanks, assumedWildCards);
    if (!best || compareScoresForMode(score, best, rankingMode) > 0) {
      const keptIds = new Set(candidateCards.map((card) => card.id));
      best = {
        ...score,
        cards: candidateCards,
        discardedCards: cards.filter((card) => !keptIds.has(card.id)),
        assumedWildCards,
        assumedCards: score.assumedCards || [],
        resolvedCards: score.resolvedCards || candidateCards,
      };
    }
  }

  return best;
}

export function compareTeenPattiHands(
  leftCards,
  rightCards,
  jokerRanks = [],
  assumedWildCards = 0,
  rankingMode = 'classic',
) {
  const leftScore = evaluateTeenPattiHand(leftCards, jokerRanks, assumedWildCards);
  const rightScore = evaluateTeenPattiHand(rightCards, jokerRanks, assumedWildCards);
  return {
    leftScore,
    rightScore,
    winner: compareScoresForMode(leftScore, rightScore, rankingMode),
  };
}
