import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, setCsrfToken } from "./client";
import type {
  ContentScope,
  CreateSiteResult,
  Me,
  PageContent,
  SiteCreate,
  SiteInfo,
  TreeItem,
} from "./types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const me = await api<Me>("/api/auth/me");
      setCsrfToken(me.csrf_token);
      return me;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSites() {
  return useQuery({
    queryKey: ["sites"],
    queryFn: () => api<SiteInfo[]>("/api/sites"),
    staleTime: 60 * 60 * 1000,
  });
}

export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SiteCreate) =>
      api<CreateSiteResult>("/api/sites", { method: "POST", body: payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
}

export function useTree(
  site: string,
  ref = "main",
  scope: ContentScope = "docs",
) {
  return useQuery({
    queryKey:
      scope === "docs" ? ["tree", site, ref] : ["tree", site, ref, scope],
    queryFn: () =>
      api<TreeItem[]>(`/api/sites/${site}/tree`, { params: { ref, scope } }),
  });
}

export function usePage(
  site: string,
  path: string | null,
  ref = "main",
  scope: ContentScope = "docs",
) {
  return useQuery({
    queryKey: pageKey(site, path, ref, scope),
    queryFn: () =>
      api<PageContent>(`/api/sites/${site}/page`, {
        params: { path: path!, ref, scope },
      }),
    enabled: path !== null,
  });
}

export function usePreviews() {
  return useQuery({
    queryKey: ["previews"],
    queryFn: () =>
      api<{ site: string; branch: string; url: string }[]>("/api/previews"),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function pageKey(
  site: string,
  path: string | null,
  ref: string,
  scope: ContentScope = "docs",
) {
  return scope === "docs"
    ? ["page", site, path, ref]
    : ["page", site, path, ref, scope];
}
