export function stripArchwingTag(value: string): string {
  return value.replace(/^<[^>]+>\s*/i, '');
}

export function stripKnownModeQualifier(value: string): string {
  return value.replace(
    /\s*\((primary|secondary|dual(?:\s+\w+)?|heavy(?:\s+\w+)?|archgun|archmelee|rifle|shotgun|sniper|bow|pistol|sword|blade|scythe|staff|hammer|nikana|tonfa|whip|glaive)\)\s*$/i,
    '',
  );
}

export function stripPrimeSuffix(value: string): string {
  return value.replace(/\s+prime$/i, '');
}

export function normalizeDisplayName(value: string): string {
  const normalized = value.normalize('NFKC').trim();
  const withoutArchwingTag = stripArchwingTag(normalized);
  const withoutQualifier = stripKnownModeQualifier(withoutArchwingTag);
  return withoutQualifier.trim();
}

export function normalizeNameForKey(value: string): string {
  return normalizeDisplayName(value).toLowerCase();
}

export function isPrimeVariantName(value: string): boolean {
  return /\s+prime$/i.test(normalizeDisplayName(value));
}

export function resolveCanonicalKey(
  value: string,
  aliases?: ReadonlyMap<string, string>,
): string {
  const key = stripPrimeSuffix(normalizeNameForKey(value));
  return aliases?.get(key) ?? key;
}
