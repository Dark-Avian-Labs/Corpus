import path from 'path';

const dataDir = process.env.DATA_DIR ?? './data';
export const EPIC7_DB_PATH = path.resolve(
  process.env.EPIC7_DB_PATH ?? path.join(dataDir, 'epic7.db'),
);

export const HERO_CLASSES = [
  'warrior',
  'knight',
  'thief',
  'ranger',
  'mage',
  'soulweaver',
] as const;
export type HeroClassKey = (typeof HERO_CLASSES)[number];
export const ARTIFACT_CLASSES = [...HERO_CLASSES, 'universal'] as const;
export const ELEMENTS = ['fire', 'ice', 'earth', 'light', 'dark'] as const;

export type ClassKey = (typeof ARTIFACT_CLASSES)[number];
export type ElementKey = (typeof ELEMENTS)[number];
export const HERO_RATINGS = [
  '-',
  'D',
  'C',
  'B',
  'A',
  'S',
  'SS',
  'SSS',
] as const;
export const ARTIFACT_GAUGE_MAX = 5;
export const ARTIFACT_GAUGE_FILLED = '▰';
export const ARTIFACT_GAUGE_EMPTY = '▱';
export const STAR_RATINGS = [3, 4, 5] as const;

export const CLASS_DISPLAY_NAMES: Record<HeroClassKey | 'universal', string> = {
  knight: 'Knight',
  warrior: 'Warrior',
  thief: 'Thief',
  ranger: 'Ranger',
  mage: 'Mage',
  soulweaver: 'Soul Weaver',
  universal: 'Universal',
};

export const ELEMENT_DISPLAY_NAMES: Record<ElementKey, string> = {
  fire: 'Fire',
  ice: 'Ice',
  earth: 'Earth',
  light: 'Light',
  dark: 'Dark',
};

export const RATING_COLORS: Record<string, string> = {
  '-': '#6b7280',
  D: '#06b6d4',
  C: '#22c55e',
  B: '#3b82f6',
  A: '#a855f7',
  S: '#eab308',
  SS: '#f97316',
  SSS: '#ef4444',
};

export const GAUGE_COLORS: Record<number, string> = {
  0: '#6b7280',
  1: '#3b82f6',
  2: '#22c55e',
  3: '#eab308',
  4: '#f97316',
  5: '#ef4444',
};
