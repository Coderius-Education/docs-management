import { expect, it } from 'vitest';

import type { LinkIndex } from '../../api/links';
import { describeSiteUrl, formatSiteUrl, parseSiteUrl, searchPages } from './siteLinks';

// Dezelfde vectoren als packages/shared/site-links.test.ts in de docs-repo.
it.each([
  ['site:python/docs/lussen', { site: 'python', route: '/docs/lussen' }],
  ['site:python/docs/lussen#for-lus', { site: 'python', route: '/docs/lussen', anchor: 'for-lus' }],
  ['site:editor/', { site: 'editor', route: '/' }],
  ['site:algorithms/docs/cfg/concept', { site: 'algorithms', route: '/docs/cfg/concept' }],
])('parses %s', (url, expected) => {
  expect(parseSiteUrl(url)).toEqual(expected);
  expect(formatSiteUrl(expected)).toBe(url);
});

it('rejects other and malformed urls', () => {
  expect(parseSiteUrl('/docs/x')).toBeNull();
  expect(parseSiteUrl('site:python')).toBeNull();
  expect(parseSiteUrl('site:python/docs/a b')).toBeNull();
  expect(parseSiteUrl('site:python/docs/x?y=1')).toBeNull();
});

const index: LinkIndex = {
  missing: ['ctf'],
  sites: [
    {
      site: 'web',
      label: 'Web',
      build_id: 2,
      built_at: null,
      stale: false,
      pages: [
        { path: '/docs/lussen-in-js', title: 'Lussen in JavaScript', kind: 'docs', headings: [] },
      ],
    },
    {
      site: 'python',
      label: 'Python',
      build_id: 1,
      built_at: null,
      stale: false,
      pages: [
        {
          path: '/docs/herhalen',
          title: 'Herhalen',
          kind: 'docs',
          headings: [['de-for-lus', 'De for-lus', 2]],
        },
        { path: '/docs/lussen', title: 'Lussen', kind: 'docs', headings: [] },
        { path: '/docs/cafe', title: 'Café', kind: 'docs', headings: [] },
      ],
    },
  ],
};

it('searches titles, then paths, then headings, own site first', () => {
  const hits = searchPages(index, 'lus', { current: 'python' });
  expect(hits.map((h) => `${h.site.site}${h.page.path}`)).toEqual([
    'python/docs/lussen',
    'web/docs/lussen-in-js',
    'python/docs/herhalen',
  ]);
  expect(hits[2].heading).toEqual(['de-for-lus', 'De for-lus']);
  expect(searchPages(index, 'cafe')[0].page.title).toBe('Café');
  expect(searchPages(index, 'lus', { site: 'web' })).toHaveLength(1);
});

it('describes links for the preview', () => {
  expect(describeSiteUrl(index, 'site:python/docs/herhalen#de-for-lus')).toEqual({
    label: 'Python · Herhalen',
    status: 'ok',
  });
  expect(describeSiteUrl(index, 'site:python/docs/herhalen/#weg')?.status).toBe('missing-anchor');
  expect(describeSiteUrl(index, 'site:python/docs/weg')?.status).toBe('missing-page');
  expect(describeSiteUrl(index, 'site:ctf/')?.status).toBe('unindexed');
  expect(describeSiteUrl(index, 'site:pyton/')?.status).toBe('unknown-site');
  expect(describeSiteUrl(index, 'https://example.com')).toBeNull();
});
