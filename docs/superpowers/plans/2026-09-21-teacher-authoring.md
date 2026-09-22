# Teacher Authoring Implementation Plan

> Execution: inline in this session, following the user's “Approved, go ahead”. Use executing-plans and test-driven-development; obtain a fresh final code review.

**Goal:** Teachers can edit lesson prose and supported blocks without losing MDX, save repeatedly, and recover drafts.
**Architecture:** Keep the Markdown source canonical. Parse source ranges into visual Markdown regions, containers, registered components, and preserved source blocks. Replace only edited ranges. Share syntax-aware parsing with a non-evaluating preview.
**Tech Stack:** React 18, Mantine 7, Milkdown 7, MDX 3, Vitest, Playwright.
**Spec:** ../specs/2026-09-21-teacher-authoring-design.md

## Global Constraints

- Preserve unsupported MDX and untouched frontmatter verbatim.
- Keep source editing available; do not execute arbitrary lesson expressions in admin.
- Offer CodeExercise on Python, PyRunner on algorithms, and TryButton on Play.
- Use persisted image references only; repository file upload is outside this delivery.
- Never silently overwrite remote conflicts or changes made during save.

## Review Focus

- Source ranges must remain current after nested edits and external source changes (task 1/2).
- Expressions, aliases, unknown props, and code metadata must survive adjacent edits (task 1).
- Initialization/unmount and view switches must not emit stale changes (task 2).
- Repeated saves and in-flight edits must retain current text and correct SHA (task 4).
- Recovery/navigation must distinguish user, course, branch, and path (task 4/5).

## Tasks

- [x] 1. Source preservation and component registry.
  Create `frontend/src/lib/authoring/document.ts`, `components.ts`, `assets.ts` and tests. Expose parseLesson(source), replaceRange(source, range, replacement), component model/update and insertion helpers. Tests assert exact unknown-source preservation, nested ranges, alias-aware imports, static-literal configuration, escaped code, code metadata, invalid input, and persistent asset resolution. Run `pnpm test` red then green.
- [x] 2. Visual lesson composer.
  Add LessonEditor and block forms under `frontend/src/components/editor/`; fix WysiwygEditor lifecycle and controlled updates. Consume task 1 ranges; emit complete current source via onChange. Preserve nested unsupported regions. Add accessible insertion and URL image controls. Browser-test disappearing snippets, callouts, component forms, source switches, and exactly one mounted editor per region.
- [x] 3. Honest static preview.
  Replace regex-based evaluation with a syntax-aware static renderer using task 1's parsed tree. Cover fenced imports, multiline ESM, dynamic/unknown component placeholders, asset context, callout/details styling, stale/error state, and navigation-safe links. Add rendering tests; run `pnpm test` red then green.
- [x] 4. Session, recovery, and save continuity.
  Update EditorPage, SaveModal, API hook source-branch argument, and router navigation blocking. Key session initialization by site/path/ref. Keep saved snapshot+SHA+branch separate from current content. Add user-scoped local recovery and error/loading UI. Browser-test repeated saves, conflict retention, edits during save, route changes, recovery and discard.
- [x] 5. Creation and metadata usability.
  Update NewPageModal, FrontmatterForm, SiteBrowser and editor styles. Validate title/slug/collision, encode query parameters, offer blank/exercise templates, readable Dutch labels, and responsive edit/preview tabs. Unit-test creation helpers; browser-test phone/desktop, keyboard labels, and dark mode.
- [x] 6. Verify and review.
  Run the full frontend tests, production build, and mocked-API Playwright flows. Add a corpus round-trip/MDX compile check against representative checked-in fixtures. Request one independent review while checking docs and changes locally; fix important findings with regressions. Record evidence and limitations in this file and the final response.

## Execution record

- Baseline: audit commit f309940; clean existing feature checkout. Work stays on the existing feature branch; no push, merge, or deployment is authorized or needed.
- Regression baseline from audit: 12 unit tests and production build passed; snippet loss reproduced in Chromium.

- Tasks 1–5 implemented: parsed source ranges, literal-only component forms, nested visual blocks, synchronous editor updates, static preview, user-scoped recovery, SHA-aware repeated saves, creation validation and responsive controls.
- Regression evidence: original browser snippet-loss and preview-import tests failed before changes; they now pass. Nested-summary whitespace and invalid-frontmatter regressions were reproduced and fixed.
- Final verification: 36 unit tests pass, `npm run lint` passes, and `npm run build` succeeds. The existing Vite large-chunk warning remains (editor chunk approximately 2.24 MB / 713 KB gzip).
- All 15 mocked-API Chromium scenarios pass, including new-page creation, repeated saves, branch adoption, conflict retention, recovery, in-flight saves, route changes, nested insertion, invalid frontmatter, mobile layout, and no-op mode switches on a real lesson. Inspected desktop and 390px dark-mode screenshots; no horizontal phone overflow.
- Real Python and Algorithms lesson fixtures pass source-preservation and MDX compile checks. This is representative coverage, not certification of every lesson or browser.
- One independent whole-change review found three important preservation edge cases: quoted summary attributes containing `>`, code supplied as a `children` prop, and nested directive fences. Added failing regression tests and fixed all three. Unclosed callouts also stay protected as source blocks.
- Scope clarification: relative source image files that require Docusaurus build transforms are shown as placeholders; static/site-root assets resolve via site or active branch-preview URLs. No upload service or live exercise execution is introduced.
