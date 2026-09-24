import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { useComputedColorScheme } from '@mantine/core';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { forwardRef } from 'react';

export const RawEditor = forwardRef<
  ReactCodeMirrorRef,
  {
    value: string;
    onChange: (value: string) => void;
    language?: 'markdown' | 'json';
    /** A fixed height for editors inside panels, which have no height of their own. */
    height?: string;
  }
>(function RawEditor({ value, onChange, language = 'markdown', height }, ref) {
  const colorScheme = useComputedColorScheme('light');
  return (
    <CodeMirror
      ref={ref}
      value={value}
      onChange={onChange}
      extensions={[language === 'json' ? json() : markdown()]}
      theme={colorScheme}
      height={height ?? '100%'}
      style={{ height: height ?? '100%', fontSize: 13 }}
    />
  );
});

export type { ReactCodeMirrorRef };
