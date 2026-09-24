import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { resolveAsset, type AssetContext } from '../../lib/authoring/assets';
import {
  modelForNode,
  sectionBindings,
  homepageChildren,
} from '../../lib/authoring/homepage';
import { parseTree, range, type LessonNode } from '../../lib/authoring/syntax';
import { readSetting, type SiteSettings } from '../../lib/authoring/settings';
import { asFooterColumns } from '../../lib/authoring/navigation';
import { MdxPreview } from '../../lib/mdx-preview/MdxPreview';
import './CourseCanvas.css';

export type CanvasRegion =
  'navbar' | 'hero' | 'content' | 'footer' | 'announcement';
export type SectionProps = Record<string, string | number | boolean>;
const text = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** The same page surface is used for editing content and previewing theme changes. */
export function CourseCanvas({
  body,
  assetContext = {},
  settings,
  title,
  tagline,
  colorMode = 'light',
  device = 'desktop',
  onSelectRegion,
  onSelectNavItem,
  selectedRegion,
  children,
}: {
  body: string;
  assetContext?: AssetContext;
  settings?: SiteSettings;
  title?: string;
  tagline?: string;
  colorMode?: 'light' | 'dark';
  device?: 'desktop' | 'mobile';
  onSelectRegion?: (region: CanvasRegion) => void;
  /** A single menu link was clicked; the index follows the navbar items. */
  onSelectNavItem?: (index: number) => void;
  selectedRegion?: CanvasRegion;
  children?: ReactNode;
}) {
  const get = (path: string) => settings && readSetting(settings, path);
  const courseTitle = text(
    get('site.title'),
    title ?? assetContext.site ?? 'Cursus',
  );
  const courseTagline = text(get('site.tagline'), tagline ?? '');
  const navbar = object(get('themeConfig.navbar'));
  const footer = object(get('themeConfig.footer'));
  const logo = object(navbar.logo);
  const logoUrl = resolveAsset(
    text(colorMode === 'dark' ? (logo.srcDark ?? logo.src) : logo.src),
    assetContext,
  );
  const tokens = {
    ...object(settings?.tokens.light),
    ...(colorMode === 'dark' ? object(settings?.tokens.dark) : {}),
  };
  const vars = Object.fromEntries(
    Object.entries(tokens).filter(
      ([k, v]) => k.startsWith('--ifm-') && typeof v === 'string',
    ),
  );
  const region = (name: CanvasRegion) =>
    onSelectRegion
      ? {
          onClick: () => onSelectRegion(name),
          onKeyDown: (event: React.KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelectRegion(name);
            }
          },
          tabIndex: 0,
          role: 'button',
          'aria-label': `${{ navbar: 'Koptekst', hero: 'Pagina', content: 'Pagina', footer: 'Voettekst', announcement: 'Mededeling' }[name]} aanpassen`,
          'data-selected': selectedRegion === name || undefined,
        }
      : {};
  const links = Array.isArray(navbar.items) ? navbar.items.map(object) : [];
  const groups = asFooterColumns(
    Array.isArray(footer.links) ? footer.links.map(object) : [],
  );
  const announcement = object(get('themeConfig.announcementBar'));
  return (
    <div className="course-canvas-frame" data-device={device}>
      <div
        className="course-canvas"
        role="region"
        aria-label="Cursuspagina"
        data-theme={colorMode}
        style={vars as CSSProperties}
      >
        {!!announcement.content && (
          <div
            className="course-announcement"
            {...region('announcement')}
            style={{
              background: text(announcement.backgroundColor) || undefined,
              color: text(announcement.textColor) || undefined,
            }}
          >
            {text(announcement.content).replace(/<[^>]*>/g, '')}
          </div>
        )}
        <header
          className={`course-navbar course-navbar-${text(navbar.style, 'default')}`}
          {...region('navbar')}
        >
          <div className="course-brand">
            {logoUrl && <img src={logoUrl} alt={text(logo.alt, 'Logo')} />}
            <strong>{text(navbar.title, courseTitle)}</strong>
          </div>
          <div className="course-navlinks">
            {links.slice(0, 8).map((link, index) => {
              const label = `${text(link.label, text(link.docId, 'Link'))}${Array.isArray(link.items) ? ' ▾' : ''}`;
              return onSelectNavItem ? (
                <button
                  type="button"
                  key={index}
                  className="course-navlink"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectNavItem(index);
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {label}
                </button>
              ) : (
                <span key={index}>{label}</span>
              );
            })}
          </div>
          <span className="course-mode-symbol" aria-hidden="true">
            {colorMode === 'light' ? '☀' : '☾'}
          </span>
        </header>
        <div
          className="course-content"
          onClick={
            onSelectRegion
              ? (event) => {
                  const element = event.target as HTMLElement;
                  onSelectRegion(
                    element.closest('.course-hero') ? 'hero' : 'content',
                  );
                }
              : undefined
          }
        >
          {children ?? (
            <HomepageDocument
              body={body}
              assetContext={assetContext}
              title={courseTitle}
              tagline={courseTagline}
            />
          )}
        </div>
        <footer
          className={`course-footer course-footer-${text(footer.style, 'dark')}`}
          {...region('footer')}
        >
          {groups.length > 0 && (
            <div className="course-footer-links">
              {groups.map((group, index) => (
                <div key={index}>
                  <strong>{text(group.title)}</strong>
                  {(Array.isArray(group.items) ? group.items : []).map(
                    (entry, i) => (
                      <span key={i}>{text(object(entry).label)}</span>
                    ),
                  )}
                </div>
              ))}
            </div>
          )}
          <div>
            {text(footer.copyright, courseTitle).replace(/<[^>]*>/g, '')}
          </div>
        </footer>
      </div>
    </div>
  );
}

