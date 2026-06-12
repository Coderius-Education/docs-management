import { markdown } from '@codemirror/lang-markdown';
import { useComputedColorScheme } from '@mantine/core';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { forwardRef } from 'react';

export const RawEditor = forwardRef<
  ReactCodeMirrorRef,
  { value: string; onChange: (value: string) => void }
>(function RawEditor({ value, onChange }, ref) {
  const colorScheme = useComputedColorScheme('light');
  return (
    <CodeMirror
      ref={ref}
      value={value}
      onChange={onChange}
      extensions={[markdown()]}
      theme={colorScheme}
      height="100%"
      style={{ height: '100%', fontSize: 13 }}
    />
  );
});

export type { ReactCodeMirrorRef };
