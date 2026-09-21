# Teacher authoring in docs-admin

Date: 2026-09-21. Status: proposed for user review; implementation has not started.

## Intended outcome

Teachers create and maintain lessons visually. Markdown/MDX source remains available when needed. Supported interactive components have configuration forms; unsupported MDX remains unchanged. This follows the user's two confirmed preferences.

The current [audit](../../audits/2026-09-21-teacher-authoring.md) identifies content loss, incomplete visual support, preview defects, and save continuity problems. Correctness is the first delivery priority.

## Approach and alternatives

Recommended: retain the existing React/Mantine application, GitHub workflow, source editor, and Milkdown for ordinary Markdown. Add a source-preserving lesson document layer and visual controls for supported blocks. This narrows changes to the authoring subsystem and allows unsupported regions to remain intact while teachers edit adjacent text.

Alternative: replace Milkdown with MDXEditor. Its [JSX descriptors](https://mdxeditor.dev/editor/docs/jsx) and [directive editors](https://mdxeditor.dev/editor/docs/custom-directive-editors) offer useful foundations for component forms. However, migration still requires repository-specific component schemas, preservation of source text, error recovery, asset handling, and save fixes. The library's advertised syntax support does not prove lossless compatibility with this corpus.

Alternative: patch synchronization and keep MDX pages source-only. This is the smallest change, but does not satisfy the confirmed teacher workflow for existing lessons.

## Teacher workflow

1. Create a page by selecting a course, folder, title, and either a blank lesson or an exercise template. Use readable labels and show the generated filename as secondary information. Reject empty slugs and existing paths.
2. Open the visual editor by default when the document can be parsed. The primary controls are “Bewerken”, “Voorbeeld”, “Broncode”, and “Blok toevoegen”. Desktop can display editing and preview together; smaller screens show one pane at a time.
3. Add paragraphs, headings, lists, links, tables, code examples, callouts, tips, solutions, and supported course-specific components. Insertion targets the current text selection when possible, otherwise the active block, with a visible result and predictable focus.
4. Configure interactive components in an accessible dialog or panel. Required imports are managed automatically for registered components. Teachers do not insert a separate import snippet.
5. Save the lesson as a draft on a feature branch. The UI explains that saving does not publish. Continue editing after every save; offer the existing review/PR workflow as the next action. Publishing remains an explicit existing merge action.

## Document representation and preservation

The canonical document is its original source string plus a parsed view of source ranges. Parse Markdown, MDX, and directives using syntax-aware tooling already compatible with the project's MDX compiler. Do not use regexes to decide which source is an import, component, or code example.

Classify ranges as editable Markdown, supported lesson containers, supported components, or preserved source. Source-range edits replace only the region the teacher changed. Unchanged regions retain their original text. Consecutive ordinary Markdown nodes may share an editor to avoid one editor per paragraph.

Callouts and details blocks contain nested content; edits within a supported child must retain unsupported siblings verbatim. Unknown inline expressions protect their containing span or paragraph when the editor cannot safely represent them. A document parse failure keeps the full source available and offers source editing with an actionable error; it must never initialize an empty editable document over existing content.

Preservation guarantees:

- Opening, changing view, or saving without edits gives no content diff.
- Unsupported JSX, expressions, import/export statements, and unknown props remain byte-for-byte unchanged unless explicitly edited in source mode or deliberately deleted.
- Known component forms edit supported literal fields only. Dynamic expressions are displayed as source-backed values and are never evaluated or replaced with guessed defaults.
- Editing ordinary prose cannot discard code fence metadata, unknown frontmatter, or unrelated components.
- Parser/source-range state is rebuilt after source edits. Stable block identities and current callbacks prevent a later visual update from applying to an outdated source range.
- Imports are resolved by module and local alias. Reuse existing aliases and do not duplicate imports. Globally registered site components do not need new imports.

Milkdown must support controlled external updates and await initialization/cleanup. Changes caused by mounting or external synchronization must not overwrite the original document or create spurious dirty state. Each document identity includes site, path, and branch.

## Initial supported blocks

| Block | Teacher controls | Source contract |
|---|---|---|
| Callout | Type, optional title, nested lesson content | Existing Docusaurus admonition syntax, including supported title forms |
| Tip/solution | Summary label, nested lesson content | `<details>` and `<summary>` |
| Python CodeExercise | Starter/example code | Literal children of the Python site's `CodeExercise` |
| Algorithms PyRunner | Code, editable flag, rows, package list | Existing `initialCode`/children and literal props; retain untouched props |
| Play TryButton | Code and mode | Existing Play component and import path |
| Unknown MDX | Component/source label, inspect/edit-source action | Preserve original source and allow surrounding content editing |

The registry records site availability, module/import behavior, recognized literal shapes, form fields, and a static preview. The current Python site must not offer the nonexistent TryButton import. Unknown or dynamic variants of a known component use preservation behavior until their shapes are supported.

First delivery does not promise configuration forms for every component in every course. For example, DvwaLab, WokwiSimulator, and custom learning models remain preserved blocks. The registry makes subsequent support incremental.

## Preview behavior

Use parsed nodes to distinguish lesson prose, fenced examples, imports, directives, and JSX. Preserve Python/JavaScript imports inside teaching examples. Render supported Markdown and static lesson blocks with scoped course-like typography, code, table, image, details, and admonition styles.

Pass site, branch, path, and metadata to the preview. Resolve supported asset references against the appropriate site/branch context while leaving source references unchanged. Internal preview clicks must not accidentally leave an unsaved editing session.

Preview states are explicit: updating, current, and error. An error must not present old content as current. Interactive component configuration previews display code and settings; the real branch preview remains the place to execute the published component. Arbitrary source expressions are not executed inside the authenticated admin window.

Image controls initially support persisted URLs and existing site assets with alternative text. Temporary `blob:` URLs must not be accepted as publishable assets. A repository upload service is outside this first implementation; the UI must make the available image workflow clear and must not expose a nonfunctional local upload affordance.

## Draft and save continuity

Keep an explicit session baseline containing content, content SHA, branch, and document identity. A successful save updates all four and marks the exact saved snapshot clean. Edits made during a request remain dirty after that request completes. The save dialog resets for each new save attempt while retaining useful teacher inputs.

Persist a recovery copy keyed by authenticated user, site, branch, and path. On reopening, offer recovery when it differs from the server baseline. Storage failures show a nonblocking message; they never replace current content. Clear only the recovery snapshot that was successfully saved. Protect unsaved navigation and browser close; a successful save must not trigger an unnecessary leave warning.

Retain conflict detection through GitHub content SHAs. Display conflicts as recoverable actions, preserving local edits. Do not silently overwrite a newer remote version. The existing API supports selecting a source branch for branch creation; the frontend must send the branch the teacher actually edited when creating a new branch.

## Scope of changes

- Frontend editor session and document parsing/preservation modules.
- Milkdown wrapper lifecycle and synchronization.
- Visual lesson block components and site-aware registry.
- Source/preview integration and scoped responsive styles.
- NewPageModal, FrontmatterForm, SaveModal, and relevant query/cache updates.
- Audit fixtures and regression/browser tests covering real lesson syntax.

Existing material files are not batch-rewritten. Existing authentication, repository ownership, hosting, and publication permissions remain the basis of the workflow. Backend changes are limited to a demonstrated authoring requirement; a new content database or runtime execution service is not part of this design.

## Verification and release criteria

1. Reproduce the audited failures with regression tests before fixing them: disappearing snippets, stale page identity, repeated save state, preview import stripping, and unsafe image URL handling.
2. Test no-op round trips and adjacent edits using representative repository fixtures: nested details/callouts, CodeExercise templates, PyRunner props, imported aliases, globally registered components, multiline imports, unknown JSX/expressions, code metadata, CRLF, and invalid frontmatter/source.
3. Test form serialization with quotes, backticks, `${...}` text, multiline code, and dynamic expressions. Compile resulting supported examples through the project's MDX/Docusaurus-compatible pipeline.
4. Browser-test a teacher's complete create/edit/save/continue/reopen flow with mocked GitHub responses, plus failure and conflict recovery. Verify one editor instance per intended region and correct focus after insertion.
5. Exercise desktop and phone widths, light/dark themes, keyboard navigation, dialog labels, and unsaved navigation. Verify the latest text remains visible after every mode change.
6. Run the full frontend test suite and production build. Report remaining unsupported visual blocks and preview limitations explicitly. Do not claim full Docusaurus rendering parity from passing local helper tests.

Implementation should begin with the preservation/session regression tests and proceed to visual blocks and UI once that foundation is sound. This document is a reviewable design, not an implementation plan or a claim that the defects have been fixed.
