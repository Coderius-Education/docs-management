# Docs-admin authoring audit

Date: 2026-09-21. Audited application: `docs-management`, commit `f9f066a`.

Implementation follow-up: the approved improvements are now implemented and locally verified. This document retains the original findings; see the [execution record](../superpowers/plans/2026-09-21-teacher-authoring.md) for changes, test results, and remaining limits.

## Verdict

The portal has a useful Markdown editor foundation, but the current implementation is not ready for teachers to reliably create and maintain the repository's existing lesson materials visually. Content synchronization, MDX coverage, preview fidelity, and save continuity need attention before cosmetic polish.

The user confirmed that teachers should primarily use visual editing, configure supported interactive components through forms, and retain Markdown/source access when needed. Unsupported MDX must remain unchanged.

## Evidence and limits

- Read the editor, preview, frontmatter, page creation, save, routing, GitHub API integration, and relevant lesson components.
- Scanned 603 `.md`/`.mdx` lesson files under `docs/sites/*/docs`. The current detection rule sends 326 (54.1%) to source mode. This describes the existing regex's behavior, not a rigorous compatibility classification.
- Source signatures occur in 403 files for `<details>` and 186 files for admonitions. Of these, 122 and 45 respectively are admitted to visual mode. These are overlapping counts and may include examples inside code fences.
- A supplementary scan excluding fenced examples found `PyRunner` in 103 files, `CodeExercise` in 24, and approximately 26 files locked to source solely by fenced examples. These counts guide prioritization; they do not establish complete syntax coverage.
- Ran the frontend test suite: 12 tests passed. All existing tests are in `frontmatter.test.ts`.
- Ran the frontend production build successfully. Vite warned about large chunks; the editor chunk is approximately 2.21 MB, 705 KB gzipped.
- Exercised the local React application in Chromium with mocked API responses. No GitHub writes or publication occurred. Reproduced disappearing snippets and observed duplicate editor instances during development initialization. This was not a live portal or cross-browser audit.
- Verified the preview's exact import-stripping expression on synthetic Python and multiline JavaScript import examples.
- A phone-sized screenshot was taken, but responsive transitions were not allowed to settle sufficiently to support a definitive mobile layout finding. Responsive recommendations below are based on code inspection and require browser acceptance tests.

## Findings

### P1 — A visual snippet can disappear on the next edit

Evidence: `frontend/src/routes/EditorPage.tsx:76`, `frontend/src/components/editor/WysiwygEditor.tsx:25`.

`insertSnippet()` changes React's body string, but the mounted Crepe instance only receives its initial value. Its next update replaces the body with its own older document.

Reproduction: open an ordinary lesson in visual mode, insert `:::tip`, then type another sentence. The preview initially contains the tip while the editor does not. After the editor/preview debounce timers expire, the tip disappears from the preview too. This risks silently omitting newly authored content from the next save.

### P1 — Document identity and save state are not reset reliably

Evidence: `frontend/src/routes/EditorPage.tsx:49`, `frontend/src/components/SaveModal.tsx:56`, `frontend/src/api/git.ts:105`.

The one-time `loaded` flag is not reset when site, path, or branch changes on the same editor route. Component state can therefore retain the previous body while route/API state identifies a different document. This is a code-level finding; a wrong-file save was not attempted.

SaveModal's `savedToBranch` persists when the dialog closes. There is no explicit editor callback to adopt the saved branch, content SHA, and new baseline. Choosing “Later” and continuing to edit can reopen the previous save-success screen instead of a new save form. Query invalidation alone does not repair the editor's one-time initialization.

### P1 — Preview removes code and misrepresents MDX

Evidence: `frontend/src/lib/mdx-preview/MdxPreview.tsx:127`.

The global line regex removes `import`/`export` lines even inside fenced teaching examples. Verified example: a Python block containing `import time` and `print(time.time())` previews only the latter statement. A multiline JavaScript import leaves its continuation lines as visible lesson text. The saved source itself is not modified by this preview transformation.

Import removal must operate on parsed MDX module nodes, not text lines. Preview failure also leaves the previous rendered content visible below the error, without clearly identifying it as stale.

### P1 — Local image insertion lacks persistent storage

Evidence: `frontend/src/components/editor/WysiwygEditor.tsx:27`; installed `@milkdown/crepe` 7.21.2, `src/core/builder.ts` upload configuration.

