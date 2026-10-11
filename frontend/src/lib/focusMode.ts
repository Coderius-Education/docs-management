import { createContext, useContext } from 'react';

/** Volledig scherm voor de editor: de app-kop en navigatie verdwijnen. */
export interface FocusMode {
  focus: boolean;
  setFocus: (focus: boolean) => void;
}

export const FocusModeContext = createContext<FocusMode>({
  focus: false,
  setFocus: () => {},
});

export const useFocusMode = () => useContext(FocusModeContext);
