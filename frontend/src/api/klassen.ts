import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './client';

export type KlasItem =
  | { type: 'cursus'; site: string; label?: string | null }
  | { type: 'pagina'; site: string; docId: string; pad: string; label: string }
  | { type: 'link'; url: string; label: string };

export interface KlasGroep {
  id: string;
  titel: string;
  items: KlasItem[];
}

export interface Hoofdstukken {
  volgorde: string[];
  verborgen: string[];
}

export interface KlasInhoud {
  versie: 1;
  intro: string;
  groepen: KlasGroep[];
  cursussen: Record<string, Hoofdstukken>;
}

export type KlasRol = 'eigenaar' | 'docent' | 'geen';

export interface KlasSamenvatting {
  id: number;
  code: string;
  vak: string;
  naam: string;
  url: string | null;
  gearchiveerd: boolean;
  versie: number;
  eigenaar: { login: string; name: string | null; avatar_url: string | null } | null;
  docenten: string[];
  rol: KlasRol;
  aantal_items: number;
  updated_at: string | null;
}

export interface KlasDetail extends KlasSamenvatting {
  inhoud: KlasInhoud;
}

/** One sidebar item from a course build's sidebar-manifest.json. */
export interface ManifestItem {
  key: string | null;
  type: 'category' | 'doc' | 'link';
  label: string;
  href?: string;
  docId?: string;
  items?: ManifestItem[];
}

export interface HoofdstukkenAntwoord {
  site: string;
  path: string;
  manifest: {
    sidebars: Record<string, ManifestItem[]>;
    stale: boolean;
    built_at: string | null;
  } | null;
}

export function useKlassen() {
  return useQuery({
    queryKey: ['klassen'],
    queryFn: () => api<KlasSamenvatting[]>('/api/klassen'),
  });
}

export function useKlas(id: number) {
  return useQuery({
    queryKey: ['klas', id],
    queryFn: () => api<KlasDetail>(`/api/klassen/${id}`),
  });
}

export function useHoofdstukken(site: string | null) {
  return useQuery({
    queryKey: ['klas-hoofdstukken', site],
    queryFn: () => api<HoofdstukkenAntwoord>(`/api/klassen/hoofdstukken/${site}`),
    enabled: !!site,
    staleTime: 5 * 60 * 1000,
  });
}

function useKlasMutatie<T>(fn: (payload: T) => Promise<KlasDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (klas) => {
      qc.setQueryData(['klas', klas.id], klas);
      qc.invalidateQueries({ queryKey: ['klassen'] });
    },
  });
}

export function useNieuweKlas() {
  return useKlasMutatie((payload: { vak: string; naam: string }) =>
    api<KlasDetail>('/api/klassen', { method: 'POST', body: payload }),
  );
}

export function useBewaarKlas(id: number) {
  return useKlasMutatie((payload: { naam: string; inhoud: KlasInhoud; versie: number }) =>
    api<KlasDetail>(`/api/klassen/${id}`, { method: 'PUT', body: payload }),
  );
}

export function useDupliceerKlas() {
  return useKlasMutatie((id: number) =>
    api<KlasDetail>(`/api/klassen/${id}/dupliceren`, { method: 'POST' }),
  );
}

export function useNieuweCode(id: number) {
  return useKlasMutatie(() => api<KlasDetail>(`/api/klassen/${id}/nieuwe-code`, { method: 'POST' }));
}

export function useZetDocenten(id: number) {
  return useKlasMutatie((logins: string[]) =>
    api<KlasDetail>(`/api/klassen/${id}/docenten`, { method: 'PUT', body: { logins } }),
  );
}

export function useArchiveer(id: number) {
  return useKlasMutatie((terug: boolean) =>
    api<KlasDetail>(`/api/klassen/${id}/archiveren`, {
      method: 'POST',
      params: terug ? { terug: 'true' } : undefined,
    }),
  );
}

export function useVerwijderKlas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/klassen/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['klassen'] }),
  });
}
