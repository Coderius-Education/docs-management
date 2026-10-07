import { useLocalStorage } from '@mantine/hooks';
import { useCallback } from 'react';

import { parseClosed } from './subjectGroups';

/** Remembered open/closed state of the Vak folders; Vakken are open unless closed. */
export function useClosedSubjects(storageKey: string) {
  const [closed, setClosed] = useLocalStorage<string[]>({
    key: storageKey,
    defaultValue: [],
    getInitialValueInEffect: false,
    deserialize: parseClosed,
  });

  const isOpen = useCallback((key: string) => !closed.includes(key), [closed]);

  const toggle = useCallback(
    (key: string) =>
      setClosed((current) =>
        current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
      ),
    [setClosed],
  );

  const setAll = useCallback(
    (keys: string[], open: boolean) =>
      setClosed((current) =>
        open
          ? current.filter((k) => !keys.includes(k))
          : [...new Set([...current, ...keys])],
      ),
    [setClosed],
  );

  return { isOpen, toggle, setAll };
}
