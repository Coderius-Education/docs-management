import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, setCsrfToken } from './client';
import type { CreateSiteResult, Me, PageContent, SiteCreate, SiteInfo, TreeItem } from './types';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const me = await api<Me>('/api/auth/me');
      setCsrfToken(me.csrf_token);
      return me;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSites() {
  return useQuery({
    queryKey: ['sites'],
    queryFn: () => api<SiteInfo[]>('/api/sites'),
    staleTime: 60 * 60 * 1000,
  });
}

export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SiteCreate) =>
      api<CreateSiteResult>('/api/sites', { method: 'POST', body: payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
}

export function useTree(site: string, ref = 'main') {
  return useQuery({
    queryKey: ['tree', site, ref],
    queryFn: () => api<TreeItem[]>(`/api/sites/${site}/tree`, { params: { ref } }),
  });
}

export function usePage(site: string, path: string | null, ref = 'main') {
  return useQuery({
    queryKey: ['page', site, path, ref],
    queryFn: () => api<PageContent>(`/api/sites/${site}/page`, { params: { path: path!, ref } }),
    enabled: path !== null,
  });
}
