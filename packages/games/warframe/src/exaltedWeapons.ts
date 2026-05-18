import { normalizeDisplayName, stripPrimeSuffix } from './displayName.js';

const EXALTED_WEAPON_NAMES = new Set<string>([
  'Artemis Bow',
  'Artemis Bow Prime',
  'Neutralizer',
  'Balefire Charger',
  'Balefire Charger Prime',
  'Dex Pixia',
  'Dex Pixia Prime',
  'Glory',
  'Noctua',
  'Regulators',
  'Regulators Prime',
  'Desert Wind',
  'Desert Wind Prime',
  'Diwata',
  'Diwata Prime',
  'Exalted Blade',
  'Exalted Prime Blade',
  'Exalted Umbra Blade',
  'Garuda Talons',
  'Garuda Prime Talons',
  'Iron Staff',
  'Iron Staff Prime',
  'Shadow Claws',
  'Shadow Claws Prime',
  'Valkyr Talons',
  'Valkyr Prime Talons',
  'Shadow Clones',
  'Shadow Clones Prime',
  'Landslide Fists',
  'Landslide Fists Prime',
  'Shattered Lash',
  'Shattered Lash Prime',
  'Whipclaw',
  'Whipclaw Prime',
]);

const WEAPON_WORKSHEETS = new Set([
  'Primary Weapons',
  'Secondary Weapons',
  'Melee Weapons',
  'Modular Weapons',
  'Companion Weapons',
  'Archwing Weapons',
]);

export function isExaltedWeaponItem(itemName: string): boolean {
  const normalized = normalizeDisplayName(itemName);
  return EXALTED_WEAPON_NAMES.has(normalized);
}

export function isExaltedWeaponWorksheet(worksheetName: string): boolean {
  return WEAPON_WORKSHEETS.has(worksheetName);
}

export function shouldAutoCompleteOrokin(worksheetName: string, itemName: string): boolean {
  if (!isExaltedWeaponWorksheet(worksheetName)) return false;
  const normalized = normalizeDisplayName(itemName);
  if (EXALTED_WEAPON_NAMES.has(normalized)) return true;
  return EXALTED_WEAPON_NAMES.has(stripPrimeSuffix(normalized));
}
