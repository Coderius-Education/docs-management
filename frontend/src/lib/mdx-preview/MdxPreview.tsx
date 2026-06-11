import { Alert, Code, Paper, Text } from '@mantine/core';
import { evaluate } from '@mdx-js/mdx';
import { Component, type ReactNode, useEffect, useState } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';

import { remarkAdmonitions } from './remarkAdmonitions';

// Stubs voor site-componenten (TryButton e.d.): tonen een herkenbare kaart,
// maar voeren niets uit. De echte weergave zie je op de branch-preview.
function makeStub(name: string) {
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

const stubCache = new Map<string, ReturnType<typeof makeStub>>();

const componentProxy = new Proxy(
  {},
  {
    get(_target, name: string) {
      if (typeof name !== 'string' || !/^[A-Z]/.test(name)) return undefined;
      if (!stubCache.has(name)) stubCache.set(name, makeStub(name));
      return stubCache.get(name);
    },
  },
);

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

/** Verwijdert import/export-regels: stubs komen uit de componentProxy. */
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
          setContent(<MDXContent components={componentProxy} />);
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
