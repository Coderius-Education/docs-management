import { Alert, Text } from '@mantine/core';
import {
  createElement,
  useDeferredValue,
  useMemo,
  type ReactNode,
} from 'react';
import { parseLesson } from '../authoring/document';
import { componentModel } from '../authoring/components';
import { attributes } from '../authoring/components';
import { resolveAsset, type AssetContext } from '../authoring/assets';
import { textContent, type LessonNode } from '../authoring/syntax';
import { CodePreview, HeadingPreview, TabsPreview } from './ContentPreview';
import { tabsModel } from '../authoring/content';
import { modelForNode, sectionBindings } from '../authoring/homepage';
import './MdxPreview.css';

export interface PreviewContext extends AssetContext {
  site?: string;
  title?: string;
  description?: string;
}
export function renderLesson(
  source: string,
  context: PreviewContext = {},
): ReactNode {
  const doc = parseLesson(source, context.site ?? '');
  if (doc.error)
    return <div role="alert">Voorbeeld niet beschikbaar: {doc.error}</div>;
  const homepageBindings = sectionBindings(source);
  const definitions = new Map(
    (doc.tree.children ?? [])
      .filter((n) => n.type === 'definition')
      .map((n) => [n.identifier, n]),
  );
  function render(node: LessonNode, key: number): ReactNode {
    const tabGroup = tabsModel(node,source,doc.imports);
    if (tabGroup) return <TabsPreview key={key} model={tabGroup} render={render}/>;
    const children = node.children?.map(render);
    const tag = (name: string, props: Record<string, unknown> = {}) =>
      createElement(name, { key, ...props }, children);
    switch (node.type) {
      case 'root':
        return <div key={key}>{children}</div>;
      case 'text':
        return node.value;
      case 'paragraph':
        return tag('p');
      case 'heading':
        return <HeadingPreview key={key} node={node} source={source} render={render}/>;
      case 'strong':
        return tag('strong');
      case 'emphasis':
        return tag('em');
      case 'delete':
        return tag('del');
      case 'blockquote':
        return tag('blockquote');
      case 'break':
        return <br key={key} />;
      case 'thematicBreak':
        return <hr key={key} />;
      case 'inlineCode':
        return <code key={key}>{node.value}</code>;
      case 'code':
        return <CodePreview key={key} node={node} source={source}/>;
      case 'list':
        return tag(
          node.ordered ? 'ol' : 'ul',
          node.ordered ? { start: node.start } : {},
        );
      case 'listItem':
        return (
          <li key={key}>
            {typeof node.checked === 'boolean' && (
              <input
                type="checkbox"
                checked={node.checked}
                readOnly
                aria-label="Case de liste"
              />
            )}
            {children}
          </li>
        );
      case 'table':
        return (
          <div className="preview-table" key={key}>
            <table>
              <tbody>{children}</tbody>
            </table>
          </div>
        );
      case 'tableRow':
        return tag('tr');
      case 'tableCell':
        return tag('td');
      case 'linkReference':
      case 'imageReference': {
        const definition = definitions.get(node.identifier);
        return definition ? (
          render(
            {
              ...node,
              type: node.type === 'linkReference' ? 'link' : 'image',
              url: definition.url,
            },
            key,
          )
        ) : (
          <span key={key}>{children ?? node.alt}</span>
        );
      }
      case 'link':
        return (
          <span key={key} className="preview-link" title={node.url}>
            {children}
          </span>
        );
      case 'image': {
        const src = resolveAsset(node.url ?? '', context);
        return src ? (
          <img
            key={key}
            src={src}
            alt={node.alt ?? ''}
            title={node.title}
            loading="lazy"
          />
        ) : (
          <span key={key} className="preview-placeholder">
            Afbeelding: {node.alt || node.url} — controleer in het
            cursusvoorbeeld
          </span>
        );
      }
      case 'definition':
      case 'mdxjsEsm':
        return null;
      case 'containerDirective': {
        const label = node.children?.find((n) => n.data?.directiveLabel);
        return (
          <aside key={key} className={`admonition admonition-${node.name}`}>
            <strong>{label ? textContent(label) : node.name}</strong>
            {node.children?.filter((n) => !n.data?.directiveLabel).map(render)}
          </aside>
        );
      }
      case 'mdxJsxFlowElement':
      case 'mdxJsxTextElement': {
        const section = modelForNode(node, homepageBindings, source);
        if (section) {
          const p = section.props;
          const heading = typeof p.title === 'string' ? p.title : undefined;
          const className = `homepage-preview-block homepage-${section.name.toLowerCase()} homepage-bg-${p.background ?? 'transparent'}`;
          const style = { textAlign: ['left','center','right'].includes(String(p.align)) ? p.align as 'left'|'center'|'right' : undefined };
          if (section.name === 'Divider') return <hr key={key}/>;
          if (section.name === 'Picture') {
            const src=resolveAsset(String(p.src??''),context);
            return <figure key={key}>{src?<img src={src} alt={String(p.alt??'')}/>:<span>Afbeelding: {String(p.src??'')}</span>}{p.caption&&<figcaption>{String(p.caption)}</figcaption>}</figure>;
          }
          if (section.name === 'Button') return <span key={key} className="homepage-preview-button">{children}</span>;
          if (section.name === 'Columns') return <div key={key} className={className} style={{display:'grid',gridTemplateColumns:`repeat(${Math.max(1,Math.min(4,Number(p.count)||3))},minmax(0,1fr))`,gap:16}}>{children}</div>;
          return <section key={key} className={className} style={style}>{heading && (section.name==='Hero'?<h1>{heading}</h1>:<h2>{heading}</h2>)}{(p.tagline||p.subtitle)&&<p>{String(p.tagline||p.subtitle)}</p>}{children}</section>;
        }

        const model = componentModel(node, context.site ?? '', doc.imports);
        if (model)
          return (
            <div key={key} className="preview-component">
              <strong>{model.label}</strong>
              <pre>
                {model.fields.code?.editable
                  ? String(model.fields.code.value)
                  : 'Code wordt bepaald door een expressie.'}
              </pre>
              <small>
                Configuratievoorbeeld · uitvoeren in het cursusvoorbeeld
              </small>
            </div>
          );
        const safeTags = [
          'details',
          'summary',
          'p',
          'strong',
          'em',
          'b',
          'i',
          'u',
          's',
          'sub',
          'sup',
          'kbd',
          'mark',
          'div',
          'span',
          'ul',
          'ol',
          'li',
          'table',
          'thead',
          'tbody',
          'tr',
          'td',
          'th',
        ];
        if (node.name && safeTags.includes(node.name)) return tag(node.name);
        if (node.name === 'br') return <br key={key} />;
        if (node.name === 'hr') return <hr key={key} />;
        if (node.name === 'img') {
          const attrs = attributes(node);
          const src = attrs.find((a) => a.name === 'src')?.value;
          const alt = attrs.find((a) => a.name === 'alt')?.value;
          return render(
            {
              type: 'image',
              url: typeof src === 'string' ? src : '',
              alt: typeof alt === 'string' ? alt : '',
            },
            key,
          );
        }
        return (
          <span key={key} className="preview-placeholder">
            {node.name ?? 'MDX-fragment'} · bekijk dit onderdeel in het
            cursusvoorbeeld
          </span>
        );
      }
      default:
        return (
          <span key={key} className="preview-placeholder">
            {node.type.includes('Expression')
              ? 'Dynamische inhoud'
              : 'Brononderdeel'}{' '}
            · bron behouden
          </span>
        );
    }
  }
  return (
    <>
      {context.title &&
        !doc.tree.children?.some(
          (n) => n.type === 'heading' && n.depth === 1,
        ) && <h1>{context.title}</h1>}
      {render(doc.tree, 0)}
    </>
  );
}
export function MdxPreview({
  body,
  ...context
}: { body: string } & PreviewContext) {
  const deferred = useDeferredValue(body);
  const { site, domain, path, branch, previewOrigin, title, description, scope } =
    context;
  const parsed = useMemo(
    () => parseLesson(deferred, site ?? ''),
    [deferred, site],
  );
  const content = useMemo(
    () =>
      renderLesson(deferred, {
        site,
        domain,
        path,
        branch,
        previewOrigin,
        title,
        description,
        scope,
      }),
    [deferred, site, domain, path, branch, previewOrigin, title, description, scope],
  );
  return (
    <div className="mdx-preview" aria-busy={body !== deferred}>
      <Text size="xs" c="dimmed" mb="sm" role="status">
        {body !== deferred
          ? 'Voorbeeld wordt bijgewerkt…'
          : 'Inhoudsvoorbeeld · interactieve onderdelen controleer je na opslaan in het cursusvoorbeeld.'}
      </Text>
      {parsed.error ? (
        <Alert color="orange" title="Broncode controleren">
          {parsed.error}
        </Alert>
      ) : (
        content
      )}
    </div>
  );
}
