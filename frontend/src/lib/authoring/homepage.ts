import { parse } from "acorn";
import { attributes, literal } from "./components";
import { parseTree, range, replaceRange, type LessonNode } from "./syntax";
export const sectionModule = "@coderius/shared/components/HomepageSections";
export const sectionLabels: Record<string, string> = {
  Hero: "Introductie",
  Section: "Tekstsectie",
  Columns: "Kolommen",
  Card: "Kaart",
  Buttons: "Knoppen",
  Button: "Knop",
  Picture: "Afbeelding",
  Divider: "Scheidingslijn",
};
export const sectionFields: Record<string, string[]> = {
  Hero: ["title", "tagline"],
  Section: ["title", "subtitle"],
  Columns: ["count"],
  Card: ["title", "href", "info"],
  Buttons: [],
  Button: ["href", "variant", "size"],
  Picture: ["src", "alt", "caption"],
  Divider: [],
};
export function sectionBindings(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const node of parseTree(source).children ?? []) {
    if (node.type !== "mdxjsEsm") continue;
    const program = parse(node.value ?? "", {
      ecmaVersion: "latest",
      sourceType: "module",
    });
    for (const statement of program.body) {
      if (
        statement.type !== "ImportDeclaration" ||
        statement.source.value !== sectionModule
      )
        continue;
      for (const spec of statement.specifiers) {
        if (spec.type !== "ImportSpecifier") continue;
        const name =
          spec.imported.type === "Identifier"
            ? spec.imported.name
            : String(spec.imported.value);
        if (Object.hasOwn(sectionLabels, name)) result[spec.local.name] = name;
      }
    }
  }
  return result;
}
export function sectionNodes(source: string) {
  return (parseTree(source).children ?? []).filter(
    (n) => n.type !== "mdxjsEsm",
  );
}
export function modelForNode(
  node: LessonNode,
  bindings: Record<string, string>,
  source: string,
) {
  const name = bindings[node.name ?? ""];
  if (!name) return null;
  const props: Record<string, string | number | boolean> = {};
  const locked: string[] = [];
  const attrs = attributes(node);
  for (const attr of attrs) {
    if (!attr.name) continue;
    const v =
      attr.value === null
        ? true
        : typeof attr.value === "string"
          ? attr.value
          : literal(attr.value?.value ?? "");
    if (
      v === undefined ||
      Array.isArray(v) ||
      attrs.filter((a) => a.name === attr.name).length > 1
    )
      locked.push(attr.name);
    else props[attr.name] = v;
  }
  if (attrs.some((a) => a.type !== "mdxJsxAttribute")) locked.push("*");
  const r = range(node),
    children = node.children ?? [];
  const bodyRange = children.length
    ? {
        from: range(children[0]).from,
        to: range(children[children.length - 1]).to,
      }
    : undefined;
  return {
    name,
    props,
    locked,
    node,
    range: r,
    bodyRange,
    body: bodyRange ? source.slice(bodyRange.from, bodyRange.to) : "",
  };
}
export function sectionModel(source: string, index: number) {
  const node = sectionNodes(source)[index];
  return node ? modelForNode(node, sectionBindings(source), source) : null;
}
export function changeSection(
  source: string,
  index: number,
  prop: string,
  value: string | number | boolean | undefined,
) {
  const model = sectionModel(source, index);
  if (!model || model.locked.includes("*") || model.locked.includes(prop))
    throw new Error("Deze waarde bevat broncode.");
  const attr = attributes(model.node).find((a) => a.name === prop);
  const text = value === undefined ? "" : `${prop}={${JSON.stringify(value)}}`;
  if (attr) return replaceRange(source, range(attr), text);
  const start = model.range.from + 1 + model.node.name!.length;
  return replaceRange(source, { from: start, to: start }, ` ${text}`);
}
export function replaceSectionBody(
  source: string,
  index: number,
  body: string,
) {
  const model = sectionModel(source, index);
  if (!model?.bodyRange)
    throw new Error("Open de broncode om inhoud toe te voegen.");
  return replaceRange(source, model.bodyRange, body.trim());
}
export function moveSection(source: string, index: number, direction: -1 | 1) {
  const nodes = sectionNodes(source),
    other = index + direction;
  if (other < 0 || other >= nodes.length) return source;
  const a = range(nodes[Math.min(index, other)]),
    b = range(nodes[Math.max(index, other)]);
  return replaceRange(
    source,
    { from: a.from, to: b.to },
    source.slice(b.from, b.to) +
      source.slice(a.to, b.from) +
      source.slice(a.from, a.to),
  );
}
export function duplicateSection(source: string, index: number) {
  const r = range(sectionNodes(source)[index]);
  return replaceRange(
    source,
    { from: r.to, to: r.to },
    `\n\n${source.slice(r.from, r.to)}`,
  );
}
export function removeSection(source: string, index: number) {
  return replaceRange(source, range(sectionNodes(source)[index]), "");
}
export function addSection(source: string, name: string) {
  if (!Object.hasOwn(sectionLabels, name)) throw new Error("Onbekende sectie");
  const bindings = sectionBindings(source);
  let local = Object.keys(bindings).find((key) => bindings[key] === name),
    prefix = "";
  if (!local) {
    local = name;
    let suffix = 2;
    while (new RegExp(`\\b${local}\\b`).test(source))
      local = `${name}${suffix++}`;
    prefix = `import { ${name}${local === name ? "" : ` as ${local}`} } from '${sectionModule}';\n\n`;
  }
  const props: Record<string, string> = {
    Hero: ' title="Welkom"',
    Section: ' title="Nieuwe sectie"',
    Columns: " count={2}",
    Card: ' title="Nieuwe kaart"',
    Button: ' href="/"',
    Picture: ' src="/img/logo.svg" alt="Beschrijving"',
  };
  const selfClosing = name === "Picture" || name === "Divider";
  const body =
    name === "Button"
      ? "Lees verder"
      : name === "Columns"
        ? "Kolom 1\n\nKolom 2"
        : "Schrijf hier je tekst.";
  return (
    prefix +
    source.trimEnd() +
    `\n\n<${local}${props[name] ?? ""}${selfClosing ? " />" : `>\n\n${body}\n\n</${local}>`}\n`
  );
}

/** Insert into the selected parent's own source range, including self-closing JSX. */
export function insertSectionInParent(source:string,parent:LessonNode,name:string) {
 const added=addSection(source,name);
 const nodes=parseTree(added).children!;
 const last=range(nodes[nodes.length-1]);
 const snippet=added.slice(last.from,last.to);
 const prefixSize=added.indexOf(source.trimEnd());
 const original=range(parent);
 const target={from:original.from+prefixSize,to:original.to+prefixSize};
 const raw=added.slice(target.from,target.to);
 const without=replaceRange(added,last,'');
 const closing=`</${parent.name}>`;
 const close=raw.lastIndexOf(closing);
 if(close>=0)return replaceRange(without,{from:target.from+close,to:target.from+close},`\n\n${snippet}\n\n`);
 if(/\/>\s*$/.test(raw))return replaceRange(without,target,raw.replace(/\/>\s*$/,`>\n\n${snippet}\n\n${closing}`));
 throw new Error('Dit onderdeel kan geen secties bevatten.');
}
