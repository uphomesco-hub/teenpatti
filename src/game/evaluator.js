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

function normalizeJokerSettings(input) {
  if (Array.isArray(input)) {
    return {
      jokerRanks: input,
      jokerSuits: [],
      specialHandMode: 'standard',
    };
  }

  return {
    jokerRanks: input?.jokerRanks || [],
    jokerSuits: input?.jokerSuits || [],
    specialHandMode: input?.specialHandMode === 'kiss_miss' ? 'kiss_miss' : 'standard',
  };
}

function isConfiguredJoker(card, jokerSettings) {
  return (
    jokerSettings.jokerRanks.includes(card.rank) ||
    jokerSettings.jokerSuits.includes(card.suit)
  );
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

function buildCandidates(cards, jokerSettings, assumedWildCards = 0) {
  const concrete = [];
  const jokers = [];

  for (const card of cards) {
    if (isConfiguredJoker(card, jokerSettings)) {
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
    return [{ cards: concrete, jokerCountUsed: 0, assumedCards: [] }];
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

function getPairKind(leftCard, rightCard) {
  const gap = Math.abs(leftCard.rank - rightCard.rank);
  if (gap === 1) {
    return 'kiss';
  }
  if (gap === 2) {
    return 'miss';
  }
  return null;
}

function pairKindLabel(pairKinds) {
  const kissCount = pairKinds.filter((kind) => kind === 'kiss').length;
  const missCount = pairKinds.filter((kind) => kind === 'miss').length;
  if (kissCount === 2) {
    return 'Two Kisses';
  }
  if (missCount === 2) {
    return 'Two Misses';
  }
  return 'Kiss + Miss';
}

function pairKindStrength(pairKinds) {
  const label = pairKindLabel(pairKinds);
  if (label === 'Two Kisses') {
    return 3;
  }
  if (label === 'Kiss + Miss') {
    return 2;
  }
  return 1;
}

function evaluateKissMissHand(cards, rankingMode = 'classic') {
  if (!cards?.length) {
    return null;
  }

  const fallbackScore = evaluateBestTeenPattiHand(cards, [], 3, 0, 'classic');
  if (cards.length < 5) {
    return {
      category: 'kissMissDead',
      categoryRank: 0,
      tiebreaker: [0],
      label: 'No Kiss/Miss Trail',
      isKissMissValid: false,
      fallbackScore,
    };
  }

  let best = null;

  for (const firstPair of combinations(cards, 2)) {
    const firstKind = getPairKind(firstPair[0], firstPair[1]);
    if (!firstKind) {
      continue;
    }

    const remaining = cards.filter((card) => !firstPair.some((entry) => entry.id === card.id));
    for (const secondPair of combinations(remaining, 2)) {
      const secondKind = getPairKind(secondPair[0], secondPair[1]);
      if (!secondKind) {
        continue;
      }

      const leftover = remaining.find((card) => !secondPair.some((entry) => entry.id === card.id));
      if (!leftover) {
        continue;
      }

      const pairKinds = [firstKind, secondKind];
      const current = {
        category: 'kissMissTrail',
        categoryRank: 7,
        tiebreaker: [leftover.rank, pairKindStrength(pairKinds)],
        label: `Trail ${formatRank(leftover.rank)} via ${pairKindLabel(pairKinds)}`,
        isKissMissValid: true,
        leftoverCard: leftover,
        pairingCards: [...firstPair, ...secondPair],
        pairKinds,
        fallbackScore,
      };

      if (!best || compareScoresForMode(current, best, rankingMode) > 0) {
        best = current;
      }
    }
  }

  if (best) {
    return best;
  }

  return {
    category: 'kissMissDead',
    categoryRank: 0,
    tiebreaker: [0],
    label: 'No Kiss/Miss Trail',
    isKissMissValid: false,
    fallbackScore,
  };
}

function compareKissMissScores(left, right, rankingMode = 'classic') {
  if (left.isKissMissValid && !right.isKissMissValid) {
    return 1;
  }
  if (!left.isKissMissValid && right.isKissMissValid) {
    return -1;
  }
  if (left.isKissMissValid && right.isKissMissValid) {
    return compareScoresForMode(left, right, rankingMode);
  }
  return compareScoresForMode(left.fallbackScore, right.fallbackScore, rankingMode);
}

export function evaluateTeenPattiHand(
  cards,
  jokerSettingsOrRanks = [],
  assumedWildCards = 0,
  rankingMode = 'classic',
) {
  const jokerSettings = normalizeJokerSettings(jokerSettingsOrRanks);
  if (jokerSettings.specialHandMode === 'kiss_miss') {
    return evaluateKissMissHand(cards, rankingMode);
  }

  let best = null;

  for (const candidate of buildCandidates(cards, jokerSettings, assumedWildCards)) {
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

export function evaluateBestTeenPattiHand(
  cards,
  jokerSettingsOrRanks = [],
  keepCount = 3,
  assumedWildCards = 0,
  rankingMode = 'classic',
) {
  if (!cards?.length) {
    return null;
  }

  const jokerSettings = normalizeJokerSettings(jokerSettingsOrRanks);
  if (jokerSettings.specialHandMode === 'kiss_miss') {
    const score = evaluateTeenPattiHand(cards, jokerSettings, 0, rankingMode);
    return {
      ...score,
      cards,
      discardedCards: [],
      assumedWildCards: 0,
      assumedCards: [],
      resolvedCards: cards,
    };
  }

  if (cards.length <= keepCount) {
    const score = evaluateTeenPattiHand(cards, jokerSettings, assumedWildCards, rankingMode);
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
    const score = evaluateTeenPattiHand(candidateCards, jokerSettings, assumedWildCards, rankingMode);
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
  jokerSettingsOrRanks = [],
  assumedWildCards = 0,
  rankingMode = 'classic',
) {
  const jokerSettings = normalizeJokerSettings(jokerSettingsOrRanks);
  const leftScore = evaluateTeenPattiHand(leftCards, jokerSettings, assumedWildCards, rankingMode);
  const rightScore = evaluateTeenPattiHand(rightCards, jokerSettings, assumedWildCards, rankingMode);
  const winner = jokerSettings.specialHandMode === 'kiss_miss'
    ? compareKissMissScores(leftScore, rightScore, rankingMode)
    : compareScoresForMode(leftScore, rightScore, rankingMode);

  return {
    leftScore,
    rightScore,
    winner,
  };
}
