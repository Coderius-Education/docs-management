const fs = require('node:fs');
const path = require('node:path');
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
function deepMerge(base, overrides) {
  const result = {...base};
  for (const [key, value] of Object.entries(overrides)) {
    if (FORBIDDEN.has(key)) throw new Error(`Unsafe settings key: ${key}`);
    result[key] = isObject(value) ? deepMerge(isObject(base[key]) ? base[key] : {}, value) : value;
  }
  return result;
}
const colors = /^--ifm-(?:color-primary(?:-(?:dark|darker|darkest|light|lighter|lightest))?|background-color|font-color-base)$/;
const fonts = new Set(['--ifm-font-family-base', '--ifm-font-family-monospace']);
const sizes = new Set(['--ifm-font-size-base', '--ifm-container-width', '--ifm-container-width-xl', '--ifm-global-spacing', '--ifm-spacing-horizontal', '--ifm-global-radius', '--ifm-code-font-size']);
function deriveShades(tokens) {
  const result={...tokens};
  const primary=tokens['--ifm-color-primary'];
  if(typeof primary !== 'string' || !/^#(?:[\da-fA-F]{3}|[\da-fA-F]{6})$/.test(primary)) return result;
  const hex=primary.length===4 ? [...primary.slice(1)].map(c=>c+c).join('') : primary.slice(1);
  const rgb=[0,2,4].map(offset=>parseInt(hex.slice(offset,offset+2),16));
  for(const [suffix,factor] of Object.entries({dark:.9,darker:.85,darkest:.7,light:1.1,lighter:1.15,lightest:1.3})) {
    const name=`--ifm-color-primary-${suffix}`;
    if(!(name in result)) result[name]='#'+rgb.map(value=>Math.min(255,Math.floor(value*factor+.5)).toString(16).padStart(2,'0')).join('');
  }
  return result;
}
function renderCss(tokens = {}) {
  if (!isObject(tokens) || Object.keys(tokens).some(key => !['light', 'dark'].includes(key))) throw new Error('Invalid token modes');
  let css = '/* Generated from site-settings.json. */\n';
  for (const mode of ['light', 'dark']) {
    const values=tokens[mode];
    if (values === undefined) continue;
    if (!isObject(values)) throw new Error('Invalid tokens');
    if (Object.keys(values).length === 0) continue;
    const declarations = Object.entries(deriveShades(values)).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, value]) => {
      if ((typeof value !== 'string' || value.length > 300)) throw new Error(`Invalid token ${name}`);
      const valid = colors.test(name) ? /^(?:#[\da-fA-F]{3,4}|#[\da-fA-F]{6}|#[\da-fA-F]{8}|(?:rgb|rgba|hsl|hsla)\([\d.,% +\-/]+\))$/.test(value)
        : fonts.has(name) ? /^[a-zA-Z0-9 ,'"-]+$/.test(value)
        : sizes.has(name) && /^(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%)$/.test(value);
      if (!valid) throw new Error(`Invalid token ${name}`);
      return `  ${name}: ${value};`;
    });
    css += `${mode === 'light' ? ':root' : '[data-theme="dark"]'} {\n${declarations.join('\n')}\n}\n`;
  }
  return css;
}
function validate(settings) {
  if (!isObject(settings) || settings.version !== 1) throw new Error('Unsupported site-settings version');
  for (const key of Object.keys(settings)) if (!['version','site','themeConfig','tokens','docs'].includes(key)) throw new Error(`Unknown settings group ${key}`);
  for (const key of ['site','themeConfig','tokens','docs']) if (!isObject(settings[key])) throw new Error(`Invalid ${key} settings`);
  const allowedSite = new Set(['title','tagline','description','keywords','favicon','image']);
  for (const key of Object.keys(settings.site)) if (!allowedSite.has(key)) throw new Error(`Unsupported site property ${key}`);
  renderCss(settings.tokens);
  // Traverse unknown advanced settings too: reject prototype pollution at any depth.
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if(isObject(v)) for(const [k,x] of Object.entries(v)) { if(FORBIDDEN.has(k)) throw new Error(`Unsafe settings key ${k}`); walk(x); } };
  walk(settings);
  return settings;
}
function applySettings(config, raw, siteDir) {
  const settings = validate(raw);
  const {image, ...site} = settings.site;
  if (Array.isArray(site.keywords)) site.keywords = site.keywords.join(', ');
  const result = deepMerge(config, site);
  result.themeConfig = deepMerge(config.themeConfig || {}, settings.themeConfig);
  if (image !== undefined) result.themeConfig.image = image;
  result.presets = (config.presets || []).map(entry => {
    if (!Array.isArray(entry) || entry[0] !== 'classic') return entry;
    const opts = {...entry[1]};
    if (opts.docs !== false) opts.docs = deepMerge(opts.docs || {}, settings.docs);
    const existing = opts.theme?.customCss;
    const css = existing == null ? [] : Array.isArray(existing) ? existing : [existing];
    opts.theme = {...opts.theme, customCss:[...css.filter(p => p !== path.join(siteDir,'src/css/managed-theme.css')),path.join(siteDir,'src/css/managed-theme.css')]};
    return [entry[0],opts];
  });
  return result;
}
function loadSettings(siteDir) {
  const filename = path.join(siteDir, 'site-settings.json');
  if (!fs.existsSync(filename)) return null;
  const settings = validate(JSON.parse(fs.readFileSync(filename, 'utf8')));
  const cssPath = path.join(siteDir,'src/css/managed-theme.css');
  fs.mkdirSync(path.dirname(cssPath),{recursive:true});
  const css=renderCss(settings.tokens);
  if(!fs.existsSync(cssPath) || fs.readFileSync(cssPath,'utf8')!==css) fs.writeFileSync(cssPath,css);
  return settings;
}
module.exports = {deriveShades, deepMerge, renderCss, validate, applySettings, loadSettings};
