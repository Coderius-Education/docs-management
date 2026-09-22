import { describe, expect, it } from 'vitest';
import {
  propertySchema,
  validateProperties,
  parsePropertyYaml,
} from './properties';
import { joinFrontmatter, splitFrontmatter } from '../frontmatter';

describe('Docusaurus property validation', () => {
  it('retains valid nullable, false, empty and nested values', () => {
    expect(
      validateProperties(
        {
          title: '',
          hide_title: false,
          pagination_prev: null,
          pagination_next: 'next',
          custom_edit_url: '',
          displayed_sidebar: null,
          keywords: [],
          tags: ['intro', { label: 'Code', permalink: '/code' }],
          last_update: { author: 'Ada', date: '2026-09-22' },
          sidebar_custom_props: { nested: [1, false] },
          arbitrary: 123,
        },
        'docs',
      ),
    ).toEqual({});
  });
  it('validates type, heading bounds, nested properties, visibility and finite numbers', () => {
    const errors = validateProperties(
      {
        hide_title: 'false',
        pagination_prev: false,
        sidebar_position: Infinity,
        toc_min_heading_level: 6,
        toc_max_heading_level: 2,
        keywords: 'code',
        tags: [{ label: 'missing permalink' }],
        last_update: { date: 'not-a-date' },
        draft: true,
        unlisted: true,
      },
      'docs',
    );
    for (const key of [
      'hide_title',
      'pagination_prev',
      'sidebar_position',
      'toc_min_heading_level',
      'keywords',
      'tags',
      'last_update.date',
      'draft',
    ])
      expect(errors[key]).toBeTruthy();
    expect(
      validateProperties(
        { toc_max_heading_level: 7, toc_min_heading_level: 2.5 },
        'pages',
      ),
    ).toHaveProperty('toc_max_heading_level');
  });
  it('only validates fields applicable to selected content type, preserving custom values', () => {
    expect(
      validateProperties(
        {
          sidebar_position: 'custom',
          hide_title: 'custom',
          wrapperClassName: 'wide',
          last_update: { author: 'Ada' },
        },
        'pages',
      ),
    ).toEqual({});
    expect(propertySchema('pages').map((field) => field.key)).toContain(
      'wrapperClassName',
    );
    expect(propertySchema('pages').map((field) => field.key)).not.toContain(
      'sidebar_position',
    );
    expect(validateProperties({ last_update: {} }, 'pages')).toHaveProperty(
      'last_update',
    );
  });
  it('rejects malformed YAML and non-mapping custom metadata without coercing it', () => {
    expect(
      parsePropertyYaml(
        'pagination_prev: null\nhide_title: false\ncustom: {list: []}',
      ),
    ).toEqual({
      pagination_prev: null,
      hide_title: false,
      custom: { list: [] },
    });
    expect(() => parsePropertyYaml('title: [')).toThrow();
    expect(() => parsePropertyYaml('- not a mapping')).toThrow();
    expect(() => parsePropertyYaml('title: first\ntitle: second')).toThrow();
  });
  it('retains comments explicitly added in advanced YAML, including comment-only edits', () => {
    const doc = splitFrontmatter('---\ntitle: Original\n---\nBody');
    const next = parsePropertyYaml(
      "# new comment\ntitle: 'Original' # retained\n",
    );
    expect(joinFrontmatter(doc, next, doc.body)).toBe(
      "---\n# new comment\ntitle: 'Original' # retained\n---\nBody",
    );
  });
});
