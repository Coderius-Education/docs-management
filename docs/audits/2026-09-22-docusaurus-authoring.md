# Docusaurus authoring and site settings audit

Date: 2026-09-22. Status: source inspection; no product changes or runtime validation in this audit.

## Agreed scope

The user selected authoring, homepage editing, theming, and all page properties as the first release. Only Docusaurus course homepages are included. Homepage editing must support adding, removing, and reordering sections, with rich text inside sections and existing interactive tools preserved.

Blogs, translations, documentation version management, plugin management, and the Svelte `coderius.nl` homepage are separate work.

## Evidence and compatibility baseline

Inspected this management repository and the sibling `../docs` checkout. The latter pins Docusaurus **3.10.1** in `pnpm-workspace.yaml`. A local checkout establishes the inspected implementation, not the state of every remote branch. Capability discovery must read the selected branch when the feature runs.

Reference material: [document properties](https://docusaurus.io/docs/api/plugins/@docusaurus/plugin-content-docs), [standalone page properties](https://docusaurus.io/docs/api/plugins/@docusaurus/plugin-content-pages), [theme configuration](https://docusaurus.io/docs/api/themes/configuration), and [page routing](https://docusaurus.io/docs/creating-pages). Installed 3.10.1 schemas and builds must be the final compatibility check during implementation; current website documentation may change independently.

## Gaps

| Area | Current support and evidence | Missing work |
| --- | --- | --- |
| Content access | `backend/app/github/contents.py` hardcodes `sites/<site>/docs`; API paths and uploads use that boundary. | Separate, validated content scopes for standalone pages, homepage content, settings, and static assets. Preserve existing docs API defaults. |
| Homepage discovery | `PageTree.tsx` displays Markdown only. Course homepages are JavaScript/TypeScript React pages. | Dedicated homepage entry, branch-aware capability detection, content adapters, migration, visual editing, and published rendering. |
| Existing homepages | Ten sites use shared `HomepageHero`/`HomepageFeatures`; algorithms uses `AlgorithmGrid`, didactiek uses `TipZoeker`, IDE uses a fullscreen `ProjectEditor` with `noFooter`. DVWA uses `index.js`, not `index.tsx`. | Migrations for all 13 course homepages, retaining links, metadata, assets, dynamic configuration defaults, and interactive behavior. |
| Properties UI | `FrontmatterForm.tsx` exposes sidebar position, sidebar label, description, and hide-TOC only. | Typed docs/page schemas, grouped controls, nested values, validation, reset-to-default semantics, and advanced custom YAML. |
| Property serialization | `joinFrontmatter` preserves unchanged YAML verbatim; changed metadata is regenerated. Form `set()` deletes `null`; the hide-TOC control collapses explicit false into absence. | Preserve comments/unknown values while patching known properties; distinguish absent, false, null, and empty collections. |
| Visual authoring | `LessonEditor` supports common Markdown, callouts, details, images, and three site-specific exercise components. `document.ts` keeps code fences with metadata in source blocks. | Visual tabs, code titles/highlight ranges/line numbers, explicit heading IDs, and homepage layout blocks. Preserve unsupported MDX and dynamic expressions. |
| Preview | Static AST renderer; unfamiliar components are placeholders. No actual Docusaurus theme is loaded. | Preview registered homepage blocks, tabs, properties, and theme changes; retain a clear route to the real branch build for interactive components. |
| Categories/navigation | File tree and new lesson creation exist; `_category_.*`, tag definitions, navbar/footer, and sidebar configuration lack management UI. | Category and tag editors; theme navigation forms. Advanced hand-written sidebar code must remain intact. |
| Theme settings | No settings routes/API. Shared config supplies brand CSS, Prism, navbar additions, footer links, and color mode; site configs add their own values. | Per-site managed overrides, effective settings/inheritance, generated CSS, and integration into the actual config/build. |
| Additional Markdown capabilities | Mermaid, math, and live-code integration were not found in inspected shared/site config entrypoints. | Discover actual installed/enabled capabilities. Offer explicit supported enablement with matching dependencies/build config; do not present unsupported features as working. |
| Saving | Docs use GitHub Contents SHA conflict checks; `multi_file_commit` provides atomic file changes. | Expected-head checks for settings/migration transactions, draft recovery scoped by resource, and conflicts that retain local content. |
| New sites | `site_template.py` scaffolds a hardcoded React homepage. | Scaffold the same managed homepage/settings contract used by migrated sites. |

## Property coverage required

Docs properties to cover, grouped by purpose:

- Identity: `id`, `title`, `slug`, `description`.
- Sidebar: `sidebar_label`, `sidebar_position`, `sidebar_class_name`, `sidebar_key`, `sidebar_custom_props`, `displayed_sidebar`, `parse_number_prefixes`.
- Navigation: `pagination_label`, `pagination_prev`, `pagination_next`, `custom_edit_url`.
- Display: `hide_title`, `hide_table_of_contents`, `toc_min_heading_level`, `toc_max_heading_level`.
- Discovery/publication: `keywords`, `image`, `tags`, `draft`, `unlisted`, `last_update`.

Standalone Markdown pages use their own subset: title, description, keywords, image, slug, wrapper class, hide-TOC, draft, and unlisted. Do not imply docs-only properties affect standalone pages. Validate both lists against the pinned release during implementation.

The distinction between a Git draft branch and Docusaurus `draft: true` needs explicit UI language: the latter excludes a page from a production build, including a normal production-mode branch preview. Unlisted pages remain accessible by direct URL.

## Integration requirement

A management-only form cannot satisfy the request. The docs repository needs a renderer for editable homepage content and a configuration hook that consumes managed site settings. Existing JavaScript configs must not be parsed with regex or executed in the management API. Existing React applications must not be silently converted into static text.

See the [design proposal](../superpowers/specs/2026-09-22-docusaurus-authoring-design.md) for the recommended implementation boundaries and acceptance criteria.

## Implementation follow-up

The approved implementation now provides scoped content/assets, a homepage section
editor, full pinned docs/page property forms, categories/tags, code metadata,
heading IDs, tabs, and per-course theme settings. Runtime consumption and all 13
homepage migrations are included in `integrations/docusaurus` and applied to a
matching feature branch in the sibling docs checkout. See that directory's
verification record for builds and actual interactive-page browser checks.

Pinned-schema verification added standalone-page TOC bounds and `last_update`
to the properties initially listed above. Managed React homepage metadata is a
separate, explicit subset: title/description/image/keywords, fixed root slug,
wrapper class, footer visibility and fullscreen layout. Native page draft and
unlisted behavior is rejected for that wrapper instead of silently ignored.

Independent review produced regression fixes for preview scope propagation,
self-closing parent insertion, empty frontmatter, advanced YAML comment retention,
partial TOC inheritance, and settings cache consistency. This audit remains the
record of the original gaps; current operation is documented in the README.
