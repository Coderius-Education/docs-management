import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import './WysiwygEditor.css';

import { Crepe } from '@milkdown/crepe';
import { useEffect, useRef } from 'react';

/**
 * Milkdown Crepe WYSIWYG. Werkt op gewone Markdown; pagina's met MDX-constructies
 * (imports/JSX) openen in raw-modus (zie EditorPage).
 *
 * `onChange` levert de actuele markdown bij elke wijziging; de bron van waarheid
 * blijft de raw tekst in EditorPage.
 */
export function WysiwygEditor({
  initialValue,
  onChange,
}: {
  initialValue: string;
  onChange: (markdown: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const crepe = new Crepe({
      root: containerRef.current,
      defaultValue: initialValue,
    });
    crepe.on((listener) => {
      listener.markdownUpdated(() => {
        onChange(crepe.getMarkdown());
      });
    });
    crepe.create();
    crepeRef.current = crepe;
    return () => {
      crepe.destroy();
      crepeRef.current = null;
    };
    // Bewust alleen bij mount: re-init op elke toetsaanslag zou de cursor slopen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} style={{ height: '100%', overflow: 'auto' }} />;
}
