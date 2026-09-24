import { Navigate, useParams, useSearchParams } from 'react-router';

/** Vormgeving now lives in the homepage editor; keep old links working. */
export function SettingsRedirect() {
  const { site = '' } = useParams();
  const [params] = useSearchParams();
  const search = new URLSearchParams({
    scope: 'homepage',
    path: 'homepage.mdx',
    ref: params.get('ref') ?? 'main',
    panel: 'style',
  });
  return <Navigate replace to={`/sites/${site}/edit?${search}`} />;
}
