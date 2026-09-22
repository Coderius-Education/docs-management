# Docusaurus course authoring, homepages, and themes

Date: 2026-09-22. Status: approved by the user; implementation on a feature branch authorized.

## Outcome and agreed boundaries

Teachers can edit course homepages visually, manage all supported Docusaurus document/page properties, and change the published course theme through the management UI. Homepages have flexible sections that can be added, removed, duplicated, and reordered. Existing interactive tools remain functional components. Changes use the existing draft, preview, review, and publish workflow.

The user explicitly chose Docusaurus course sites only, excluding the Svelte `coderius.nl` site. Blogs, translation/version workflows, and general plugin/custom React management are outside this release. Compatibility targets the docs repository's pinned Docusaurus 3.10.1. The accompanying [audit](../../audits/2026-09-22-docusaurus-authoring.md) records current gaps.

## Approaches considered

1. **Recommended: MDX content with registered visual blocks and managed theme overrides.** Reuses the existing preservation-oriented editor, remains editable in Git, and supports real Docusaurus builds. Requires a small shared runtime and deliberate migration of current React homepages.
2. JSON-only page builder. Straightforward visual layout schema, but introduces a second content format and a separate rich-text renderer alongside the lesson editor.
3. Edit arbitrary React/config source through visual transformations. Preserves maximum code freedom, but arbitrary code cannot reliably round-trip through WYSIWYG controls. Keep source editing as an escape hatch rather than promising generic visual editing of executable code.

## User experience

Each supported course gains **Lessen**, **Pagina's**, **Homepage**, and **Vormgeving** navigation, retaining the current Dutch admin UI and Mantine components. The selected branch applies consistently to all views.

Homepage editing uses a section list, editing surface, section settings, and responsive preview. Section actions include add, duplicate, move up/down, and delete with undo; pointer dragging is an enhancement, not the only way to reorder. Text is edited with the existing WYSIWYG control. Supported sections are hero, rich text, image with caption/alternative text, button group, feature cards, columns, divider, and existing interactive components. Sections support named width, spacing, alignment, and background choices that map to responsive styles.

Unknown MDX remains visible as an intact source block. Interactive blocks display their name and configuration in the admin; users run them in the course preview. Saved drafts retain the existing recovery and leave-page protection. Mobile screens switch between editor/settings/preview instead of forcing cramped parallel panels.

## Content model and published rendering

Use a stable React route wrapper at `src/pages/index.tsx` (or retain the existing `.js` wrapper where appropriate) importing editable MDX from `src/content/homepage.mdx`. Keeping content outside `src/pages` avoids a second route. A shared homepage layout reads page metadata and renders registered section components. The default root URL remains `/`; a conflicting homepage slug is rejected with a clear explanation.

The MDX source is the source of truth. Section nodes have explicit registered component imports, static editable props, and Markdown children where applicable. Parse with syntax trees and modify exact ranges, extending the existing editor machinery. Dynamic expressions/imports remain unchanged unless explicitly edited in source mode. Moving blocks preserves associated imports and surrounding unknown source.

Document identity includes site, branch, scope, and path. Add an explicit content scope to tree/page/asset operations, defaulting to `docs` for backwards compatibility. Standalone pages are Markdown files under `src/pages`; managed homepage content resolves only to its known path. General React pages do not become arbitrary editable files through these APIs. Backend path validation checks the selected scope, normalized paths, extensions, and permitted roots.

## Existing homepage migration

Migrate the ten hero/features homepages with equivalent title, tagline inheritance, calls to action, feature cards, optional information text, metadata, and section headings. Retain current shared components where they already provide the desired presentation.

Provide explicit adapters for algorithms (`AlgorithmGrid`), didactiek (`TipZoeker`), and IDE (`ProjectEditor`). Preserve IDE fullscreen sizing and footer visibility through layout settings; preserve algorithm/tip search behavior through component imports. Do not rewrite these applications.

Migration creates content and its compatible wrapper in one atomic commit, retaining source in Git history. Read capabilities and source from the selected branch, require the expected branch head, and reject changed/unrecognized input instead of guessing at conversion. No two homepage routes may remain active. A migration preview lists affected files before the user saves the draft. New sites scaffold this managed format immediately.

## All page properties

Use separate schema registries for docs and standalone pages, checked against Docusaurus 3.10.1. The audit enumerates the target fields. Each field declares type, default, applicability, validator, and help text. Group controls into basic details, menu/navigation, display, publication/SEO, and advanced settings.

Support strings, finite numbers, boolean inheritance, nullable links, arrays, tag objects, sidebar custom properties, and nested last-update author/date. `pagination_prev`, `pagination_next`, and `custom_edit_url` provide automatic/custom/disabled modes. Absence, `false`, and `null` must remain distinct. Heading levels must be 2–6 with minimum no greater than maximum. Invalid values block saving with a field-specific error without destroying source.

Patch the YAML document with its syntax-tree API so unrelated properties/comments survive edits. Keep untouched frontmatter byte-for-byte. Advanced YAML supports custom keys without pretending unknown fields are validated by Docusaurus. Preserve invalid YAML for source repair and show errors. No unsupported field is silently dropped on a scope or editor-mode transition.

Expose category metadata (`_category_.json`/YAML) and tag definitions through dedicated forms. Support category label, position, collapse settings, class/custom properties, document/generated-index link configuration. Preserve unknown metadata. Hand-written sidebar modules remain intact; automatic category controls apply only where autogenerated sidebars consume them.

