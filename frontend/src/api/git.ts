import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type { ContentScope } from "./types";

// A concept is a GitHub branch with an open pull request; publishing merges it.
// Those words never reach the UI: the `branch` field is an internal handle.

export interface Branch {
  name: string;
  sha: string;
}

export type ConceptStatus =
  | "concept"
  | "wordt_gecontroleerd"
  | "klaar"
  | "aandacht"
  | "gepubliceerd"
  | "verworpen";

export interface Concept {
  number: number;
  title: string;
  /** Internal handle used as `ref` when reading and saving. Never shown. */
  branch: string;
  site: string | null;
  author_login: string;
  state: string;
  head_sha: string;
  html_url: string;
  updated_at: string;
  status?: ConceptStatus;
}

export interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
}

export interface ConceptDetail extends Concept {
  body: string | null;
  mergeable: boolean | null;
  merged: boolean;
  checks: CheckRun[];
  status: ConceptStatus;
  publish_blocked: string | null;
  behind_by: number;
  previews: { site: string; label?: string; url: string }[];
  expected_previews: { site: string; label?: string; url: string }[];
}

export interface ConceptFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface ConceptActivityEvent {
  type: "commit" | "build" | "opened" | "merged" | "closed";
  ts: string | null;
  sha?: string;
  message?: string;
  author?: string;
  site?: string;
  status?: string;
  head_sha?: string;
}

export interface ConflictHunk {
  id: string;
  base: string | null;
  ours: string | null;
  theirs: string | null;
  ours_deleted?: boolean;
  theirs_deleted?: boolean;
  context_before: string;
  context_after: string;
}

export type ConflictSegment =
  | { type: "text"; text: string }
  | { type: "conflict"; id: string; base: string; ours: string; theirs: string };

export interface ConflictFile {
  file: string;
  binary: boolean;
  whole_file: boolean;
  segments: ConflictSegment[];
  hunks: ConflictHunk[];
}

export type ConflictChoice = "ours" | "theirs" | "both" | { custom: string };

export type UpdateResult =
  | { status: "actueel" }
  | { status: "bijgewerkt"; sha: string }
  | {
      status: "conflicten";
      files: ConflictFile[];
      branch_sha: string;
      main_sha: string;
    };

/** A save that collided with someone else's save of the same page. */
export interface SaveConflict {
  file: string;
  segments: ConflictSegment[];
  hunks: ConflictHunk[];
  current_sha: string;
  current_content: string;
}

export interface SaveResult {
  commit_sha: string;
  content_sha: string;
  /** The server merged with a newer version; `content` is what was saved. */
  merged?: boolean;
  content?: string;
}

export function useBranches() {
  return useQuery({
    queryKey: ["branches"],
    queryFn: () => api<Branch[]>("/api/branches"),
  });
}

export function useSavePage(site: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      path: string;
      scope?: ContentScope;
      branch: string;
      content: string;
      message: string;
      sha?: string | null;
      base_text?: string | null;
    }) =>
      api<SaveResult>(`/api/sites/${site}/page`, {
        method: "PUT",
        body: payload,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["page", site, vars.path] });
      qc.invalidateQueries({ queryKey: ["tree", site] });
      qc.invalidateQueries({ queryKey: ["concepts"] });
    },
  });
}

export function uploadImage(
  site: string,
  branch: string,
  path: string,
  file: File,
  scope: ContentScope = "docs",
) {
  const body = new FormData();
  body.set("branch", branch);
  body.set("scope", scope);
  body.set(
    "directory",
    path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
  );
  body.set("file", file);
  return api<{ url: string; path: string; commit_sha: string | null }>(
    `/api/sites/${site}/assets`,
    { method: "POST", body },
  );
}

/** Concepts with status. `details: false` skips the checks (fast, for pickers). */
export function useConcepts(state = "open", details = true) {
  return useQuery({
    queryKey: ["concepts", state, details],
    queryFn: () =>
      api<Concept[]>("/api/concepts", {
        params: { state, details: String(details) },
      }),
    refetchInterval: details ? 30_000 : false,
  });
}

/** Title of the concept behind a ref, for badges ("main" is the published site). */
export function useConceptTitle(branch: string): string {
  const { data } = useConcepts("open", false);
  if (branch === "main") return "Gepubliceerde versie";
  const title = data?.find((c) => c.branch === branch)?.title;
  return title ? `Concept: ${title}` : "Concept";
}

export function useConcept(number: number) {
  return useQuery({
    queryKey: ["concept", number],
    queryFn: () => api<ConceptDetail>(`/api/concepts/${number}`),
    refetchInterval: 30_000, // controle en voorbeelden veranderen terwijl je kijkt
  });
}

export function useConceptFiles(number: number) {
  return useQuery({
    queryKey: ["concept", number, "files"],
    queryFn: () => api<ConceptFile[]>(`/api/concepts/${number}/files`),
  });
}

export function useConceptActivity(number: number) {
  return useQuery({
    queryKey: ["concept", number, "activity"],
    queryFn: () =>
      api<ConceptActivityEvent[]>(`/api/concepts/${number}/activity`),
    refetchInterval: 30_000,
  });
}

export function useCreateConcept() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { site: string; title: string }) =>
      api<Concept>("/api/concepts", { method: "POST", body: payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["concepts"] }),
  });
}

function useConceptAction<T, V = void>(
  number: number,
  action: string,
  body: (vars: V) => unknown = () => ({}),
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) =>
      api<T>(`/api/concepts/${number}/${action}`, {
        method: "POST",
        body: body(vars),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["concepts"] });
      qc.invalidateQueries({ queryKey: ["concept", number] });
    },
  });
}

export function usePublishConcept(number: number) {
  return useConceptAction<{ merged: boolean }>(number, "publiceren");
}

export function useDiscardConcept(number: number) {
  return useConceptAction<Concept>(number, "verwerpen");
}

export function useUpdateConcept(number: number) {
  return useConceptAction<UpdateResult>(number, "bijwerken");
}

export function useResolveConflicts(number: number) {
  return useConceptAction<
    UpdateResult,
    {
      choices: Record<string, Record<string, ConflictChoice>>;
      expected_head: string;
      expected_main: string;
    }
  >(number, "conflicten", (vars) => vars);
}
