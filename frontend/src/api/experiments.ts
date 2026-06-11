import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './client';

export interface ExperimentInfo {
  id: number;
  site: string;
  name: string;
  hypothesis: string | null;
  page_path: string;
  variant_branch: string;
  variant_build_sha: string | null;
  split_pct: number;
  status: 'draft' | 'running' | 'paused' | 'concluded';
  winner: 'A' | 'B' | null;
  started_at: string | null;
  ended_at: string | null;
}

export interface VariantStats {
  exposed: number;
  avg_time_seconds: number;
  avg_scroll_pct: number | null;
  engaged: number;
  engaged_pct: number;
}

export interface ExperimentResults {
  experiment_id: number;
  status: string;
  variants: { A: VariantStats; B: VariantStats };
  z_test: { z: number | null; p_value: number | null; significant: boolean; note: string | null };
}

export function useExperiments() {
  return useQuery({
    queryKey: ['experiments'],
    queryFn: () => api<ExperimentInfo[]>('/api/experiments'),
  });
}

export function useExperimentResults(id: number) {
  return useQuery({
    queryKey: ['experiment-results', id],
    queryFn: () => api<ExperimentResults>(`/api/experiments/${id}/results`),
    refetchInterval: 60_000,
  });
}

export function useCreateExperiment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      site: string;
      name: string;
      hypothesis?: string;
      page_path: string;
      variant_branch: string;
      split_pct: number;
    }) => api<ExperimentInfo>('/api/experiments', { method: 'POST', body: payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['experiments'] }),
  });
}

export function usePatchExperiment(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { action: 'start' | 'pause' | 'conclude'; winner?: string }) =>
      api<ExperimentInfo>(`/api/experiments/${id}`, { method: 'PATCH', body: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['experiments'] });
      qc.invalidateQueries({ queryKey: ['experiment-results', id] });
    },
  });
}
