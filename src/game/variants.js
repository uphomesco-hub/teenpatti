const PRESETS = [
  {
    id: 'classic',
    name: 'Classic',
    summary: 'Standard 3-card Teen Patti with blind, seen, show, and side show.',
    config: {
      bootAmount: 10,
      startingChips: 1000,
      cardsDealt: 3,
      cardsToKeep: 3,
      assumedWildCards: 0,
      jokerRanks: [],
      sideShowEnabled: true,
      showEnabled: true,
    },
  },
  {
    id: 'ak47',
    name: 'AK47',
    summary: 'A, K, 4, and 7 become jokers.',
    config: {
      bootAmount: 10,
      startingChips: 1000,
      cardsDealt: 3,
      cardsToKeep: 3,
      assumedWildCards: 0,
      jokerRanks: [14, 13, 4, 7],
      sideShowEnabled: true,
      showEnabled: true,
      handRankingMode: 'classic',
    },
  },
  {
    id: 'muflis',
    name: 'Muflis',
    summary: 'Lowball Teen Patti. Weakest normal hand wins instead of the strongest.',
    config: {
      bootAmount: 10,
      startingChips: 1000,
      cardsDealt: 3,
      cardsToKeep: 3,
      assumedWildCards: 0,
      jokerRanks: [],
      sideShowEnabled: true,
      showEnabled: true,
      handRankingMode: 'muflis',
    },
  },
  {
    id: 'pick4',
    name: 'Pick 4 Keep 3',
    summary: 'Deal 4 cards, discard 1, play the best 3.',
    config: {
      bootAmount: 20,
      startingChips: 1500,
      cardsDealt: 4,
      cardsToKeep: 3,
      assumedWildCards: 0,
      jokerRanks: [],
      sideShowEnabled: true,
      showEnabled: true,
      handRankingMode: 'classic',
    },
  },
  {
    id: 'deal4-keep2-assume1',
    name: 'Deal 4 Keep 2 Assume 1',
    summary: 'Deal 4 cards, keep 2 actual cards, and assume 1 best-fit wildcard.',
    config: {
      bootAmount: 20,
      startingChips: 1500,
      cardsDealt: 4,
      cardsToKeep: 2,
      assumedWildCards: 1,
      jokerRanks: [],
      sideShowEnabled: true,
      showEnabled: true,
      handRankingMode: 'classic',
    },
  },
];

export const DEFAULT_CONFIG = {
  tableName: 'Teen Patti Table',
  bootAmount: 10,
  startingChips: 1000,
  cardsDealt: 3,
  cardsToKeep: 3,
  assumedWildCards: 0,
  jokerRanks: [],
  sideShowEnabled: true,
  showEnabled: true,
  handRankingMode: 'classic',
  minPlayers: 2,
  maxPlayers: 10,
};

export const RANK_OPTIONS = [
  { value: 14, label: 'A' },
  { value: 13, label: 'K' },
  { value: 12, label: 'Q' },
  { value: 11, label: 'J' },
  { value: 10, label: '10' },
  { value: 9, label: '9' },
  { value: 8, label: '8' },
  { value: 7, label: '7' },
  { value: 6, label: '6' },
  { value: 5, label: '5' },
  { value: 4, label: '4' },
  { value: 3, label: '3' },
  { value: 2, label: '2' },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getPresetList() {
  return PRESETS;
}

export function getPresetById(presetId) {
  return PRESETS.find((preset) => preset.id === presetId) || PRESETS[0];
}

export function buildConfigFromPreset(presetId) {
  const preset = getPresetById(presetId);
  return normalizeConfig({
    ...DEFAULT_CONFIG,
    ...preset.config,
  });
}

export function normalizeConfig(input = {}) {
  const finalHandSize = 3;
  const requestedCardsDealt = clamp(Number(input.cardsDealt || DEFAULT_CONFIG.cardsDealt), 1, 10);
  const cardsToKeep = clamp(
    Number(input.cardsToKeep || DEFAULT_CONFIG.cardsToKeep),
    1,
    Math.min(finalHandSize, requestedCardsDealt),
  );
  const assumedWildCards = clamp(
    Number(input.assumedWildCards ?? finalHandSize - cardsToKeep),
    0,
    finalHandSize - cardsToKeep,
  );
  const cardsDealt = requestedCardsDealt;
  const jokerRanks = Array.from(
    new Set(
      (input.jokerRanks || [])
        .map((rank) => Number(rank))
        .filter((rank) => Number.isInteger(rank) && rank >= 2 && rank <= 14),
    ),
  ).sort((left, right) => right - left);

  return {
    tableName: String(input.tableName || DEFAULT_CONFIG.tableName).slice(0, 48) || DEFAULT_CONFIG.tableName,
    bootAmount: clamp(Number(input.bootAmount || DEFAULT_CONFIG.bootAmount), 1, 100000),
    startingChips: clamp(Number(input.startingChips || DEFAULT_CONFIG.startingChips), 10, 1000000),
    cardsDealt,
    cardsToKeep,
    assumedWildCards,
    jokerRanks,
    sideShowEnabled: true,
    showEnabled: true,
    handRankingMode: input.handRankingMode === 'muflis' ? 'muflis' : 'classic',
    minPlayers: DEFAULT_CONFIG.minPlayers,
    maxPlayers: DEFAULT_CONFIG.maxPlayers,
  };
}

export function formatRank(rank) {
  const found = RANK_OPTIONS.find((entry) => entry.value === rank);
  return found ? found.label : String(rank);
}

export function formatJokerRanks(ranks) {
  if (!ranks?.length) {
    return 'None';
  }

  return ranks.map((rank) => formatRank(rank)).join(', ');
}
