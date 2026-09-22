# Docusaurus managed authoring integration

This directory contains the reviewed patch for the sibling `docs` repository,
which pins Docusaurus 3.10.1. `files/` mirrors repository paths; it is executable
runtime code, not a management-only preview. It excludes the Svelte `home` site.

## Applying the migration

```sh
python3 integrations/docusaurus/apply.py ../docs
# Switch the docs checkout to a feature branch before applying.
python3 integrations/docusaurus/apply.py ../docs --apply
```

The preview lists every affected file. The apply command checks all source
hashes before writing, rejects changed/unrecognized homepages and duplicate root
routes, and refuses main/master. Identical reapplication is allowed. It never
commits, pushes, or merges. Commit the wrapper/content/runtime changes together.
`baseline.json` records the inspected source commit and original hashes;
`originals/` preserves the 13 input homepages for migration verification.
`docs-authoring.patch` is the equivalent Git patch. A changed source must be
reviewed and migrated explicitly; there is no arbitrary React conversion.

`prepare.py` regenerates known homepage conversions from bundled originals.
`refresh_patch.py ../docs` regenerates the patch against the recorded source
commit, never against potentially edited working files.

## Published rendering contract

Each course has exactly one root route: the existing `src/pages/index.tsx`
(`index.js` for DVWA). It imports `Content, {frontMatter}` from
`src/content/homepage.mdx` and renders
`<ManagedHomepage Content={Content} frontMatter={frontMatter} />`.
Content outside `src/pages` does not create a second route. The wrapper uses the
Docusaurus MDX provider so Markdown links, code blocks and theme components work.

Supported homepage frontmatter is `title`, `description`, `keywords` (string
array), `image`, `slug` (only `/`), `wrapperClassName`, `noFooter` and `fullscreen`.
Omitted title and description inherit site title and tagline. Draft and unlisted
are not supported for managed homepages; standalone Markdown pages retain native
Docusaurus behavior. The capabilities manifest lists the precise homepage fields.

Named exports from `@coderius/shared/components/HomepageSections`:

| Component | Scalar properties | Children |
| --- | --- | --- |
| `Hero` | `title`, `tagline`, `variant`: default/compact/plain | Markdown or buttons; omitted title/tagline inherit site config |
| `Section` | `title`, `subtitle` | Markdown or nested blocks |
| `Columns` | `count`: 1–4 | Cards or nested blocks |
| `Card` | `title`, `href`, `info` | Markdown body |
| `Buttons` | Common layout properties | Buttons |
| `Button` | `href`, `variant`: primary/secondary, `size`: sm/lg | Label |
| `Picture` | `src`, `alt`, `caption` | — |
| `Divider` | Common layout properties | — |

Common properties (except `Button`) are `width`: full/wide/normal/narrow;
`spacing`: none/small/normal/large; `align`: left/center/right; `background`:
transparent/muted/primary. Props remain static scalars; text bodies remain MDX.
Unknown MDX and interactive components remain ordinary imports in the source.
Algorithms keeps `AlgorithmGrid`; didactiek keeps `TipZoeker`; IDE keeps
`ProjectEditor height="100%"` with fullscreen and no footer.

## Settings consumption

`site-settings.json` has `{version:1, site:{}, themeConfig:{}, tokens:{}, docs:{}}`.
The shared factory loads it from the Docusaurus site's working directory, merges
shared defaults → original course configuration → explicit settings, preserves
absent properties, and replaces explicitly supplied arrays. Shared navigation
policy adds the course dropdown, teachers/privacy/home links, and default license
without duplicate entries across repeated builds. Reset removes overrides and
restores the original course configuration.

`site.image` maps to the classic theme social image; keywords arrays become SEO
meta text. String Prism themes resolve to installed `prism-react-renderer` themes.
The managed `docs` object overrides supported classic docs plugin options. TOC
heading bounds are validated after merging, so a partial override is checked
against the actual shared/course counterpart rather than an invented default.

CSS tokens are mode maps: `tokens.light` and `tokens.dark`. Only the backend's
allowed colors, font stacks and sizes are accepted. CSS is generated into
`src/css/managed-theme.css` and loaded after shared and course styles. Hex primary
colors derive six shade tokens with the same deterministic formula as the API;
explicit shade overrides win. No overrides means no generated token declarations.

The build emits public `effective-settings.json` and
`authoring-capabilities.json`. Only supported configuration is exposed. Dirty
local builds report `commit:null` and `dirty:true`; clean/CI builds identify the
commit. Inherited CSS token values are explicitly unresolved: the manifest gives
managed token overrides and does not claim to parse arbitrary shared/course CSS.
Mermaid/math remain false because these course builds do not enable those plugins.

## Verification

```sh
node integrations/docusaurus/tests/settings.test.cjs
node integrations/docusaurus/tests/migration.test.cjs
# Against the installed docs runtime:
node integrations/docusaurus/tests/factory.test.cjs
python3 integrations/docusaurus/tests/apply_test.py
# Uses an installed docs checkout, modifies temporary settings, always restores:
python3 integrations/docusaurus/tests/build-settings.py ../docs
python3 integrations/docusaurus/tests/build-homepage.py ../docs
# Starts local servers and Chromium; optionally set CHROMIUM_PATH:
node integrations/docusaurus/tests/browser.cjs
```

In the docs checkout run the full CI checks: `pnpm lint`, `pnpm typecheck`,
`pnpm test`, and per-site production builds. Checking only selected packages
does not cover the repository-wide Biome formatting and import rules. `browser.cjs` checks the actual production homepages for hydration,
algorithm links, tip search, IDE sizing/footer, card information, and mobile
horizontal overflow. See `VERIFICATION.md` for the execution record and limits.