Crepe's default upload path uses `URL.createObjectURL()` when there is no configured upload handler. The application provides no upload handler or asset persistence flow. A local image can therefore produce a temporary browser URL that cannot serve as a published lesson asset. This is verified from the installed dependency and app configuration; a remote upload was not attempted.

### P2 — Visual mode does not cover ordinary lesson structures

Evidence: `frontend/src/lib/frontmatter.ts:69`, `frontend/src/components/editor/snippets.ts`, installed Crepe schemas.

The compatibility check recognizes only import/export lines and uppercase JSX tags. It misses lowercase HTML, directives, and expressions, and also matches code examples. In the browser, callouts displayed as directive text and `<details>/<summary>` displayed as raw tags in visual mode. Their presence must not be mistaken for a rendered, editable teaching block.

Crepe's stock code-block schema retains the language but not Docusaurus fence metadata such as titles/highlight ranges. Such metadata needs explicit preservation. The existing frontmatter tests do not exercise editor serialization.

The Python snippet menu also offers a TryButton import path that does not exist in the current Python site. Python uses CodeExercise; the Play site still has TryButton. Component availability must follow the site implementation.

### P2 — Preview is not equivalent to the published page

Evidence: `frontend/src/lib/mdx-preview/MdxPreview.tsx`, `remarkAdmonitions.tsx`, and `docs/packages/shared/config/index.js` in the sibling docs repository.

The preview has bespoke representations for BrowserOnly, TryButton, and LinuxTerminal, and generic placeholders for other components. It receives only the body: no site, branch, document path, frontmatter, or asset resolution context. Relative images and `@site/static/...` references consequently cannot resolve as Docusaurus does. The emitted admonition classes have no corresponding styles in this frontend.

The local preview should explicitly distinguish rendered static content, component configuration previews, and content requiring the real branch preview. [Docusaurus supports MDX/React](https://current.docusaurus.io/docs/markdown-features/react) and [special admonition syntax](https://current.docusaurus.io/docs/markdown-features/admonitions); a generic Markdown preview does not establish compatibility with these features.

### P2 — Authoring exposes implementation vocabulary and lacks recovery

Evidence: `FrontmatterForm.tsx`, `NewPageModal.tsx`, `SaveModal.tsx`, `EditorPage.tsx`, `Layout.tsx`.

- Metadata labels are raw keys such as `sidebar_position` and `hide_table_of_contents`.
- Insert options expose syntax instead of teaching concepts; imports and component bodies are separate actions.
- The save flow asks teachers for branch names and commit messages before showing a clear draft/review/publish progression.
- No recovery draft is maintained for ongoing body edits; session storage contains only the original new-page template.
- No leave-page protection is implemented for unsaved edits.
- The editor and preview are always presented together within a fixed viewport-height layout; responsive pane selection and usable minimum widths are not explicit.
- Whitespace-only/punctuation-only titles can yield empty slugs such as `01-.mdx`; creation lacks collision and storage-failure feedback.
- Page fetch errors have no explicit editor recovery UI and can leave a blank editing surface.

### P2 — Asynchronous editor initialization is not lifecycle-safe

Evidence: `frontend/src/components/editor/WysiwygEditor.tsx:36` and `frontend/src/main.tsx` StrictMode.

Creation and destruction promises are not coordinated. A browser run observed two `.ProseMirror` editors following reload in development. Initialization, unmount, callback freshness, and source-mode transitions need dedicated coverage. This observation does not establish duplication in production.

## Priorities and acceptance criteria

1. Prevent lost edits: synchronization, page identity, save continuity, local draft recovery, and preservation tests.
2. Add visual callouts, tips/solutions, and site-aware component forms without rewriting unsupported MDX.
3. Correct preview parsing, code examples, metadata presentation, asset resolution, and visible preview status.
4. Improve insertion, page creation, save language, keyboard interaction, and narrow-screen layout.

Success means a teacher can create a lesson, insert a tip and code exercise, change ordinary text, save, continue editing, and reload without losing content. Unknown MDX and untouched frontmatter must survive unchanged. Representative lesson files must still compile through the actual Docusaurus pipeline. Browser tests must cover mode switching, repeated saves, navigation, and desktop/mobile layouts; helper tests alone are insufficient.

See the [proposed design](../superpowers/specs/2026-09-21-teacher-authoring-design.md) for implementation scope and trade-offs. No product changes have been made as part of this audit.
