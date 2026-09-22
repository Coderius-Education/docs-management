import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import './WysiwygEditor.css';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { serializerCtx, editorViewCtx } from '@milkdown/kit/core';
import { Plugin } from '@milkdown/kit/prose/state';
import { uploadConfig } from '@milkdown/kit/plugin/upload';
import { imageSchema } from '@milkdown/kit/preset/commonmark';
import { resolveAsset, type AssetContext } from '../../lib/authoring/assets';
import { $prose, $view, insert, replaceAll } from '@milkdown/kit/utils';
import { Alert, Loader } from '@mantine/core';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

export interface MarkdownHandle {
  insert: (text: string) => void;
}
export const WysiwygEditor = forwardRef<
  MarkdownHandle,
  {
    value: string;
    onChange: (markdown: string) => void;
    assetContext?: AssetContext;
  }
>(function WysiwygEditor({ value, onChange, assetContext = {} }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<Crepe | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const received = useRef(value);
  const syncing = useRef(false);
  const assets = useRef(assetContext);
  assets.current = assetContext;
  const imageUpdates = useRef(new Set<() => void>());
  useEffect(() => {
    imageUpdates.current.forEach((update) => update());
  }, [
    assetContext.site,
    assetContext.domain,
    assetContext.path,
    assetContext.branch,
    assetContext.previewOrigin,
  ]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useImperativeHandle(
    ref,
    () => ({
      insert(text) {
        instance.current?.editor.action(insert(text));
        instance.current?.editor.action((ctx) =>
          ctx.get(editorViewCtx).focus(),
        );
      },
    }),
    [],
  );
  useEffect(() => {
    // Own the root, even if StrictMode unmounts before async create completes.
    const root = document.createElement('div');
    root.hidden = true;
    container.current?.appendChild(root);
    const initial = latest.current.value;
    let disposed = false;
    let created = false;
    const crepe = new Crepe({
      root,
      defaultValue: initial,
      features: {
        [CrepeFeature.ImageBlock]: false,
        [CrepeFeature.Latex]: false,
      },
    });
    crepe.editor.config((ctx) =>
      ctx.update(uploadConfig.key, (prev) => ({
        ...prev,
        uploader: async () => [],
      })),
    );
    crepe.editor.use(
      $view(imageSchema.node, () => (node) => {
        const dom = document.createElement('span');
        const img = document.createElement('img');
        let currentNode = node;
        const update = () => {
          const source = resolveAsset(
            String(currentNode.attrs.src ?? ''),
            assets.current,
          );
          if (source) {
            img.src = source;
            img.alt = String(currentNode.attrs.alt ?? '');
            img.style.maxWidth = '100%';
            dom.replaceChildren(img);
          } else
            dom.textContent = `Afbeelding: ${currentNode.attrs.alt || currentNode.attrs.src} — controleer in het cursusvoorbeeld`;
        };
        update();
        imageUpdates.current.add(update);
        return {
          dom,
          update(next) {
            if (next.type !== currentNode.type) return false;
            currentNode = next;
            update();
            return true;
          },
          destroy() {
            imageUpdates.current.delete(update);
          },
        };
      }),
    );
    crepe.editor.use(
      $prose(
        (ctx) =>
          new Plugin({
            view: () => ({
              update(view, previous) {
                if (
                  !created ||
                  disposed ||
                  syncing.current ||
                  view.state.doc.eq(previous.doc)
                )
                  return;
                // Synchronous updates: switching modes/saving immediately must keep the last keystroke.
                const markdown = ctx
                  .get(serializerCtx)(view.state.doc)
                  .replace(/\n+$/, '');
                received.current = markdown;
                latest.current.onChange(markdown);
              },
            }),
          }),
      ),
    );
    const creation = crepe
      .create()
      .then(() => {
        if (disposed) return;
        created = true;
        instance.current = crepe;
        received.current = initial;
        root.hidden = false;
        setReady(true);
      })
      .catch((err) => {
        if (!disposed) setError(String(err));
      });
    return () => {
      disposed = true;
      instance.current = null;
      root.remove();
      void creation.then(() => crepe.destroy()).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!instance.current || received.current === value) return;
    syncing.current = true;
    try {
      instance.current.editor.action(replaceAll(value));
      received.current = value;
    } finally {
      syncing.current = false;
    }
  }, [value, ready]);
  return (
    <div className="markdown-region">
      {!ready && !error && <Loader size="xs" aria-label="Editor laden" />}
      {error && (
        <Alert color="red" title="Editor kon niet laden">
          Open de broncode om verder te bewerken. {error}
        </Alert>
      )}
      <div ref={container} />
    </div>
  );
});
