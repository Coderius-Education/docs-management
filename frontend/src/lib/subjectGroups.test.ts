import { expect, it } from 'vitest';

import type { SiteInfo, SubjectInfo } from '../api/types';
import { OTHER_GROUP, filterSites, groupSitesBySubject, parseClosed } from './subjectGroups';

function site(slug: string, subject: string | null, display_name = slug): SiteInfo {
  const domain = subject ? `${subject}.coderius.nl` : 'coderius.nl';
  return { slug, subject, display_name, domain, path: slug, url: `https://${domain}/${slug}/` };
}

const subjects: SubjectInfo[] = [
  { slug: 'informatica', display_name: 'Informatica', domain: 'informatica.coderius.nl' },
  { slug: 'wo', display_name: 'Wetenschapsoriëntatie', domain: 'wo.coderius.nl' },
  { slug: 'leeg', display_name: 'Leeg', domain: 'leeg.coderius.nl' },
];

it('groups sites per Vak, with the main site and unknown Vakken last', () => {
  const groups = groupSitesBySubject(
    [site('home', null), site('python', 'informatica'), site('onderzoek', 'wo'), site('oud', 'weg')],
    subjects,
  );
  expect(groups.map((g) => [g.key, g.sites.map((s) => s.slug)])).toEqual([
    ['informatica', ['python']],
    ['wo', ['onderzoek']],
    [OTHER_GROUP, ['home', 'oud']],
  ]);
});

it('groups nothing while data is still loading', () => {
  expect(groupSitesBySubject(undefined, undefined)).toEqual([]);
});

it('finds sites by name, slug or address, ignoring case and accents', () => {
  const sites = [
    site('python', 'informatica', 'Python'),
    site('onderzoek', 'wo', 'Wetenschapsoriëntatie'),
  ];
  expect(filterSites(sites, 'PYTH').map((s) => s.slug)).toEqual(['python']);
  expect(filterSites(sites, 'orientatie').map((s) => s.slug)).toEqual(['onderzoek']);
  expect(filterSites(sites, 'wo.coderius').map((s) => s.slug)).toEqual(['onderzoek']);
  expect(filterSites(sites, '  ')).toEqual(sites);
  expect(filterSites(sites, 'java')).toEqual([]);
});

it('reads remembered closed Vakken and treats anything else as all open', () => {
  expect(parseClosed('["wo","informatica"]')).toEqual(['wo', 'informatica']);
  expect(parseClosed('["wo",3,null]')).toEqual(['wo']);
  expect(parseClosed(null)).toEqual([]);
  expect(parseClosed('{kapot')).toEqual([]);
  expect(parseClosed('"wo"')).toEqual([]);
});
