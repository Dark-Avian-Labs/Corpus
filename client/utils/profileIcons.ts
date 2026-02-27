const PROFILE_ICON_MODULES = import.meta.glob('../assets/profile-icons/*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const PROFILE_ICON_BY_ID: Record<number, string> = {};

for (const [path, src] of Object.entries(PROFILE_ICON_MODULES)) {
  const match = path.match(/\/(\d+)\.png$/);
  if (!match) continue;
  const id = Number(match[1]);
  if (Number.isInteger(id) && id >= 1 && id <= 16) {
    PROFILE_ICON_BY_ID[id] = src;
  }
}

export function normalizeAvatarId(value: unknown): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 16) {
    return parsed;
  }
  return 1;
}

export function getProfileIconSrc(value: unknown): string {
  const avatarId = normalizeAvatarId(value);
  return PROFILE_ICON_BY_ID[avatarId] ?? PROFILE_ICON_BY_ID[1] ?? '';
}
