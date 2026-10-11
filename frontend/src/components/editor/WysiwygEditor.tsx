import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import './WysiwygEditor.css';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { serializerCtx, editorViewCtx } from '@milkdown/kit/core';
import { Plugin } from '@milkdown/kit/prose/state';
import { uploadConfig } from '@milkdown/kit/plugin/upload';
import { imageSchema, linkSchema } from '@milkdown/kit/preset/commonmark';
import type { Ctx } from '@milkdown/kit/ctx';
import { resolveAsset, type AssetContext } from '../../lib/authoring/assets';
import type { Cut } from '../../lib/authoring/insertion';
import type { RequestSiteLink } from './SiteLinkPicker';
import { $prose, $view, insert, replaceAll } from '@milkdown/kit/utils';
import { Alert, Loader } from '@mantine/core';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

const SITE_LINK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img"><title>Link naar pagina</title><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M10 13.5l1.5 1.5l3-3"/></svg>';

export interface MarkdownHandle {
  insert: (text: string) => void;
  /** Waar de (laatste) cursor dit tekstblok doorsnijdt; null zolang de editor laadt. */
  cutAtCursor: () => Cut | null;
}
export const WysiwygEditor = forwardRef<
  MarkdownHandle,
  {
    value: string;
    onChange: (markdown: string) => void;
    assetContext?: AssetContext;
    /** Zet de knop 'Link naar pagina' in de selectiewerkbalk. */
    onSiteLink?: RequestSiteLink;
  }
>(function WysiwygEditor({ value, onChange, assetContext = {}, onSiteLink }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<Crepe | null>(null);
  const latest = useRef({ value, onChange, onSiteLink });
  latest.current = { value, onChange, onSiteLink };
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
      cutAtCursor() {
        if (!instance.current) return null;
        return instance.current.editor.action((ctx) => {
          // ProseMirror bewaart de selectie na blur: dit is de cursor van vóór
          // de klik op 'Blok toevoegen'.
          const { state } = ctx.get(editorViewCtx);
          const $pos = state.doc.resolve(state.selection.to);
          let tr = state.tr;
          let cut: number;
          if ($pos.depth === 0) cut = $pos.pos;
          else if (
            $pos.depth === 1 &&
            $pos.parent.type.name === 'paragraph' &&
            $pos.parentOffset > 0 &&
            $pos.parentOffset < $pos.parent.content.size
          ) {
            // Spaties rond de cursor horen bij geen van beide helften.
            const start = $pos.start(1);
            const end = $pos.end(1);
            let from = $pos.pos;
            let to = $pos.pos;
            while (from > start && /\s/.test(state.doc.textBetween(from - 1, from)))
              from--;
            while (to < end && /\s/.test(state.doc.textBetween(to, to + 1))) to++;
            tr = tr.delete(from, to).split(from);
            cut = tr.doc.resolve(tr.mapping.map(from)).before(1);
          } else if ($pos.depth === 1 && $pos.parentOffset === 0)
            cut = $pos.before(1);
          // In lijsten, tabellen en code nooit splitsen: erna invoegen.
          else cut = $pos.after(1);
          if (cut === 0) return { position: 'start' };
          if (cut === tr.doc.content.size) return { position: 'end' };
          const marker = `coderiusinvoegpunt${Math.random().toString(16).slice(2)}`;
          const { schema } = state;
          tr.insert(cut, schema.nodes.paragraph.create(null, schema.text(marker)));
          // Niet dispatchen: geen flikkering en geen stap in de undo-geschiedenis.
          const markdown = ctx.get(serializerCtx)(tr.doc);
          const at = markdown.indexOf(marker);
          if (at < 0) return { position: 'end' };
          return {
            position: 'middle',
            before: markdown.slice(0, at),
            after: markdown.slice(at + marker.length),
          };
        });
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
      featureConfigs: latest.current.onSiteLink
        ? {
            [CrepeFeature.Toolbar]: {
              buildToolbar: (builder) =>
                builder.addGroup('coderius', 'Koppelen').addItem('site-link', {
                  icon: SITE_LINK_ICON,
                  active: () => false,
                  onRun: (ctx) => requestSiteLink(ctx),
                }),
            },
          }
        : undefined,
    });
    /** Opent de paginakiezer en zet de gekozen site:-link op de selectie. */
    function requestSiteLink(ctx: Ctx) {
      const request = latest.current.onSiteLink;
      const { state } = ctx.get(editorViewCtx);
      const { from, to, empty, $from, $to } = state.selection;
      if (!request || empty || !$from.sameParent($to)) return;
      const linkType = linkSchema.type(ctx);
      let href: string | undefined;
      state.doc.nodesBetween(from, to, (node) => {
        href ??= linkType.isInSet(node.marks)?.attrs.href;
      });
      const doc = state.doc;
      void request({ text: state.doc.textBetween(from, to), href }).then((url) => {
        if (!url || disposed) return;
        crepe.editor.action((next) => {
          const view = next.get(editorViewCtx);
          // Intussen getypt: de onthouden selectie klopt niet meer.
          if (view.state.doc !== doc) return;
          view.dispatch(
            view.state.tr
              .removeMark(from, to, linkType)
              .addMark(from, to, linkType.create({ href: url })),
          );
          view.focus();
        });
      });
    }
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
