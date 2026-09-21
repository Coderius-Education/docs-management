import { expect, it } from 'vitest';
import { resolveAsset } from './assets';

it('resolves source images on the active branch without a build', () => {
  expect(
    resolveAsset('./diagram.png', {
      site: 'python',
      path: 'folder/lesson.mdx',
      branch: 'docs/images',
    }),
  ).toBe(
    '/api/sites/python/assets?path=folder%2Fdiagram.png&ref=docs%2Fimages',
  );
  expect(
    resolveAsset('../shared/picture.jpg', {
      site: 'python',
      path: 'folder/lesson.mdx',
    }),
  ).toBe('/api/sites/python/assets?path=shared%2Fpicture.jpg&ref=main');
});

it('keeps malformed source image references from crashing the editor', () => {
  expect(
    resolveAsset('./bad%zz.png', { site: 'python', path: 'lesson.mdx' }),
  ).toBeUndefined();
});

it('preserves special characters in the lesson folder when resolving an uploaded image', () => {
  expect(
    resolveAsset('./diagram.png', {
      site: 'python',
      path: 'part#one/lesson.mdx',
      branch: 'lesson',
    }),
  ).toBe('/api/sites/python/assets?path=part%23one%2Fdiagram.png&ref=lesson');
});
