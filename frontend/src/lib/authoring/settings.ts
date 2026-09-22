export interface SiteSettings extends Record<string, unknown> {
  version: 1;
  site: Record<string, unknown>;
  themeConfig: Record<string, unknown>;
  tokens: Record<string, unknown>;
  docs: Record<string, unknown>;
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function parseSettings(source: string): SiteSettings {
  const v: unknown = JSON.parse(source);
  if (!object(v) || v.version !== 1)
    throw new Error("Gebruik een instellingenobject met version: 1.");
  for (const k of ["site", "themeConfig", "tokens", "docs"])
    if (v[k] !== undefined && !object(v[k]))
      throw new Error(`${k} moet een object zijn.`);
  return {
    site: {},
    themeConfig: {},
    tokens: {},
    docs: {},
    ...v,
  } as SiteSettings;
}
export function readSetting(
  value: Record<string, unknown>,
  path: string,
): unknown {
  return path
    .split(".")
    .reduce<unknown>((obj, key) => (object(obj) ? obj[key] : undefined), value);
}
export function changeSetting<T extends Record<string, unknown>>(
  value: T,
  path: string,
  next: unknown,
): T {
  const clone = structuredClone(value);
  const parts = path.split(".");
  let at: Record<string, unknown> = clone;
  for (const part of parts.slice(0, -1)) {
    if (["__proto__", "constructor", "prototype"].includes(part))
      throw new Error("Ongeldige sleutel");
    if (!object(at[part])) at[part] = {};
    at = at[part] as Record<string, unknown>;
  }
  const key = parts[parts.length - 1];
  if (["__proto__", "constructor", "prototype"].includes(key))
    throw new Error("Ongeldige sleutel");
  if (next === undefined) delete at[key];
  else at[key] = next;
  return clone;
}
