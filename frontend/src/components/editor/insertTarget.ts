import { createContext, type RefObject } from 'react';
import type { BlockKind } from './BlockMenu';

export interface InsertTarget {
  insertBlock: (kind: BlockKind) => void;
}

/**
 * Welke LessonEditor het 'Blok toevoegen'-menu in de werkbalk bedient: de
 * binnenste editor waar de cursor het laatst stond, anders de hoofdeditor.
 */
export interface InsertTargets {
  focus: (target: RefObject<InsertTarget>) => void;
  setDefault: (target: RefObject<InsertTarget>) => void;
  clear: (target: RefObject<InsertTarget>) => void;
  current: () => InsertTarget | null;
}

export function createInsertTargets(): InsertTargets {
  let focused: RefObject<InsertTarget> | null = null;
  let fallback: RefObject<InsertTarget> | null = null;
  return {
    focus(target) {
      focused = target;
    },
    setDefault(target) {
      fallback = target;
    },
    clear(target) {
      if (focused === target) focused = null;
      if (fallback === target) fallback = null;
    },
    current: () => (focused ?? fallback)?.current ?? null,
  };
}

export const InsertTargetContext = createContext<InsertTargets | null>(null);
