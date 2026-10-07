import type { CSSProperties, MouseEvent, ReactNode } from 'react';

import type { SiteInfo } from '../../../api/types';
import { markdownNaarHtml } from '../../../lib/authoring/vakMarkdown';
import { BLOK_NAMEN, type Blok, type Vakpagina } from '../../../lib/authoring/vakpagina';
import './VakCanvas.css';

const KOPLETTER = {
  literata: "Georgia, 'Literata', serif",
  atkinson: "system-ui, 'Atkinson Hyperlegible Next', sans-serif",
  mono: "ui-monospace, 'Atkinson Hyperlegible Mono', monospace",
} as const;

function Tekst({ bron, className = '' }: { bron?: string; className?: string }) {
  if (!bron) return null;
  // markdownNaarHtml escapes everything first; only safe markup comes out.
  return <div className={`vak-tekst ${className}`} dangerouslySetInnerHTML={{ __html: markdownNaarHtml(bron) }} />;
}

export interface CanvasContext {
  vakNaam: string;
  sites: SiteInfo[];
  gekozen: string | null;
  kies: (id: string) => void;
  /** Maps an image path from the document to a URL the studio can load. */
  afbeelding: (src: string) => string;
}

function Omhulsel({
  blok,
  ctx,
  children,
  genest,
}: {
  blok: Blok;
  ctx: CanvasContext;
  children: ReactNode;
  genest: boolean;
}) {
  const p = blok.props;
  const klik = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    ctx.kies(blok.id);
  };
  return (
    <div
      className={`vak-blok ${genest ? '' : 'vak-buiten'}`}
      data-width={genest ? undefined : (p.width ?? 'wide')}
      data-spacing={genest ? undefined : (p.spacing ?? 'normal')}
      data-gekozen={ctx.gekozen === blok.id}
      onClick={klik}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          ctx.kies(blok.id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${BLOK_NAMEN[blok.type]} bewerken`}
      aria-pressed={ctx.gekozen === blok.id}
    >
      <span className="vak-blok-label">{BLOK_NAMEN[blok.type]}</span>
      {children}
    </div>
  );
}

function Cursussen({ blok, ctx }: { blok: Blok; ctx: CanvasContext }) {
  const p = blok.props;
  const uitgelicht = p.uitgelicht ?? [];
  const rang = (slug: string) => {
    const i = uitgelicht.indexOf(slug);
    return i === -1 ? uitgelicht.length : i;
  };
  const lijst = ctx.sites
    .filter((s) => !p.alleen?.length || p.alleen.includes(s.slug))
    .sort((a, b) => rang(a.slug) - rang(b.slug));
  return (
    <div>
      {p.automatischeKop ? (
        <div style={{ padding: '16px 0 12px' }}>
          <h1 style={{ fontSize: '1.9rem' }}>{ctx.vakNaam}</h1>
          <p style={{ color: 'var(--muted-foreground)', marginTop: 4 }}>
            {lijst.length} cursussen {ctx.vakNaam.toLowerCase()}. Kies er een en begin in je browser.
          </p>
        </div>
      ) : (
        p.title && <h2 style={{ fontSize: '1.25rem', paddingBottom: 12 }}>{p.title}</h2>
      )}
      {p.filters !== false && (
        <div className="vak-chips">
          <span>Vak</span>
          <span>Niveau{p.niveaus?.length ? ` (${p.niveaus.length})` : ''}</span>
          <span>Thema</span>
        </div>
      )}
      <div className="vak-cursussen">
        {lijst.map((site) => (
          <div key={site.slug} className="vak-kaart" style={{ textAlign: 'left' }}>
            <span className="vak-info">{uitgelicht.includes(site.slug) ? 'Uitgelicht' : 'Cursus'}</span>
            <h3>{site.display_name}</h3>
          </div>
        ))}
      </div>
    </div>
  );
}

function BlokWeergave({ blok, ctx, genest = false }: { blok: Blok; ctx: CanvasContext; genest?: boolean }) {
  const p = blok.props;
  const kinderen = (blok.kinderen ?? []).map((kind) => (
    <BlokWeergave key={kind.id} blok={kind} ctx={ctx} genest />
  ));
  const binnen = { 'data-align': p.align, 'data-background': p.background } as Record<string, string | undefined>;
  let inhoud: ReactNode = null;
  switch (blok.type) {
    case 'Courses':
      inhoud = (
        <div className="vak-binnen" {...binnen}>
          <Cursussen blok={blok} ctx={ctx} />
        </div>
      );
      break;
    case 'Hero':
      inhoud = (
        <section className="vak-hero vak-binnen" data-variant={p.variant ?? 'default'} {...binnen}>
          {p.title && <h1>{p.title}</h1>}
          {p.tagline && <p className="vak-tagline">{p.tagline}</p>}
          <Tekst bron={blok.tekst} />
          {kinderen.length > 0 && <div style={{ marginTop: 20 }}>{kinderen}</div>}
        </section>
      );
      break;
    case 'Section':
      inhoud = (
        <section className="vak-binnen" {...binnen}>
          {p.title && <h2 style={{ fontSize: genest ? '1.1rem' : '1.5rem' }}>{p.title}</h2>}
          {p.subtitle && <p style={{ color: 'var(--muted-foreground)' }}>{p.subtitle}</p>}
          <Tekst bron={blok.tekst} className={genest ? 'vak-klein' : ''} />
          {kinderen.length > 0 && <div style={{ marginTop: 16, display: 'grid', gap: 16 }}>{kinderen}</div>}
        </section>
      );
      break;
    case 'Columns':
      inhoud = (
        <div className="vak-binnen" {...binnen}>
          <div className="vak-kolommen" data-count={p.count ?? 3}>
            {kinderen}
          </div>
        </div>
      );
      break;
    case 'Card':
      inhoud = (
        <div className="vak-kaart vak-binnen" {...binnen}>
          {p.info && <span className="vak-info">{p.info}</span>}
          {p.title && <h3>{p.title}{p.href?.startsWith('https://') ? ' ↗' : ''}</h3>}
          <Tekst bron={blok.tekst} />
        </div>
      );
      break;
    case 'Buttons': {
      const justify = p.align === 'center' ? 'center' : p.align === 'right' ? 'flex-end' : 'flex-start';
      inhoud = <div className="vak-knoppen" style={{ justifyContent: justify }}>{kinderen}</div>;
      break;
    }
    case 'Button':
      inhoud = (
        <span className="vak-knop" data-variant={p.variant} data-size={p.size}>
          {blok.tekst || 'Knop'}
        </span>
      );
      break;
    case 'Picture':
      inhoud = (
        <figure className="vak-binnen" style={{ margin: 0 }} {...binnen}>
          {p.src ? (
            <img src={ctx.afbeelding(p.src)} alt={p.alt ?? ''} style={{ maxWidth: '100%', borderRadius: 12 }} />
          ) : (
            <div className="vak-leeg">Kies een afbeelding</div>
          )}
          {p.caption && <figcaption style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>{p.caption}</figcaption>}
        </figure>
      );
      break;
    case 'Divider':
      inhoud = <hr style={{ border: 0, borderTop: '1px solid var(--border)' }} />;
      break;
  }
  return (
    <Omhulsel blok={blok} ctx={ctx} genest={genest}>
      {inhoud}
    </Omhulsel>
  );
}

export function VakCanvas({
  doc,
  ctx,
  modus,
  apparaat,
  einde,
}: {
  doc: Vakpagina;
  ctx: CanvasContext;
  modus: 'licht' | 'donker';
  apparaat: 'desktop' | 'mobiel';
  einde?: ReactNode;
}) {
  const kleuren = doc.thema?.[modus];
  const stijl = {
    ...(kleuren?.primary ? { '--primary': kleuren.primary } : {}),
    ...(kleuren?.primaryForeground ? { '--primary-foreground': kleuren.primaryForeground } : {}),
    ...(doc.thema?.kopletter ? { '--kopletter': KOPLETTER[doc.thema.kopletter] } : {}),
  } as CSSProperties;
  const logo = modus === 'donker' ? doc.thema?.logo?.donker || doc.thema?.logo?.licht : doc.thema?.logo?.licht;
  return (
    <div className="vak-canvas-frame" data-device={apparaat === 'mobiel' ? 'mobile' : 'desktop'}>
      <div className="vak-canvas" data-theme={modus === 'donker' ? 'dark' : 'light'} style={stijl}>
        <div className="vak-kop">
          {logo ? <img src={ctx.afbeelding(logo)} alt="" /> : 'coderius'}
          <span>Cursussen</span>
          <span>Docenten</span>
        </div>
        {doc.blokken.length === 0 && <div className="vak-leeg">Nog geen blokken. Voeg er een toe.</div>}
        {doc.blokken.map((blok) => (
          <BlokWeergave key={blok.id} blok={blok} ctx={ctx} />
        ))}
        {einde}
      </div>
    </div>
  );
}
