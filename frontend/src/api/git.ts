import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './client';

export interface Branch {
  name: string;
  sha: string;
}

export interface PrSummary {
  number: number;
  title: string;
  branch: string;
  author_login: string;
  state: string;
  head_sha: string;
  html_url: string;
  updated_at: string;
}

export interface PrDetail extends PrSummary {
  body: string | null;
  mergeable: boolean | null;
  merged: boolean;
  checks: { name: string; status: string; conclusion: string | null }[];
  previews: { site: string; url: string }[];
  expected_previews: { site: string; url: string }[];
}

export interface PrFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface PrCommit {
  sha: string;
  message: string;
  author_login: string | null;
  date: string | null;
}

export interface PrActivityEvent {
  type: 'commit' | 'build' | 'opened' | 'merged' | 'closed';
  ts: string | null;
  sha?: string;
  message?: string;
  author?: string;
  site?: string;
  status?: string;
  head_sha?: string;
}

export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: () => api<Branch[]>('/api/branches'),
  });
}

export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<Branch>('/api/branches', { method: 'POST', body: { name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches'] }),
  });
}

export function useSavePage(site: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      path: string;
      branch: string;
      content: string;
      message: string;
      sha?: string | null;
    }) =>
      api<{ commit_sha: string; content_sha: string }>(`/api/sites/${site}/page`, {
        method: 'PUT',
        body: payload,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['page', site, vars.path] });
      qc.invalidateQueries({ queryKey: ['tree', site] });
    },
  });
}

export function usePrs(state = 'open') {
  return useQuery({
    queryKey: ['prs', state],
    queryFn: () => api<PrSummary[]>('/api/prs', { params: { state } }),
  });
}

export function usePr(number: number) {
  return useQuery({
    queryKey: ['pr', number],
    queryFn: () => api<PrDetail>(`/api/prs/${number}`),
    refetchInterval: 30_000, // checks/builds veranderen terwijl je kijkt
  });
}

export function usePrFiles(number: number) {
  return useQuery({
    queryKey: ['pr', number, 'files'],
    queryFn: () => api<PrFile[]>(`/api/prs/${number}/files`),
  });
}

export function usePrCommits(number: number) {
  return useQuery({
    queryKey: ['pr', number, 'commits'],
    queryFn: () => api<PrCommit[]>(`/api/prs/${number}/commits`),
  });
}

export function usePrActivity(number: number) {
  return useQuery({
    queryKey: ['pr', number, 'activity'],
    queryFn: () => api<PrActivityEvent[]>(`/api/prs/${number}/activity`),
    refetchInterval: 30_000, // builds verschijnen terwijl CI loopt
  });
}

export function useCreatePr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { branch: string; title: string; body?: string }) =>
      api<PrSummary>('/api/prs', { method: 'POST', body: payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prs'] }),
  });
}

export function useMergePr(number: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ merged: boolean }>(`/api/prs/${number}/merge`, {
      method: 'POST',
      body: {},
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prs'] });
      qc.invalidateQueries({ queryKey: ['pr', number] });
    },
  });
}

export function useClosePr(number: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/api/prs/${number}/close`, { method: 'POST', body: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prs'] });
      qc.invalidateQueries({ queryKey: ['pr', number] });
    },
  });
}
