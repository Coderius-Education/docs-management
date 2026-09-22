const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
module.exports = function managedManifest(context, { settings }) {
  return {
    name: 'coderius-managed-settings',
    async postBuild({ outDir }) {
      const config = context.siteConfig;
      let commit = process.env.GITHUB_SHA || null;
      if (!commit) {
        try {
          commit = execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: context.siteDir,
            encoding: 'utf8',
          }).trim();
        } catch {}
      }
      let dirty = false;
      try {
        dirty = Boolean(
          execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
            cwd: context.siteDir,
            encoding: 'utf8',
          }).trim(),
        );
      } catch {}
      if (dirty) commit = null;
      const site = Object.fromEntries(
        ['title', 'tagline', 'favicon']
          .filter((k) => config[k] !== undefined)
          .map((k) => [k, config[k]]),
      );
      for (const key of ['description', 'keywords']) {
        const tag = config.headTags?.find((tag) => tag.attributes?.name === key);
        if (tag) site[key] = tag.attributes.content;
      }
      const supported = [
        'image',
        'metadata',
        'colorMode',
        'navbar',
        'footer',
        'announcementBar',
        'docs',
        'tableOfContents',
        'prism',
      ];
      const themeConfig = Object.fromEntries(
        supported
          .filter((k) => config.themeConfig[k] !== undefined)
          .map((k) => [k, config.themeConfig[k]]),
      );
      const preset = config.presets.find((p) => Array.isArray(p) && p[0] === 'classic');
      const capabilities = {
        version: 1,
        framework: 'docusaurus',
        framework_version: '3.10.1',
        managed_homepage: true,
        settings_runtime: true,
        mermaid: false,
        math: false,
        homepage_fields: [
          'title',
          'description',
          'keywords',
          'image',
          'slug',
          'wrapperClassName',
          'noFooter',
          'fullscreen',
        ],
      };
      await fs.writeFile(
        path.join(outDir, 'effective-settings.json'),
        `${JSON.stringify({ version: 1, commit, dirty, unresolved: ['inherited_css_tokens'], capabilities, settings: { version: 1, site, themeConfig, tokens: settings.tokens, docs: Object.fromEntries(['breadcrumbs', 'showLastUpdateTime', 'showLastUpdateAuthor', 'sidebarCollapsed', 'sidebarCollapsible', 'editUrl'].map((key) => [key, preset?.[1]?.docs?.[key] ?? { breadcrumbs: true, showLastUpdateTime: false, showLastUpdateAuthor: false, sidebarCollapsed: true, sidebarCollapsible: true, editUrl: null }[key]])) }, inherited_navigation: ['/docenten', '/cursussen', '/privacy', 'https://coderius.nl'] }, null, 2)}\n`,
      );
      await fs.writeFile(
        path.join(outDir, 'authoring-capabilities.json'),
        `${JSON.stringify(capabilities, null, 2)}\n`,
      );
    },
  };
};
