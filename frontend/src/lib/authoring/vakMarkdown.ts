// Copy of sites/home/src/lib/vakpagina/markdown.ts in the docs repo, for the
// studio preview. Same tests (vakMarkdown.test.ts) guard both: everything is
// escaped first, only a little formatting and safe links come through.

function escapeHtml(tekst: string): string {
  return tekst
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function veiligeHref(href: string): string | null {
  const schoon = href.trim();
  if (/[\s\\]/.test(schoon)) return null;
  if (/^https:\/\/[^/]/.test(schoon) || /^mailto:[^\s@]+@[^\s@]+$/.test(schoon)) return schoon;
  if (/^\/(?!\/)/.test(schoon) || schoon.startsWith('#')) return schoon;
  return null;
}

function inline(tekst: string): string {
  return escapeHtml(tekst)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_heel, label: string, href: string) => {
      const echt = href.replace(/&amp;/g, '&');
      const veilig = veiligeHref(echt);
      if (!veilig) return label;
      const extern = veilig.startsWith('https://');
      return `<a href="${escapeHtml(veilig)}"${extern ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

export function markdownNaarHtml(bron: string): string {
  const blokken = bron.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/);
  return blokken
    .filter((blok) => blok.trim())
    .map((blok) => {
      const regels = blok.split('\n');
      if (regels.every((regel) => /^\s*[-*]\s+/.test(regel))) {
        const items = regels.map((regel) => `<li>${inline(regel.replace(/^\s*[-*]\s+/, ''))}</li>`);
        return `<ul>${items.join('')}</ul>`;
      }
      return `<p>${regels.map(inline).join('<br>')}</p>`;
    })
    .join('');
}
