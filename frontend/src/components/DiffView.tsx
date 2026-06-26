import { ScrollArea } from '@mantine/core';

// Rendert een unified-diff (zoals GitHub's `patch` of jsdiff's createTwoFilesPatch)
// met regelkleuring. Theme-bewust via Mantine's color-variabelen (werkt in dark mode).
function lineStyle(line: string): React.CSSProperties {
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return { backgroundColor: 'var(--mantine-color-green-light)' };
  }
  if (line.startsWith('-') && !line.startsWith('---')) {
    return { backgroundColor: 'var(--mantine-color-red-light)' };
  }
  if (line.startsWith('@@')) {
    return {
      backgroundColor: 'var(--mantine-color-blue-light)',
      color: 'var(--mantine-color-dimmed)',
    };
  }
  return {};
}

export function DiffView({ patch, maxHeight = 360 }: { patch: string; maxHeight?: number }) {
  const lines = patch.replace(/\n$/, '').split('\n');
  return (
    <ScrollArea.Autosize mah={maxHeight} type="auto">
      <pre
        style={{
          margin: 0,
          fontSize: 12,
          fontFamily: 'var(--mantine-font-family-monospace)',
          lineHeight: 1.5,
        }}
      >
        {lines.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: diff-regels hebben geen stabiele id
          <div key={i} style={{ ...lineStyle(line), whiteSpace: 'pre-wrap', paddingInline: 4 }}>
            {line || ' '}
          </div>
        ))}
      </pre>
    </ScrollArea.Autosize>
  );
}
