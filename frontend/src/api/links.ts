import { useQuery } from '@tanstack/react-query';

import { api } from './client';

/** Een kop op een gebouwde pagina: [id, tekst, niveau]. */
export type LinkHeading = [id: string, text: string, level: number];

export interface LinkPage {
  /** Route binnen de site, zonder basispad: '/docs/lussen'. */
  path: string;
  title: string;
  kind: 'docs' | 'category' | 'page' | 'blog';
  headings: LinkHeading[];
}

export interface LinkSite {
  site: string;
  label: string;
  /** Vak van de cursus (informatica, wo, …); null voor de homepage. */
  subject: string | null;
  build_id: number;
  built_at: string | null;
  /** De nieuwste build was onleesbaar; deze index komt van een oudere. */
  stale: boolean;
  pages: LinkPage[];
}

export interface LinkIndex {
  sites: LinkSite[];
  /** Sites zonder leesbare main-build. */
  missing: string[];
}

/** Alle pagina's en koppen van alle sites, uit de gepubliceerde builds. */
export function useLinkIndex(enabled = true) {
  return useQuery({
    queryKey: ['links-index'],
    queryFn: async (): Promise<LinkIndex> => {
      const data = await api<Partial<LinkIndex>>('/api/links/index');
      return { sites: data?.sites ?? [], missing: data?.missing ?? [] };
    },
    staleTime: 10 * 60 * 1000,
    enabled,
  });
}
