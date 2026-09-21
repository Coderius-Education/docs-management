export interface Recovery {
  content: string;
  baseSha: string | null;
  updatedAt: number;
}
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function recoveryKey(
  user: string,
  site: string,
  branch: string,
  path: string,
) {
  return `docs-draft:${JSON.stringify([user, site, branch, path])}`;
}
export function readRecovery(storage: Storage, key: string): Recovery | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.content === 'string' &&
      (parsed.baseSha === null || typeof parsed.baseSha === 'string') &&
      typeof parsed.updatedAt === 'number'
      ? parsed
      : null;
  } catch {
    return null;
  }
}
export function writeRecovery(
  storage: Storage,
  key: string,
  content: string,
  baseSha: string | null,
) {
  storage.setItem(
    key,
    JSON.stringify({ content, baseSha, updatedAt: Date.now() }),
  );
}
export function clearRecovery(
  storage: Storage,
  key: string,
  savedContent: string,
) {
  if (readRecovery(storage, key)?.content === savedContent)
    storage.removeItem(key);
}
