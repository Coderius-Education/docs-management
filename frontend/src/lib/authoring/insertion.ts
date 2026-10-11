import { replaceRange, type Range } from './document';

/** Waar de cursor een tekstblok doorsnijdt, zoals de WYSIWYG-editor het teruggeeft. */
export type Cut =
  | { position: 'start' }
  | { position: 'end' }
  | { position: 'middle'; before: string; after: string };

/**
 * Invoegplek in de bron. `splice` herschrijft eerst het doorgesneden tekstblok
 * (voor + na); daarna komt het nieuwe blok op `at` in die herschreven bron.
 */
export interface InsertionPoint {
  at: number;
  splice?: Range & { text: string };
}

export function pointForCut(block: Range, cut: Cut | null): InsertionPoint {
  if (cut?.position === 'start') return { at: block.from };
  if (cut?.position !== 'middle') return { at: block.to };
  const before = cut.before.trim();
  const after = cut.after.trim();
  return {
    at: block.from + before.length,
    splice: { from: block.from, to: block.to, text: before + after },
  };
}

/** Verschuift een invoegplek uit een geneste editor naar de bron eromheen. */
export function shiftPoint(point: InsertionPoint, offset: number): InsertionPoint {
  return {
    at: point.at + offset,
    ...(point.splice && {
      splice: {
        ...point.splice,
        from: point.splice.from + offset,
        to: point.splice.to + offset,
      },
    }),
  };
}

export function applySplice(source: string, point: InsertionPoint): string {
  return point.splice
    ? replaceRange(source, point.splice, point.splice.text)
    : source;
}

export function insertAt(
  source: string,
  point: InsertionPoint,
  text: string,
): string {
  return replaceRange(
    applySplice(source, point),
    { from: point.at, to: point.at },
    `\n\n${text}\n\n`,
  );
}
