export function parseFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  if (!raw.startsWith('---')) return { frontmatter: {}, body: raw };
  const close = raw.indexOf('\n---', 3);
  if (close < 0) return { frontmatter: {}, body: raw };
  const header = raw.slice(4, close).split('\n');
  const frontmatter: Record<string, unknown> = {};
  for (const line of header) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!key) continue;
    frontmatter[key] = parseScalar(value);
  }
  return { frontmatter, body: raw.slice(close + 4).replace(/^\n/, '') };
}

function parseScalar(value: string): unknown {
  if (value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function scalarToYaml(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string' && /^[\w./:@+-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

export function stringifyMarkdown(frontmatter: Record<string, unknown>, body: string): string {
  const entries = Object.entries(frontmatter);
  if (entries.length === 0) return body;
  return `---\n${entries
    .map(([key, value]) => `${key}: ${scalarToYaml(value)}`)
    .join('\n')}\n---\n\n${body}`;
}

export function markdownToHtml(markdown: string): string {
  return markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^```([\w-]*)\n([\s\S]*?)```$/gm, '<pre><code>$2</code></pre>')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^- \[ \] (.*)$/gm, '<li data-type="taskItem" data-checked="false">$1</li>')
    .replace(/^- \[x\] (.*)$/gim, '<li data-type="taskItem" data-checked="true">$1</li>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .split(/\n{2,}/)
    .map((block) =>
      block.startsWith('<h') || block.startsWith('<pre') || block.startsWith('<li')
        ? block
        : `<p>${block.replace(/\n/g, '<br>')}</p>`,
    )
    .join('');
}

export function htmlToMarkdown(html: string): string {
  const element = document.createElement('div');
  element.innerHTML = html;
  return Array.from(element.childNodes).map(nodeToMarkdown).filter(Boolean).join('\n\n');
}

function nodeToMarkdown(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.trim() || '';
  const element = node as HTMLElement;
  const content = Array.from(element.childNodes).map(nodeToMarkdown).join('').trim();
  switch (element.tagName.toLowerCase()) {
    case 'h1':
      return `# ${content}`;
    case 'h2':
      return `## ${content}`;
    case 'h3':
      return `### ${content}`;
    case 'strong':
      return `**${content}**`;
    case 'em':
      return `*${content}*`;
    case 'li':
      return `- [${element.dataset.checked === 'true' ? 'x' : ' '}] ${content}`;
    case 'pre':
      return `\`\`\`\n${element.textContent || ''}\n\`\`\``;
    case 'br':
      return '\n';
    default:
      return content;
  }
}
