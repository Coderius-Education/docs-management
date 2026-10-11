import type { LinkIndex, LinkPage, LinkSite } from '../../api/links';

// [tekst](site:<site>/<route>#<anker>): de vorm van elke link naar een pagina
// in lestekst. De docs-repo zet hem bij de build om (packages/shared/plugins/
// site-links.js) en controleert hem in de cross-links-job. Houd de grammatica
// gelijk aan parseSiteUrl in packages/shared/sites.js; de testvectoren ook.
const SITE_URL_RE = /^site:([a-z][a-z0-9_-]*)(\/[^#?\s]*)?(?:#(\S*))?$/;

export interface SiteUrl {
  site: string;
  route: string;
  anchor?: string;
}

/** Null voor een andere URL of een misvormde site:-link. */
export function parseSiteUrl(url: string): SiteUrl | null {
  const match = SITE_URL_RE.exec(url);
  if (!match || !match[2]) return null;
  return {
    site: match[1],
    route: match[2],
    ...(match[3] ? { anchor: match[3] } : {}),
  };
}

export function formatSiteUrl({ site, route, anchor }: SiteUrl): string {
  const pad = route.startsWith('/') ? route : `/${route}`;
  return `site:${site}${pad}${anchor ? `#${anchor}` : ''}`;
}

export interface PageHit {
  site: LinkSite;
  page: LinkPage;
  /** Kop die op de zoekterm past, als de titel en het pad dat niet doen. */
  heading?: [id: string, text: string];
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Zoekt pagina's op titel, pad en koppen; ongevoelig voor hoofdletters en
 * accenten. Titel boven pad boven kop, en de eigen site eerst.
 */
export function searchPages(
  index: LinkIndex,
  query: string,
  {
    site,
    subject,
    current,
    limit = 50,
  }: { site?: string; subject?: string; current?: string; limit?: number } = {},
): PageHit[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const hits: (PageHit & { score: number })[] = [];
  for (const s of index.sites) {
    if (site && s.site !== site) continue;
    if (subject && s.subject !== subject) continue;
    for (const page of s.pages) {
      const title = normalize(page.title);
      const path = normalize(page.path);
      const own = s.site === current ? 0 : 1;
      if (words.every((w) => title.includes(w))) {
        hits.push({ site: s, page, score: own + (title.startsWith(words[0] ?? '') ? 0 : 1) });
        continue;
      }
      if (words.every((w) => path.includes(w) || title.includes(w))) {
        hits.push({ site: s, page, score: 10 + own });
        continue;
      }
      const heading = page.headings.find(([, text]) => {
        const t = normalize(text);
        return words.every((w) => t.includes(w));
      });
      if (heading)
        hits.push({ site: s, page, heading: [heading[0], heading[1]], score: 20 + own });
    }
  }
  return hits
    .sort((a, b) => a.score - b.score || a.page.title.localeCompare(b.page.title))
    .slice(0, limit)
    .map(({ score: _score, ...hit }) => hit);
}

export type LinkStatus =
  | 'ok'
  | 'missing-page'
  | 'missing-anchor'
  | 'unknown-site'
  | 'unindexed';

/** Wat de editor over een site:-link kan zeggen, voor het voorbeeld. */
export function describeSiteUrl(
  index: LinkIndex | undefined,
  url: string,
): { label: string; status: LinkStatus } | null {
  const link = parseSiteUrl(url);
  if (!link) return null;
  const site = index?.sites.find((s) => s.site === link.site);
  if (!index || !site)
    return {
      label: link.site,
      status: index?.missing.includes(link.site) || !index ? 'unindexed' : 'unknown-site',
    };
  const route = link.route.replace(/\/+$/, '') || '/';
  const page = site.pages.find((p) => p.path === route);
  if (!page) return { label: site.label, status: 'missing-page' };
  const label = `${site.label} · ${page.title}`;
  if (link.anchor && !page.headings.some(([id]) => id === link.anchor)) {
    // Alleen h2/h3 staan in de index; een ander anker kan bestaan.
    return { label, status: 'missing-anchor' };
  }
  return { label, status: 'ok' };
}
