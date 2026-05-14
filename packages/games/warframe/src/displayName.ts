export function stripArchwingTag(value: string): string {
  return value.replace(/^<[^>]+>\s*/i, '');
}

export function stripKnownModeQualifier(value: string): string {
  return value.replace(
    /\s*\((primary|secondary|dual(?:\s+\w+)?|heavy(?:\s+\w+)?|archgun|archmelee|rifle|shotgun|sniper|bow|pistol|sword|blade|scythe|staff|hammer|nikana|tonfa|whip|glaive)\)\s*$/i,
    '',
  );
}

const PAREN_PRIME_SUFFIX = '(prime)';

export function stripPrimeSuffix(value: string): string {
  let s = value.trimEnd();
  const lower = s.toLowerCase();
  if (lower.endsWith(PAREN_PRIME_SUFFIX)) {
    return s.slice(0, s.length - PAREN_PRIME_SUFFIX.length).trimEnd();
  }
  if (lower.endsWith('prime')) {
    const pIdx = s.length - 'prime'.length;
    if (pIdx <= 0) return s;
    let j = pIdx;
    while (j > 0 && /\s/u.test(s[j - 1])) j -= 1;
    if (j < pIdx) {
      return s.slice(0, j).trimEnd();
    }
  }
  return s;
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
  const n = normalizeDisplayName(value);
  let s = n.trimEnd();
  const lower = s.toLowerCase();
  if (lower.endsWith(PAREN_PRIME_SUFFIX)) return true;
  if (!lower.endsWith('prime')) return false;
  const pIdx = s.length - 'prime'.length;
  if (pIdx <= 0) return false;
  let j = pIdx;
  while (j > 0 && /\s/u.test(s[j - 1])) j -= 1;
  return j < pIdx;
}

export function resolveCanonicalKey(value: string, aliases?: ReadonlyMap<string, string>): string {
  const key = stripPrimeSuffix(normalizeNameForKey(value));
  return aliases?.get(key) ?? key;
}
