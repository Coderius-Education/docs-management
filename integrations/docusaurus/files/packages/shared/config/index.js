const fs = require('node:fs');
const path = require('node:path');
const { themes: prismThemes } = require('prism-react-renderer');
const transpileShared = require('../plugins/transpile-shared');
const { plugin: mdxInspringing } = require('../plugins/mdx-inspringing');
const cursussenRoute = require('../plugins/cursussen-route');
const privacyRoute = require('../plugins/privacy-route');
const matomoPlugin = require('../plugins/matomo');
const { SITES, HOME, normalizeUrl } = require('../sites');
const { resolvePackageDir } = transpileShared;
const { loadSettings, applySettings, deepMerge } = require('./managed-settings');
const managedManifest = require('../plugins/managed-manifest');

// Alle cursussen behalve de huidige (op url gematcht). Voedt de footerkolom en
// de navbar-dropdown, zodat cross-site links uit één registry komen.
function otherSites(currentUrl) {
  const norm = normalizeUrl(currentUrl);
  return SITES.filter((s) => normalizeUrl(s.url) !== norm);
}

// Absolute paths into deze package — robuust ongeacht waar de site staat.
const SHARED_STATIC = path.join(__dirname, '..', 'static');
const SHARED_CSS = path.join(__dirname, '..', 'css', 'custom.css');

// Coderius gebruikt overal dezelfde licentie (zie org-handbook).
const CC_BY_NC =
  'Licensed under <a href="https://creativecommons.org/licenses/by-nc/4.0/deed.nl" target="_blank" rel="license noopener noreferrer">' +
  'Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)</a>.';

// Sommige gedeelde packages (zoals @coderius/editor) brengen hun eigen
// static-assets mee (bijv. de self-hosted Monaco-distributie). Elke shared
// package met een `static`-map wordt automatisch geserveerd door de site.
// Resolutie vanuit de site (process.cwd(): docusaurus draait altijd vanuit de
// site-map), want met pnpm zijn workspace-packages alleen daar zichtbaar.
function packageStaticDirs(packages) {
  const dirs = [];
  for (const name of packages) {
    const pkgDir = resolvePackageDir(name, process.cwd());
    if (!pkgDir) continue;
    const staticDir = path.join(pkgDir, 'static');
    if (fs.existsSync(staticDir)) dirs.push(staticDir);
  }
  return dirs;
}

// Dedupliceer op realpath: SHARED_STATIC en de static-map van
// @coderius/shared (via packageStaticDirs) zijn hetzelfde pad via een symlink.
function uniqueDirs(dirs) {
  const seen = new Set();
  const result = [];
  for (const dir of dirs) {
    let key = dir;
    try {
      key = fs.realpathSync(dir);
    } catch {
      // niet-bestaand pad (zoals het relatieve 'static'): gebruik zoals-is
    }
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(dir);
  }
  return result;
}

// Zet de gedeelde merk-CSS vóór de eventuele site-eigen customCss in het classic preset.
function withSharedCustomCss(presets) {
  return (presets || []).map((entry) => {
    if (!Array.isArray(entry)) return entry;
    const [name, opts] = entry;
    if (name !== 'classic' || !opts) return entry;
    const theme = { ...opts.theme };
    const existing = theme.customCss;
    const local = existing == null ? [] : Array.isArray(existing) ? existing : [existing];
    theme.customCss = [SHARED_CSS, ...local];
    return [name, { ...opts, theme }];
  });
}

/**
 * Bouwt een volledige Docusaurus-config uit de site-specifieke onderdelen plus
 * de gedeelde standaarden. Wat een site meegeeft wint; de factory zorgt voor:
 *  - gedeelde brand-assets via staticDirectories (img/favicon.ico, img/logo.svg)
 *  - gedeelde merk-CSS vóór de site-CSS
 *  - de CC BY-NC 4.0 copyright als de footer er geen heeft
 *  - transpilatie van @coderius/* workspace-componenten
 *  - static-mappen van sharedPackages worden automatisch mee-geserveerd
 *  - sensible defaults (i18n nl, onBrokenLinks throw, future.v4, prism-thema)
 *
 * Handige extra's: geef `description`/`keywords` mee i.p.v. zelf headTags te
 * schrijven.
 */
