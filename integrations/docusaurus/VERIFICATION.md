# Runtime verification — 2026-09-22

The patch was applied on sibling docs branch `feat/docusaurus-authoring` after
source-hash verification. Existing untracked `FINDINGS.md` was left untouched.
No remote push or merge was performed.

- Settings unit tests: recursive merge, absent/null/false, arrays, reset, CSS
  validation/order, SEO conversion, derived shades.
- Migration tests: all 13 wrappers/content pairs; every original feature/CTA
  text, link, heading, subheading, info string and layout title/description;
  all three interactive imports; IDE noFooter/fullscreen/100% height.
- Effective TOC regression tests: course max 6 plus managed min 4 succeeds;
  shared max 2 plus managed min 3 fails with both resolved values in the error;
  noninteger/out-of-range effective bounds fail.
- Apply guard tests: identical reapply, reject changed source, reject duplicate
  homepage route.
- New-site scaffold test: managed wrapper/content/settings/CSS/capabilities.
- Actual docs suite: **117 test files, 1365 tests passed**.
- Actual Docusaurus production builds passed for **algorithms, ctf, didactiek,
  dvwa, editor, embedded, fullstack, godot, ide, play, python, robotica, web**.
- Shared runtime plus Python and IDE typechecks passed. A missing MDX named-export
  declaration was found by typechecking and fixed in the shared runtime.
- Chromium checked actual built algorithms/didactiek/IDE/embedded pages: no page
  exceptions; algorithm cards; tip search empty/results; IDE fullscreen/no footer;
  card info toggles; 390px viewport overflow checks. Screenshots captured in `/tmp`.
- The exact MDX emitted by the management editor, including all eight block types
  and escaped quotes/angle brackets/braces, passed a real production build; its
  original homepage was restored and rebuilt afterward.
- Backend/runtime CSS output matched byte-for-byte for light/dark tokens, fonts,
  fractional sizes and derived primary shades.
- A temporary real settings change changed built title, navbar, keywords/social
  image, Prism themes, breadcrumbs, light/dark primary colors, fonts and derived
  shades. Settings were restored and rebuilt; inherited settings matched exactly.

Known build warnings: DVWA's existing `php-wasm` dynamic dependency warning and
Robotica links whose `#code=` fragments are interpreted as broken anchors. Both
sites build successfully. The docs test suite emits existing zip-entry cautions
for play Python files; all tests pass.

Limitations: no supported Mermaid/math enablement is claimed; no arbitrary React
migration; no managed-homepage draft/unlisted flags; inherited CSS values are
explicitly unresolved in the public settings manifest. The browser smoke test
checks the IDE application loads and preserves sizing, not every editor runner.

Logs used in this session:
`/tmp/docusaurus-authoring-final-builds.log`,
`/tmp/docusaurus-authoring-tests.log`,
`/tmp/docusaurus-authoring-final-types.log`,
`/tmp/docusaurus-authoring-settings-build.log`,
`/tmp/docusaurus-authoring-homepage-build.log`,
`/tmp/docusaurus-authoring-browser.log`.

Review correction: merged TOC validation passed a Python production rebuild
(`/tmp/docusaurus-authoring-toc-build.log`).
