import { createTwoFilesPatch } from 'diff';
import { expect, it } from 'vitest';

import { diffStats } from './diffStats';

it('counts changed lines without the file headers', () => {
  const patch = createTwoFilesPatch('a.md', 'a.md', 'een\ntwee\n', 'een\ndrie\nvier\n', 'voor', 'na');
  expect(diffStats(patch)).toEqual({ added: 2, removed: 1 });
});

it('adds up several files', () => {
  const patch = [
    createTwoFilesPatch('a.md', 'a.md', 'x\n', 'y\n'),
    createTwoFilesPatch('b.md', 'b.md', '', 'nieuw\n'),
  ].join('\n');
  expect(diffStats(patch)).toEqual({ added: 2, removed: 1 });
});

it('returns zero for an empty patch', () => {
  expect(diffStats('')).toEqual({ added: 0, removed: 0 });
});