function createConfig(course = {}) {
  const managed = loadSettings(process.cwd());
  const site = managed ? applySettings(course, managed, process.cwd()) : course;
  const {
    sharedPackages = ['@coderius/shared'],
    description,
    keywords,
    headTags,
    themeConfig: siteThemeConfig,
    presets,
    plugins,
    staticDirectories,
    future,
    matomoSiteId,
    ...rest
  } = site;

  const seoTags = [];
  if (description)
    seoTags.push({ tagName: 'meta', attributes: { name: 'description', content: description } });
  if (keywords)
    seoTags.push({ tagName: 'meta', attributes: { name: 'keywords', content: keywords } });

  const themeConfig = deepMerge(
    {
      colorMode: { respectPrefersColorScheme: true },
      prism: { theme: prismThemes.github, darkTheme: prismThemes.dracula },
      // Rechter inhoudsopgave toont standaard alleen H2-koppen. Een site mag dit
      // overschrijven via themeConfig.tableOfContents.
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 2 },
    },
    siteThemeConfig || {},
  );
  // Validate only after shared defaults, course settings and managed overrides
  // have merged: a partial override must use the actual inherited other bound.
  const { minHeadingLevel, maxHeadingLevel } = themeConfig.tableOfContents || {};
  if (
    ![minHeadingLevel, maxHeadingLevel].every(
      (value) => Number.isInteger(value) && value >= 2 && value <= 6,
    )
  ) {
    throw new Error(
      'themeConfig.tableOfContents: minHeadingLevel and maxHeadingLevel must be integers between 2 and 6',
    );
  }
  if (minHeadingLevel > maxHeadingLevel) {
    throw new Error(
      `themeConfig.tableOfContents: effective minHeadingLevel (${minHeadingLevel}) must not exceed effective maxHeadingLevel (${maxHeadingLevel})`,
    );
  }
  for (const key of ['theme', 'darkTheme']) {
    const value = themeConfig.prism?.[key];
    if (typeof value === 'string') {
      if (!prismThemes[value]) throw new Error(`Unknown Prism theme ${value}`);
      themeConfig.prism[key] = prismThemes[value];
    }
  }
  const others = otherSites(rest.url);

  // Footer: zorg voor de CC-BY-NC copyright en één teruglink naar de homepage.
  // Cross-site navigatie tussen cursussen zit in de navbar-dropdown "Cursussen"
  // en op /cursussen; de footer wijst terug naar de overkoepelende coderius.nl.
  const footer = themeConfig.footer ? { ...themeConfig.footer } : { style: 'dark' };
  if (!footer.copyright) footer.copyright = CC_BY_NC;
  const footerLinks = footer.links ? [...footer.links] : [];
  const hasHomeLink = footerLinks.some((col) =>
    (col.items || []).some((item) => item.href === HOME.url),
  );
  const hasPrivacyLink = footerLinks.some((col) =>
    (col.items || []).some((item) => item.to === '/privacy'),
  );
  if (!hasHomeLink) {
    footerLinks.push({
      title: HOME.label,
      items: [
        { label: 'Home', href: HOME.url },
        ...(hasPrivacyLink ? [] : [{ label: 'Privacy', to: '/privacy' }]),
      ],
    });
  } else if (!hasPrivacyLink) {
    footerLinks.push({ title: 'Privacy', items: [{ label: 'Privacy', to: '/privacy' }] });
  }
  footer.links = footerLinks;
  themeConfig.footer = footer;

  // Navbar: één "Cursussen"-dropdown (rechts) om naar een andere cursus te
  // springen, plus een link naar het volledige overzicht op /cursussen.
  const navbar = themeConfig.navbar ? { ...themeConfig.navbar } : {};
  navbar.items = [
    ...(navbar.items || []).filter(
      (item) =>
        item.to !== '/docenten' && !(item.type === 'dropdown' && item.label === 'Cursussen'),
    ),
    // Elke site heeft een docentenhandleiding op /docenten (zie stijlgids §15).
    { to: '/docenten', label: 'Docenten', position: 'right' },
    {
      type: 'dropdown',
      label: 'Cursussen',
      position: 'right',
      items: [
        { label: `${HOME.label} (home)`, href: HOME.url },
        ...others.map((s) => ({ label: s.label, href: s.url })),
        { label: 'Alle cursussen', to: '/cursussen' },
      ],
    },
  ];
  themeConfig.navbar = navbar;

  return {
    // ---- gedeelde standaarden (site mag overschrijven via ...rest) ----
    favicon: 'img/favicon.ico',
    baseUrl: '/',
    organizationName: 'Coderius-Education',
    onBrokenLinks: 'throw',
    // v4-compat aan, en de rspack ("faster") bundler standaard uit: onze
    // transpile-plugin voor gedeelde componenten leunt op de klassieke
    // webpack-loader (utils.getJSLoader). Sites zonder gedeelde componenten
    // mogen faster weer aanzetten via future.faster.
    future: { v4: true, faster: false, ...future },
    i18n: { defaultLocale: 'nl', locales: ['nl'] },
    ...rest,
    // ---- door de factory beheerd (niet overschrijfbaar via ...rest) ----
    headTags: headTags || (seoTags.length ? seoTags : undefined),
    staticDirectories:
      staticDirectories ||
      uniqueDirs(['static', SHARED_STATIC, ...packageStaticDirs(sharedPackages)]),
    presets: withSharedCustomCss(presets),
    plugins: [
      ...(plugins || []),
      ...(managed ? [[managedManifest, { settings: managed }]] : []),
      [transpileShared, { packages: sharedPackages }],
      mdxInspringing,
      cursussenRoute,
      privacyRoute,
      [matomoPlugin, { siteId: matomoSiteId }],
    ],
    themeConfig,
  };
}

module.exports = { createConfig, prismThemes, CC_BY_NC };
