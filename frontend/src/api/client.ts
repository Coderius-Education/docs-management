// Dunne fetch-wrapper: JSON, CSRF-header op mutaties, 401 → /login.

let csrfToken: string | null = null;

export function setCsrfToken(token: string) {
  csrfToken = token;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; params?: Record<string, string> } = {},
): Promise<T> {
  const { method = 'GET', body, params } = options;
  const url = params ? `${path}?${new URLSearchParams(params)}` : path;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  const resp = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (resp.status === 401 && !path.startsWith('/api/auth/me')) {
    window.location.href = '/login';
    throw new ApiError(401, 'Niet ingelogd');
  }
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      detail = (await resp.json()).detail ?? detail;
    } catch {
      // geen JSON-body
    }
    throw new ApiError(resp.status, detail);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json();
}
