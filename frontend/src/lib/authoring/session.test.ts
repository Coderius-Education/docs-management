import { expect, it } from 'vitest';
import {
  recoveryKey,
  readRecovery,
  writeRecovery,
  clearRecovery,
} from './session';
import { newPageDetails } from './newPage';
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
}
it('separates recovery by user, site, branch and path, retaining newer unsaved changes', () => {
  const storage = memoryStorage();
  const key = recoveryKey('teacher', 'python', 'lesson', 'a.mdx');
  expect(key).not.toBe(recoveryKey('teacher', 'python', 'other', 'a.mdx'));
  expect(key).not.toBe(recoveryKey('another', 'python', 'lesson', 'a.mdx'));
  writeRecovery(storage, key, 'new text', 'sha');
  clearRecovery(storage, key, 'old text');
  expect(readRecovery(storage, key)?.content).toBe('new text');
  clearRecovery(storage, key, 'new text');
  expect(readRecovery(storage, key)).toBeNull();
});
it('ignores malformed persisted drafts', () => {
  const storage = memoryStorage();
  storage.setItem('key', '{bad');
  expect(readRecovery(storage, 'key')).toBeNull();
  storage.setItem('key', JSON.stringify({ content: 123 }));
  expect(readRecovery(storage, 'key')).toBeNull();
});
it('validates titles and finds collision-free page paths', () => {
  expect(newPageDetails('   ', '', []).error).toBeTruthy();
  expect(newPageDetails('!!!', '', []).error).toBeTruthy();
  const tree = [{ path: '01-les.mdx', type: 'blob' as const, sha: '1' }];
  expect(newPageDetails('Les', '', tree).path).toBe('02-les.mdx');
  expect(newPageDetails('Één les', 'hoofdstuk', []).path).toBe(
    'hoofdstuk/01-een-les.mdx',
  );
});
