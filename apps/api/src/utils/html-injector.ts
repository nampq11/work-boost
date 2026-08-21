const TAILWIND_CDN = '<script src="https://cdn.tailwindcss.com/3.4.17"></script>';
const ALPINE_CDN =
  '<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.16.2/dist/cdn.min.js" integrity="sha384-hTDKg8MgHALzleab34+W1b6UpW6tektVmHXleL5Ztz8x2WFIJeaJp6ixjNBjbrDY" crossorigin="anonymous"></script>';

function styleTag(css: string): string {
  return `<style data-workboost-injected="theme">\n${css}\n</style>`;
}

function scriptTag(js: string): string {
  return `<script data-workboost-injected="runtime">\n${js}\n</script>`;
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
): string {
  const headInjection = `\n${TAILWIND_CDN}\n${themeCss ? `${styleTag(themeCss)}\n` : ''}${scriptTag(
    runtimeBundleJs,
  )}\n`;
  const bodyEndInjection = `\n${ALPINE_CDN}\n`;

  let html = rawHtml;
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
