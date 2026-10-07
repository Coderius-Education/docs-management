export type ContentScope = "docs" | "pages" | "homepage" | "metadata";
export function contentScope(value: string | null): ContentScope {
  return value === "pages" || value === "homepage" || value === "metadata"
    ? value
    : "docs";
}
export function scopedKey(scope: ContentScope, path: string) {
  return scope === "docs" ? path : `${scope}:${path}`;
}

export interface Me {
  login: string;
  name: string | null;
  avatar_url: string | null;
  csrf_token: string;
  token_invalid: boolean;
}

export interface SiteInfo {
  slug: string;
  domain: string;
  display_name: string;
  /** Vak (informatica, wo, …); null voor de hoofdsite. */
  subject: string | null;
  path: string;
  url: string;
}

/** Host plus path of a site (informatica.coderius.nl/python/), for asset previews. */
export function siteHost(site: SiteInfo | undefined): string | undefined {
  return site?.url?.replace(/^https?:\/\//, '') || site?.domain;
}

export interface SubjectInfo {
  slug: string;
  display_name: string;
  domain: string;
}

export interface SiteCreate {
  slug: string;
  display_name: string;
  title: string;
  tagline: string;
  subject: string;
  path?: string;
  new_subject?: { slug: string; display_name: string; domain: string } | null;
}

export interface CreateSiteResult {
  slug: string;
  url: string;
  docs_pr: string | null;
  management_pr: string | null;
  manual_steps: string[];
}

export interface TreeItem {
  path: string;
  type: "blob" | "tree";
  sha: string;
}

export interface PageContent {
  path: string;
  ref: string;
  sha: string;
  content: string;
  frontmatter: string;
}
