import { expect, it } from 'vitest';

import { insertAt, pointForCut, shiftPoint } from './insertion';

const source = 'Intro.\n\nEerste zin. Tweede zin.\n\nSlot.';
const block = { from: 8, to: 31 };

it('inserts before or after the block when the cursor is at its edge', () => {
  expect(insertAt(source, pointForCut(block, { position: 'start' }), 'X')).toBe(
    'Intro.\n\n\n\nX\n\nEerste zin. Tweede zin.\n\nSlot.',
  );
  expect(insertAt(source, pointForCut(block, null), 'X')).toBe(
    'Intro.\n\nEerste zin. Tweede zin.\n\nX\n\n\n\nSlot.',
  );
});

it('splits the block at the cursor with one blank line on each side', () => {
  const point = pointForCut(block, {
    position: 'middle',
    before: 'Eerste zin.\n\n',
    after: '\n\nTweede zin.\n',
  });
  expect(insertAt(source, point, ':::tip\nTip\n:::')).toBe(
    'Intro.\n\nEerste zin.\n\n:::tip\nTip\n:::\n\nTweede zin.\n\nSlot.',
  );
});

it('shifts a nested insertion point into the outer source', () => {
  const nested = pointForCut(
    { from: 0, to: 5 },
    { position: 'middle', before: 'ab', after: 'cde' },
  );
  expect(shiftPoint(nested, 10)).toEqual({
    at: 12,
    splice: { from: 10, to: 15, text: 'abcde' },
  });
});