## Docusaurus content authoring

Extend the existing lesson editor for tab groups, tab labels/default/group settings, code titles, highlighted lines, line numbering, explicit heading IDs, and the homepage sections above. Retain current Markdown, tables, images, callouts, details, and registered exercise forms. Treat dynamically computed props as source rather than coercing them into static values.

Show Markdown capabilities from the site's actual build integration. Mermaid and math get dedicated editing/preview support only when their matching build plugins and dependencies are enabled. Supported enablement must update dependencies/configuration and pass the real build; a toggle alone does not qualify. Generic plugin installation and arbitrary live-code execution remain outside this release.

## Theme and site settings

Add versioned, schema-validated `site-settings.json` and generated `src/css/managed-theme.css` per course. The shared config factory consumes the settings at build time; no server-side evaluation of repository JavaScript is required in the management API.

Forms cover site title/tagline and SEO image/description/keywords; logo/favicon references; light/dark primary colors and derived shades; text/code font stacks; base font size; content width; spacing/radius; default color mode, switch visibility and system preference; navbar title/logo/style/position/hide-on-scroll and nested links; footer style/groups/links/copyright; announcement bar; sidebar hideability/auto-collapse; TOC levels; breadcrumbs; and Prism theme/language/highlight configuration. Advanced validated JSON covers additional serializable classic-theme settings. Do not accept executable configuration functions through JSON.

Theme settings apply per course. Existing shared brand defaults remain the baseline, existing course configuration comes next, and explicit managed settings take precedence. Omitted managed keys inherit; arrays replace only when explicitly supplied. Preserve shared privacy/license/course links according to the existing project policy, and identify those inherited entries in the UI. Avoid duplicating generated navigation entries during successive builds/saves.

Load managed CSS after existing shared/course CSS. Generate CSS from constrained typed values; do not paste arbitrary objects into stylesheet text. Preview both light/dark and mobile/desktop states. Clear overrides returns to inherited settings.

The build emits a public, nonsecret effective-settings manifest containing only the editor-supported configuration and capability/version metadata. The admin may use the matching build's manifest to display resolved inherited values, labeled with its commit. If there is no matching build, show explicit overrides and explain which inherited values await a preview build; do not invent effective values from static config guesses.

## Saving, conflicts, and assets

All writes continue using the logged-in user's GitHub token and current CSRF checks. Main stays protected. Settings and migration saves create all related files in one commit. Add expected-head validation to multi-file changes and retain non-force ref updates, preventing stale editor state from overwriting newer edits. A conflict leaves the local draft available for comparison/retry.

Reuse persistent image validation and content-addressed names. Extend uploads to scoped page assets and managed static images; ensure published URLs and editor previews resolve from the same branch. Preserve existing lesson upload behavior. Recovery keys must distinguish homepage/settings/docs/pages, including the user and branch.

## Implementation boundaries

Management repository: content scopes/capabilities/settings APIs; transaction conflict checks; expanded YAML schema/editor; homepage/sections UI; theme controls; source-preserving serializers; previews; new-site scaffold and tests.

Docs repository: shared homepage components/layout, managed config/CSS integration, capability manifest, migration of all 13 homepages, and build fixtures. Implementation is incomplete until these consumers exist and builds demonstrate the effect of editor output. The sibling checkout is outside the current writable workspace; prepare its concrete patch locally before requesting any filesystem approval needed to apply it. Publishing or merging is a separate action from preparing the code.

Implement in dependency order: content/property contract, shared runtime/settings integration, homepage migrations/editor, extended authoring/settings UI, then complete browser/build validation. These are cohesive delivery slices of this design; each must have an independently testable interface.

## Acceptance and verification

- Every course homepage opens visually; users can add, edit, duplicate, reorder, and remove sections, save twice, reload, recover a draft, and view the actual branch build.
- Existing content, links, images, metadata, dynamic title/tagline defaults, and the three interactive applications survive migration. IDE layout remains usable.
- All documented properties appropriate to each content type have typed controls and valid YAML output. Test null/false/absence, tags, nested values, comments, unknown fields, invalid YAML, and mode switching.
- Tabs and code metadata round-trip without losing imports, highlights, titles, or embedded expressions. Unsupported MDX is preserved.
- Theme edits affect built CSS, navigation, metadata, light/dark mode, and typography; resetting overrides restores inherited behavior. Repeated saves/builds do not duplicate navigation.
- Backend tests cover scope traversal, cross-site access, protected-main writes, stale head/file SHA, branch selection, and atomic migrations/settings saves.
- Browser tests cover homepage editing, theme preview, all property groups, assets, conflicts/recovery, keyboard section ordering, and desktop/mobile layouts using mocked write APIs.
- Run management frontend unit tests/build and backend tests. Run actual Docusaurus builds for every migrated course, plus focused render/browser checks for the three application homepages. A mocked preview alone does not establish published compatibility.

## Design review

Review checked the distinction between docs/page frontmatter, actual homepage implementations, source preservation, executable config boundaries, theme precedence, build consumption, and migration conflicts. The user approved this design and authorized implementation on a feature branch. The completed execution and delivery differences are recorded in the [implementation plan](../plans/2026-09-22-docusaurus-authoring.md).
