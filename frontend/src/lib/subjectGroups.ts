import type { SiteInfo, SubjectInfo } from '../api/types';

export interface SiteGroup {
  key: string;
  title: string;
  domain?: string;
  sites: SiteInfo[];
}

/** Group key for the main site and sites without a known Vak. */
export const OTHER_GROUP = '__overig';

export const SIDEBAR_CLOSED_KEY = 'beheer:sidebar:gesloten-vakken';
export const DASHBOARD_CLOSED_KEY = 'beheer:dashboard:gesloten-vakken';

/** One group per Vak in registry order; the main site (no Vak) comes last. Empty groups are dropped. */
export function groupSitesBySubject(
  sites: SiteInfo[] | undefined,
  subjects: SubjectInfo[] | undefined,
): SiteGroup[] {
  const allSites = sites ?? [];
  const known = new Set((subjects ?? []).map((s) => s.slug));
  return [
    ...(subjects ?? []).map((subject) => ({
      key: subject.slug,
      title: subject.display_name,
      domain: subject.domain,
      sites: allSites.filter((site) => site.subject === subject.slug),
    })),
    {
      key: OTHER_GROUP,
      title: 'Hoofdsite en overig',
      sites: allSites.filter((site) => !site.subject || !known.has(site.subject)),
    },
  ].filter((group) => group.sites.length > 0);
}

function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Sites whose name, slug or address contains the query (case- and accent-insensitive). */
export function filterSites(sites: SiteInfo[], query: string): SiteInfo[] {
  const needle = normalize(query.trim());
  if (!needle) return sites;
  return sites.filter((site) =>
    [site.display_name, site.slug, site.url].some((field) =>
      normalize(field).includes(needle),
    ),
  );
}

/** Keys of the closed Vakken as stored; anything unreadable means "all open". */
export function parseClosed(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}
