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
}

export interface SiteCreate {
  slug: string;
  display_name: string;
  domain: string;
  title: string;
  tagline: string;
}

export interface CreateSiteResult {
  slug: string;
  docs_pr: string | null;
  management_pr: string | null;
  manual_steps: string[];
}

export interface TreeItem {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
}

export interface PageContent {
  path: string;
  ref: string;
  sha: string;
  content: string;
  frontmatter: string;
}
