function styleTag(css: string): string {
  return `<style data-workboost-injected="theme">\n${css}\n</style>`;
}

function scriptTag(js: string, nonce?: string): string {
  const nonceAttr = nonce ? ` nonce="${nonce}"` : '';
  return `<script${nonceAttr} data-workboost-injected="runtime">\n${js}\n</script>`;
}

/**
 * Inject the WorkBoost HTML App runtime into a raw workspace HTML file:
 * Tailwind CDN + theme CSS + broker script go into <head>, Alpine.js at the
 * end of <body>. Files missing <head> or <body> still get the full runtime.
 */
export function injectHtmlAppRuntime(
  rawHtml: string,
  runtimeBundleJs: string,
  themeCss = '',
  nonce?: string,
): string {
  const nonceAttr = nonce ? ` nonce="${nonce}"` : '';
  const tailwindCdn = `<script${nonceAttr} src="https://cdn.tailwindcss.com/3.4.17"></script>`;
  const alpineCdn = `<script${nonceAttr} defer src="https://cdn.jsdelivr.net/npm/@alpinejs/csp@3.16.2/dist/cdn.min.js"></script>`;

  const headInjection = `\n${tailwindCdn}\n${themeCss ? `${styleTag(themeCss)}\n` : ''}${scriptTag(
    runtimeBundleJs,
    nonce,
  )}\n`;
  const bodyEndInjection = `\n${alpineCdn}\n`;

  let html = rawHtml;

  if (nonce) {
    html = html.replace(/<script(\s|>)/gi, (match, suffix) => `<script nonce="${nonce}"${suffix}`);
  }

  if (html.search(/<\/head\s*>/i) === -1) {
    html = `${headInjection}${html}`;
  } else {
    html = html.replace(/<\/head\s*>/i, `${headInjection}</head>`);
  }

  if (html.search(/<\/body\s*>/i) === -1) {
    html = `${html}${bodyEndInjection}`;
  } else {
    html = html.replace(/<\/body\s*>/i, `${bodyEndInjection}</body>`);
  }

  return html;
}
