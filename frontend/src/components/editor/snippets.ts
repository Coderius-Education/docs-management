// Huisstijl-snippets (zie org-handbook/WRITING_STYLE_GUIDE.md).

export interface Snippet {
  label: string;
  content: string;
}

export function siteSnippets(site: string): Snippet[] {
  const snippets: Snippet[] = [
    {
      label: ':::info',
      content: ':::info\nIn deze opdracht gebruik je … (zie [sectie](/docs/...)).\n:::\n',
    },
    { label: ':::tip', content: ':::tip\n…\n:::\n' },
    { label: ':::caution', content: ':::caution\n**Let op:** …\n:::\n' },
    {
      label: 'Tip-blok',
      content:
        '<details>\n<summary>Klik hier voor een tip!</summary>\n\n…\n\n</details>\n',
    },
    {
      label: 'Oplossing-blok',
      content:
        '<details>\n<summary>Klik hier voor de oplossing!</summary>\n\n```python\n\n```\n\n</details>\n',
    },
    {
      label: 'Opdracht-skelet',
      content:
        '## Opdracht H.S.a: Titel\n\nBeschrijf in 1–2 zinnen wat de leerling maakt.\n\n' +
        '<details>\n<summary>Klik hier voor een tip!</summary>\n\n…\n\n</details>\n\n' +
        '<details>\n<summary>Klik hier voor de oplossing!</summary>\n\n```python\n\n```\n\n</details>\n',
    },
  ];

  // TryButton bestaat per site onder @site/src/components; alleen tonen waar relevant.
  if (['python', 'play'].includes(site)) {
    snippets.push(
      {
        label: 'TryButton-import',
        content: "import TryButton from '@site/src/components/CodeRunner/TryButton';\n",
      },
      {
        label: 'TryButton',
        content: '<TryButton code={`\nimport play\n\n`} />\n',
      },
    );
  }
  return snippets;
}

export function newPageTemplate(title: string, sidebarPosition: number): string {
  return `---
sidebar_position: ${sidebarPosition}
hide_table_of_contents: true
---

# ${title}

`;
}
