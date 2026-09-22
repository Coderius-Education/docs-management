# Docusaurus Authoring Implementation Plan

> Execute the approved design on `feat/docusaurus-authoring`. Use test-driven development and independent tasks where file ownership is disjoint.

**Goal:** Visually edit course homepages, page properties, and themes with build-compatible Git-backed content.

**Architecture:** Explicit content scopes preserve existing docs APIs. Managed homepage MDX and JSON theme overrides are consumed by shared Docusaurus runtime components. The existing draft/PR workflow remains the save mechanism.

**Tech stack:** React/Mantine, Milkdown, MDX AST, YAML document API, FastAPI/Pydantic, GitHub Git Data API, Docusaurus 3.10.1.

**Spec:** `docs/superpowers/specs/2026-09-22-docusaurus-authoring-design.md` (approved).

## Global constraints

- Only Docusaurus course sites; exclude `home`.
- Preserve unsupported source and existing interactive tools.
- Main stays protected; no remote publication or merge.
- Preserve absent/null/false distinctions and unknown properties.
- Require actual runtime consumers, not management-only settings.

## Review focus

- Scope and encoded path traversal must never expose arbitrary repository writes (task 1).
- A stale branch must not overwrite another user's settings (task 1).
- Form edits must retain null, explicit false, comments and unknown nested YAML (task 2).
- Moving sections must retain unknown MDX and component imports (task 4).
- Migration must retain interactive applications and one root route (task 3).

### Task 1: Backend content and settings contract

Files: `backend/app/github/contents.py`, `assets.py`, `commits.py`; `backend/app/api/sites.py`; new `backend/app/authoring/` modules; backend tests.

Interfaces: content `scope = docs | pages | homepage | metadata`; default docs. Homepage path `homepage.mdx` resolves to `src/content/homepage.mdx`. Metadata paths limited to `_category_.json/yml/yaml` and `tags.yml/yaml` under docs. GET/PUT `/sites/{site}/settings`: `{settings, head_sha}` / `{branch, expected_head, settings, message}`. GET `/capabilities`: branch-aware managed-homepage/runtime and framework availability. Settings schema `{version:1, site:{}, themeConfig:{}, tokens:{}, docs:{}}`. Tokens use CSS variable names restricted by allowlist; values validated before CSS output.

- [x] Add tests for scoped paths, existing docs compatibility, expected-head conflicts and settings validation; run pytest and observe failures.
- [x] Implement scoped roots, asset paths, APIs, settings validation/CSS, atomic head checks.
- [x] Run backend suite and report exact API signatures to integrator.

### Task 2: Page property schema and form

Files: `frontend/src/lib/frontmatter.ts`, new `lib/authoring/properties.ts`, `components/editor/FrontmatterForm.tsx`, associated tests.

Interfaces: `FrontmatterForm({value,onChange,kind?:'docs'|'pages',onValidationChange?})`; `validateProperties(value,kind): Record<string,string>`; preserve `joinFrontmatter` signature.

- [x] Write and run failing tests for comments, null/false, nested metadata, applicability and invalid values.
- [x] Implement schema for all pinned Docusaurus fields, grouped controls and advanced YAML; patch YAML rather than regenerate it.
- [x] Run unit tests and typecheck.

### Task 3: Docusaurus runtime and migration

Files: new `integrations/docusaurus/` patch/runtime/migration resources, plus docs repository feature branch integration when filesystem access allows.

Interfaces: `@coderius/shared/components/ManagedHomepage` reads imported MDX frontmatter; `@coderius/shared/components/HomepageSections` exports `Hero`, `Section`, `Columns`, `Card`, `Buttons`, `Button`, `Picture`, `Divider`. Props are static scalars; Markdown children remain editable. `site-settings.json` shape matches task 1. Existing interactive components stay imported into homepage MDX.

- [x] Test deep merge/reset, CSS ordering, runtime settings and migration preservation against all 13 existing homepages.
- [x] Implement shared runtime, build manifest and migration tooling; prepare reviewable docs patch inside this repository before applying outside workspace.
- [x] Build migrated sites and record limitations/failures honestly.

### Task 4: Management integration and editors

Files: `frontend/src/api/{hooks,git,types}.ts`, `routes/{SiteBrowser,EditorPage}.tsx`, `components/{SaveModal,NewPageModal}.tsx`, new homepage/settings/category editors and authoring helpers.

- [x] Add tests for homepage section insertion/reorder/duplicate/delete and import preservation; run failing tests.
- [x] Thread scope through URLs, APIs, recovery, cache, save and upload paths; retain docs defaults.
- [x] Add course navigation and page creation; implement homepage blocks and responsive previews.
- [x] Add theme forms/JSON, preview, recovery, draft saving and PR actions.
- [x] Add category/tag forms, tabs and code metadata authoring.
- [x] Run unit, build and browser tests; exercise conflicts, repeated saves and mobile rendering.

### Task 5: Integration verification and branch completion

- [x] Update README and audit with actual supported behavior and requirements.
- [x] Run backend tests, frontend tests/build/browser tests and Docusaurus build checks.
- [x] Review complete diff independently; fix material findings with regression tests.
- [x] Commit verified changes on feature branches; report branches, checks and any uncompleted acceptance criteria. Do not merge/publish.

## Execution ledger

- User approved design and explicitly instructed proceeding on a feature branch. Proceed without another authorization loop.
- Feature branch created after sandbox escalation for read-only Git metadata.
- Independent implementation domains can run concurrently under the dispatching-parallel-agents skill; root owns frontend integration and overall verification.

- Backend completed scoped content/assets, capabilities, effective settings, validated theme generation, and atomic settings saves with expected-head conflicts.
- Frontend completed property forms/YAML preservation, homepage sections, standalone pages, metadata, tabs/code metadata, navigation and theme settings with recovery.
- Shared runtime and all 13 homepage migrations were applied to the sibling docs feature branch after source-hash validation; the preexisting untracked `FINDINGS.md` is excluded.
- Independent review found six correctness issues. Regression tests now cover preview asset scopes, settings cache adoption, self-closing nested insertion, empty YAML, advanced YAML comments, and inherited TOC limits.
- Final management checks: 135 backend tests, 71 frontend unit tests, 29 Chromium browser tests, TypeScript checks and production build passed. Integration checks: 12 Node tests and 3 Python migration guard tests passed.
- Docs verification: 1365 existing tests, all 13 course production builds, shared/Python/IDE typechecks, and real browser checks for the interactive homepages passed. A follow-up Python production build verified merged TOC validation. See `integrations/docusaurus/VERIFICATION.md`.

## Delivery notes

- The one-time migration is a guarded local preview/apply tool plus a reviewable Git patch, rather than an admin migration screen. It has already been applied to the matching local docs feature branch; deploy its shared runtime before the management scaffold.
- Managed homepages expose the wrapper's supported metadata. Native `draft`/`unlisted` remain available on documents/pages but are rejected on managed homepages.
- Mermaid/math plugin enablement, arbitrary React conversion, blogs, translations, version management and generic plugin management are outside this delivery. Existing unsupported MDX is preserved.
- Inherited CSS values cannot be reliably recovered from arbitrary stylesheets; the effective manifest explicitly leaves them unresolved.
- Feature branches are retained locally. No remote push, merge or deployment is part of this execution.

- Companion docs runtime committed as `076dedf` on `feat/docusaurus-authoring`. The management implementation and this execution record are committed together on the same-named management feature branch.