export function SectionVisual({
  name,
  properties: p,
  children,
  titleSlot,
  subtitleSlot,
  pictureSlot,
  assetContext = {},
  title,
  tagline,
}: {
  name: string;
  properties: SectionProps;
  children?: ReactNode;
  titleSlot?: ReactNode;
  subtitleSlot?: ReactNode;
  pictureSlot?: ReactNode;
  assetContext?: AssetContext;
  title?: string;
  tagline?: string;
}) {
  const className = `course-section course-${name.toLowerCase()} course-width-${p.width ?? 'default'} course-spacing-${p.spacing ?? 'default'} course-align-${p.align ?? 'default'} course-background-${p.background ?? 'default'} course-variant-${p.variant ?? 'default'}`;
  const heading =
    titleSlot ??
    (name === 'Hero' ? (
      <h1>{text(p.title, title)}</h1>
    ) : p.title ? (
      <h2>{String(p.title)}</h2>
    ) : null);
  const subtitle =
    subtitleSlot ??
    (p.subtitle || p.tagline || (name === 'Hero' && tagline) ? (
      <p className="course-subtitle">
        {String(p.subtitle ?? p.tagline ?? tagline)}
      </p>
    ) : null);
  if (name === 'Picture') {
    const src = resolveAsset(text(p.src), assetContext);
    return (
      <figure className={className}>
        {pictureSlot ??
          (src ? (
            <img src={src} alt={text(p.alt)} />
          ) : (
            <div className="course-image-empty">Afbeelding</div>
          ))}
        {p.caption && <figcaption>{String(p.caption)}</figcaption>}
      </figure>
    );
  }
  if (name === 'Divider')
    return (
      <div className={className}>
        <hr />
      </div>
    );
  if (name === 'Button')
    return (
      <span
        className={`${className} course-button-${p.variant ?? 'secondary'} course-button-${p.size ?? 'lg'}`}
      >
        {children}
      </span>
    );
  if (name === 'Columns')
    return (
      <div
        className={className}
        style={
          {
            '--course-columns': Math.max(1, Math.min(4, Number(p.count) || 3)),
          } as CSSProperties
        }
      >
        {children}
      </div>
    );
  return (
    <div className={className}>
      {name === 'Hero' || name === 'Section' ? (
        <div className="course-container">
          {heading}
          {subtitle}
          {children}
        </div>
      ) : (
        <>
          {heading}
          {subtitle}
          {children}
        </>
      )}
      {name === 'Card' && p.info && (
        <details className="course-card-info">
          <summary>Meer informatie</summary>
          {String(p.info)}
        </details>
      )}
    </div>
  );
}
export function HomepageDocument({
  body,
  assetContext = {},
  title,
  tagline,
}: {
  body: string;
  assetContext?: AssetContext;
  title?: string;
  tagline?: string;
}) {
  const parsed = useMemo(() => {
    try {
      return { tree: parseTree(body), bindings: sectionBindings(body) };
    } catch {
      return null;
    }
  }, [body]);
  if (!parsed)
    return (
      <p className="course-content-note">
        De pagina bevat broncode die niet in dit voorbeeld kan worden getoond.
      </p>
    );
  const imports = (parsed.tree.children ?? [])
    .filter((n) => n.type === 'mdxjsEsm')
    .map((n) => body.slice(range(n).from, range(n).to))
    .join('\n');
  function render(node: LessonNode, index: number): ReactNode {
    if (node.type === 'mdxjsEsm') return null;
    const model = modelForNode(node, parsed!.bindings, body);
    if (model)
      return (
        <SectionVisual
          key={index}
          name={model.name}
          properties={model.props}
          assetContext={assetContext}
          title={title}
          tagline={tagline}
        >
          {homepageChildren(node).map(render)}
        </SectionVisual>
      );
    if (node.name && !['details', 'summary'].includes(node.name)) {
      if (node.name === 'main' || node.name === 'div')
        return <div key={index}>{homepageChildren(node).map(render)}</div>;
      return (
        <div className="course-tool" key={index}>
          <span className="course-tool-symbol" aria-hidden="true">
            ◇
          </span>
          <strong>{toolLabel(node.name)}</strong>
          <span>Dit interactieve onderdeel blijft behouden.</span>
        </div>
      );
    }
    const r = range(node);
    return (
      <div key={index} className="course-markdown">
        <MdxPreview
          embedded
          body={`${imports}\n\n${body.slice(r.from, r.to)}`}
          {...assetContext}
        />
      </div>
    );
  }
  return <>{homepageChildren(parsed.tree).map(render)}</>;
}
export function toolLabel(name: string) {
  return (
    (
      {
        AlgorithmGrid: 'Algoritme-overzicht',
        TipZoeker: 'Didactische tips zoeken',
        ProjectEditor: 'Programmeeromgeving',
      } as Record<string, string>
    )[name] ?? name
  );
}
