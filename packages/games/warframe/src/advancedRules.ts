import { shouldAutoCompleteOrokin } from './exaltedWeapons.js';

const NECRAMECH_NAMES = new Set(['Bonewidow', 'Voidrig']);
const MAX_RANK_40_EXACT_NAMES = new Set(['Paracesis']);
const WEAPON_WORKSHEETS = new Set([
  'Primary Weapons',
  'Secondary Weapons',
  'Melee Weapons',
  'Modular Weapons',
  'Companion Weapons',
  'Archwing Weapons',
]);
const EXILUS_WORKSHEETS = new Set([
  'Warframes',
  'Primary Weapons',
  'Secondary Weapons',
  'Melee Weapons',
  'Modular Weapons',
  'Archwing Weapons',
]);
const ARCANE_EXCLUDED_WORKSHEETS = new Set(['Companions', 'Companion Weapons', 'K-Drives']);

export function isPrimeItem(itemName: string): boolean {
  return /\bprime\b/i.test(itemName);
}

export function isPrimeWarframeOrWeapon(worksheetName: string, itemName: string): boolean {
  if (!isPrimeItem(itemName)) return false;
  return worksheetName === 'Warframes' || WEAPON_WORKSHEETS.has(worksheetName);
}

export function isValenceRelevant(itemName: string): boolean {
  return /^(kuva|tenet|coda)\b/i.test(itemName.trim());
}

export function isNecramechItem(itemName: string): boolean {
  return NECRAMECH_NAMES.has(itemName.trim());
}

export const ABSOLUTE_MAX_ADVANCED_LEVEL = 40;

export function maxLevelForRow(worksheetName: string, itemName: string): number {
  if (isValenceRelevant(itemName)) return 40;
  if (MAX_RANK_40_EXACT_NAMES.has(itemName.trim())) return 40;
  if (worksheetName === 'Accessories' && isNecramechItem(itemName)) return 40;
  return 30;
}

export function isArcaneRelevant(worksheetName: string, itemName: string): boolean {
  if (ARCANE_EXCLUDED_WORKSHEETS.has(worksheetName)) return false;
  if (isNecramechItem(itemName)) return false;
  return true;
}

export function isExilusRelevant(worksheetName: string): boolean {
  return EXILUS_WORKSHEETS.has(worksheetName);
}

export type AdvancedRowRelevance = {
  maxLevel: number;
  valence: boolean;
  element: boolean;
  orokin: boolean;
  arcane: boolean;
  exilus: boolean;
  autoOrokin: boolean;
  autoArcane: boolean;
};

export function isElementRelevant(itemName: string): boolean {
  return isValenceRelevant(itemName);
}

export function resolveAdvancedRowRelevance(
  worksheetName: string,
  itemName: string,
): AdvancedRowRelevance {
  const autoArcane = worksheetName === 'Warframes';
  return {
    maxLevel: maxLevelForRow(worksheetName, itemName),
    valence: isValenceRelevant(itemName),
    element: isElementRelevant(itemName),
    orokin: true,
    arcane: isArcaneRelevant(worksheetName, itemName),
    exilus: isExilusRelevant(worksheetName),
    autoOrokin: shouldAutoCompleteOrokin(worksheetName, itemName),
    autoArcane,
  };
}
