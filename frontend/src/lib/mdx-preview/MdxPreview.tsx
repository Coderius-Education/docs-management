import { Alert, Code, Paper, Text } from '@mantine/core';
import { evaluate } from '@mdx-js/mdx';
import { Component, type ReactNode, useEffect, useState } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';

import { remarkAdmonitions } from './remarkAdmonitions';

type PreviewComponent = (props: Record<string, unknown>) => ReactNode;

// Real preview implementations for known site components.
const KNOWN_COMPONENTS: Record<string, PreviewComponent> = {
  // @docusaurus/BrowserOnly: calls children() since we're always in a browser.
  BrowserOnly: ({ children, fallback }) => {
    if (typeof children === 'function') {
      return (children as () => ReactNode)();
    }
    return (children as ReactNode) ?? (fallback as ReactNode) ?? null;
  },

  // play-docs / python-docs: CodeRunner button.
  TryButton: () => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: '#228be6',
        color: '#fff',
        borderRadius: 4,
        padding: '3px 10px',
        fontSize: 13,
        marginBlock: 6,
        cursor: 'default',
        userSelect: 'none',
      }}
    >
      ▶ Probeer in browser
    </span>
  ),

  // DVWA-docs: simulated Linux terminal.
  LinuxTerminal: () => (
    <div
      style={{
        background: '#1e1e2e',
        color: '#a6e3a1',
        fontFamily: 'monospace',
        fontSize: 13,
        padding: '10px 14px',
        borderRadius: 6,
        marginBlock: 8,
        minHeight: 80,
        lineHeight: 1.6,
      }}
    >
      <span style={{ color: '#89b4fa' }}>user@linux</span>
      <span style={{ color: '#cdd6f4' }}>:~$ </span>
      <span style={{ color: '#6c7086', fontSize: 12 }}>
        [Interactieve terminal — zichtbaar op de gepubliceerde site]
      </span>
    </div>
  ),
};

// Auto-generated stubs for any other PascalCase component.
function makeStub(name: string): PreviewComponent {
  return function Stub(props: Record<string, unknown>) {
    return (
      <Paper withBorder p="xs" my="xs" bg="gray.0">
        <Text size="xs" c="dimmed" ff="monospace">
          &lt;{name}
          {Object.keys(props)
            .filter((k) => k !== 'children')
            .map((k) => ` ${k}=…`)
            .join('')}
          {' />'}
        </Text>
        {props.children as ReactNode}
      </Paper>
    );
  };
}

const stubCache = new Map<string, PreviewComponent>();

/** Builds an explicit components map for all PascalCase JSX tags found in the source. */
function buildComponentStubs(body: string): Record<string, PreviewComponent> {
  const result: Record<string, PreviewComponent> = {};
  for (const [, name] of body.matchAll(/<([A-Z][a-zA-Z0-9]*)/g)) {
    if (name in KNOWN_COMPONENTS) {
      result[name] = KNOWN_COMPONENTS[name];
    } else {
      if (!stubCache.has(name)) stubCache.set(name, makeStub(name));
      result[name] = stubCache.get(name)!;
    }
  }
  return result;
}

class PreviewBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { children: ReactNode }) {
    if (prev.children !== this.props.children && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <Alert color="orange" title="Preview kon niet renderen">
          <Code block>{String(this.state.error)}</Code>
        </Alert>
      );
    }
    return this.props.children;
  }
}

/** Verwijdert import/export-regels: componenten komen uit buildComponentStubs. */
function stripEsm(body: string): string {
  return body.replace(/^(import|export)\s.*$/gm, '');
}

export function MdxPreview({ body }: { body: string }) {
  const [content, setContent] = useState<ReactNode>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { default: MDXContent } = await evaluate(stripEsm(body), {
          ...jsxRuntime,
          remarkPlugins: [remarkGfm, remarkDirective, remarkAdmonitions],
        });
        if (!cancelled) {
          setContent(<MDXContent components={buildComponentStubs(body)} />);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [body]);

  return (
    <div className="mdx-preview">
      {error && (
        <Alert color="orange" mb="xs" title="MDX-fout">
          <Code block>{error}</Code>
        </Alert>
      )}
      <PreviewBoundary>{content}</PreviewBoundary>
    </div>
  );
}
