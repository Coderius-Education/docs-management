import { describe, expect, it } from 'vitest';

import type { ConflictSegment } from '../api/git';
import { applyChoices, checkLabel } from './concepts';

const segments: ConflictSegment[] = [
  { type: 'text', text: 'Intro.\n' },
  { type: 'conflict', id: '0', base: 'Uitleg.\n', ours: 'Mijn.\n', theirs: 'Hun.\n' },
  { type: 'text', text: 'Slot.\n' },
];

describe('applyChoices', () => {
  it('builds the text from the chosen blocks', () => {
    expect(applyChoices(segments, { '0': 'ours' })).toBe('Intro.\nMijn.\nSlot.\n');
    expect(applyChoices(segments, { '0': 'theirs' })).toBe('Intro.\nHun.\nSlot.\n');
    expect(applyChoices(segments, { '0': 'both' })).toBe('Intro.\nMijn.\nHun.\nSlot.\n');
    expect(applyChoices(segments, { '0': { custom: 'Samen.\n' } })).toBe(
      'Intro.\nSamen.\nSlot.\n',
    );
  });

  it('stays undefined while a block is undecided', () => {
    expect(applyChoices(segments, {})).toBeUndefined();
  });
});

it('gives CI jobs readable names', () => {
  expect(checkLabel('build')).toBe('Eindcontrole');
  expect(checkLabel('site (python)')).toBe('Cursus python bouwen');
  expect(checkLabel('onbekend')).toBe('onbekend');
});
