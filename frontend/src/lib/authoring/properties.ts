import YAML from 'yaml';
import { rememberFrontmatterSource } from '../frontmatter';

export type PropertyKind = 'docs' | 'pages';
export type PropertyGroup =
  'basic' | 'navigation' | 'display' | 'publication' | 'advanced';
export type PropertyType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'link'
  | 'keywords'
  | 'tags'
  | 'object'
  | 'last_update';
export interface PropertyField {
  key: string;
  label: string;
  type: PropertyType;
  group: PropertyGroup;
  help: string;
  kinds: PropertyKind[];
  default: string;
  allowEmpty?: boolean;
  heading?: boolean;
}
const both: PropertyKind[] = ['docs', 'pages'];
const docs: PropertyKind[] = ['docs'];
function field(
  key: string,
  label: string,
  type: PropertyType,
  group: PropertyGroup,
  help: string,
  kinds = both,
  extra: Partial<PropertyField> = {},
): PropertyField {
  return {
    key,
    label,
    type,
    group,
    help,
    kinds,
    default: 'Overnemen uit de site of automatisch bepalen',
    ...extra,
  };
}
// Checked against installed @docusaurus/plugin-content-{docs,pages} 3.10.1
// frontMatter.js and @docusaurus/utils-validation validationSchemas.js.
const fields: PropertyField[] = [
  field(
    'title',
    'Titel',
    'string',
    'basic',
    'Titel van de pagina; een lege titel is toegestaan.',
    both,
    { allowEmpty: true },
  ),
  field(
    'description',
    'Korte beschrijving',
    'string',
    'basic',
    'Samenvatting voor zoekmachines en gedeelde links.',
    both,
    { allowEmpty: true },
  ),
  field(
    'slug',
    'URL-pad',
    'string',
    'basic',
    'Bijvoorbeeld /introductie. Leegmaken herstelt de automatische URL.',
  ),
  field(
    'id',
    'Document-ID',
    'string',
    'basic',
    'Unieke naam binnen deze documentmap; links kunnen dit ID gebruiken.',
    docs,
  ),
  field(
    'sidebar_label',
    'Naam in menu',
    'string',
    'navigation',
    'Neemt standaard de paginatitel over.',
    docs,
  ),
  field(
    'sidebar_position',
    'Volgorde in menu',
    'number',
    'navigation',
    'Een lager getal komt eerder; decimalen zijn toegestaan.',
    docs,
  ),
  field(
    'sidebar_class_name',
    'CSS-klasse in menu',
    'string',
    'navigation',
    'Extra CSS-klasse voor dit menu-item.',
    docs,
  ),
  field(
    'sidebar_key',
    'Menusleutel',
    'string',
    'navigation',
    'Unieke sleutel voor vertaling van het menu-item.',
    docs,
  ),
  field(
    'displayed_sidebar',
    'Getoond zijmenu',
    'link',
    'navigation',
    'Automatisch, de naam van een zijmenu, of geen zijmenu.',
    docs,
  ),
  field(
    'parse_number_prefixes',
    'Nummervoorvoegsel verwerken',
    'boolean',
    'navigation',
    'Gebruik het nummer in de bestandsnaam als menupositie.',
    docs,
  ),
  field(
    'pagination_label',
    'Naam bij vorige/volgende',
    'string',
    'navigation',
    'Label onderaan aangrenzende lessen.',
    docs,
  ),
  field(
    'pagination_prev',
    'Vorige les',
    'link',
    'navigation',
    'Automatisch, een document-ID, of uitgeschakeld.',
    docs,
  ),
  field(
    'pagination_next',
    'Volgende les',
    'link',
    'navigation',
    'Automatisch, een document-ID, of uitgeschakeld.',
    docs,
  ),
  field(
    'custom_edit_url',
    'Bewerklink',
    'link',
    'navigation',
    'Automatisch, een eigen URL, of uitgeschakeld.',
    docs,
    { allowEmpty: true },
  ),
  field(
    'hide_title',
    'Titel verbergen',
    'boolean',
    'display',
    'Verberg de automatisch getoonde titel.',
    docs,
  ),
  field(
    'hide_table_of_contents',
    'Inhoudsopgave verbergen',
    'boolean',
    'display',
    'Verberg de inhoudsopgave rechts op de pagina.',
  ),
  field(
    'toc_min_heading_level',
    'Laagste kopniveau',
    'number',
    'display',
    'Eerste kopniveau in de inhoudsopgave (2–6).',
    both,
    { heading: true },
  ),
  field(
    'toc_max_heading_level',
    'Hoogste kopniveau',
    'number',
    'display',
    'Laatste kopniveau in de inhoudsopgave (2–6).',
    both,
    { heading: true },
  ),
  field(
    'wrapperClassName',
    'CSS-klasse van pagina',
    'string',
    'display',
    'Extra klasse op de pagina-omsluiting.',
    ['pages'],
  ),
  field(
    'keywords',
    'Zoekwoorden',
    'keywords',
    'publication',
    'Zoekwoorden voor de metadata van deze pagina.',
  ),
  field(
    'image',
    'Deelafbeelding',
    'string',
    'publication',
    'Relatief afbeeldingspad of volledige URL.',
  ),
  field(
    'tags',
    'Tags',
    'tags',
    'publication',
    'Tagnaam of een object met label en permalink.',
    docs,
  ),
  field(
    'draft',
    'Concept in Docusaurus',
    'boolean',
    'publication',
    'Ja sluit deze pagina uit van productiebuilds, ook van een productie-preview. Dit staat los van een Git-conceptbranch.',
  ),
  field(
    'unlisted',
    'Niet vermelden',
    'boolean',
    'publication',
    'Blijft bereikbaar via een directe URL, maar verschijnt niet in overzichten. Kan niet tegelijk een concept zijn.',
  ),
  field(
    'last_update',
    'Laatste wijziging',
    'last_update',
    'publication',
    'Overschrijf auteur en/of datum uit Git.',
  ),
  field(
    'sidebar_custom_props',
    'Aangepaste menu-eigenschappen',
    'object',
    'advanced',
    'YAML-object voor eigen zijmenucomponenten.',
    docs,
  ),
];
export function propertySchema(kind: PropertyKind = 'docs'): PropertyField[] {
  return fields.filter((entry) => entry.kinds.includes(kind));
}
export function isPropertyObject(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function parsePropertyYaml(source: string): Record<string, unknown> {
  const parsed: unknown = YAML.parse(source);
  if (parsed === null && !source.trim()) return {};
  if (!isPropertyObject(parsed))
    throw new Error('Gebruik een YAML-object met sleutels en waarden.');
  return rememberFrontmatterSource(parsed, source);
}
function validLink(value: string): boolean {
  if (/\s/.test(value)) return false;
  try {
    new URL(value, 'https://example.invalid/');
    return true;
  } catch {
    return false;
  }
}
export function validateProperties(
  value: Record<string, unknown>,
  kind: PropertyKind = 'docs',
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const entry of propertySchema(kind)) {
    const item = value[entry.key];
    if (item === undefined) continue;
    const fail = (message: string) => {
      errors[entry.key] = message;
    };
    switch (entry.type) {
      case 'string':
      case 'link':
        if (entry.type === 'link' && item === null) break;
        if (
          typeof item !== 'string' ||
          (!entry.allowEmpty && item.length === 0)
        )
          fail('Vul een tekstwaarde in.');
        else if (
          (entry.key === 'image' || entry.key === 'custom_edit_url') &&
          item &&
          !validLink(item)
        )
          fail('Vul een geldige URL of een relatief pad in.');
        break;
      case 'boolean':
        if (typeof item !== 'boolean') fail('Kies overnemen, ja of nee.');
        break;
      case 'number':
        if (typeof item !== 'number' || !Number.isFinite(item))
          fail('Vul een eindig getal in.');
        else if (
          entry.heading &&
          (!Number.isInteger(item) || item < 2 || item > 6)
        )
          fail('Kies een geheel kopniveau van 2 tot en met 6.');
        break;
      case 'keywords':
        if (
          !Array.isArray(item) ||
          item.some((word) => typeof word !== 'string' || !word)
        )
          fail('Gebruik een lijst met niet-lege zoekwoorden.');
        break;
      case 'tags':
        if (
          !Array.isArray(item) ||
          item.some(
            (tag) =>
              !(typeof tag === 'string' && tag.length > 0) &&
              !(
                isPropertyObject(tag) &&
                typeof tag.label === 'string' &&
                tag.label.length > 0 &&
                typeof tag.permalink === 'string' &&
                tag.permalink.length > 0
              ),
          )
        )
          fail('Elke tag heeft een naam of zowel label als permalink nodig.');
        break;
      case 'object':
        if (!isPropertyObject(item)) fail('Gebruik een YAML-object.');
        break;
      case 'last_update':
        if (
          !isPropertyObject(item) ||
          (item.author === undefined && item.date === undefined)
        ) {
          fail('Vul ten minste een auteur of datum in.');
          break;
        }
        if (
          item.author !== undefined &&
          (typeof item.author !== 'string' || !item.author)
        )
          errors['last_update.author'] = 'Vul een auteursnaam in.';
        if (
          item.date !== undefined &&
          ((typeof item.date !== 'string' &&
            typeof item.date !== 'number' &&
            !(item.date instanceof Date)) ||
            !Number.isFinite(new Date(item.date as string).getTime()))
        )
          errors['last_update.date'] =
            'Vul een geldige datum in, bijvoorbeeld 2026-09-22.';
        break;
    }
  }
  const min = value.toc_min_heading_level;
  const max = value.toc_max_heading_level;
  if (typeof min === 'number' && typeof max === 'number' && min > max)
    errors.toc_min_heading_level =
      'Het laagste kopniveau mag niet hoger zijn dan het hoogste.';
  if (value.draft === true && value.unlisted === true)
    errors.draft = 'Een pagina kan niet tegelijk concept en niet-vermeld zijn.';
  return errors;
}
