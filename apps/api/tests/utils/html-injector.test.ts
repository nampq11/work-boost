/// <reference lib="deno.ns" />

import { assertEquals } from '@std/assert';
import { injectHtmlAppRuntime } from '@work-boost/api/utils/html-injector.ts';

const RUNTIME_JS = 'console.log("broker");';
const THEME_CSS = ':root { color: black; }';

Deno.test('HTML injector - injects runtime, Tailwind, theme and Alpine into a full document', () => {
  const raw = '<!DOCTYPE html><html><head><title>A</title></head><body class="x"></body></html>';
  const out = injectHtmlAppRuntime(raw, RUNTIME_JS, THEME_CSS);

  // Theme + Tailwind + runtime injected into <head> (before the closing </head>)
  assertEquals(out.search(/<\/head\s*>/i) > out.indexOf('cdn.tailwindcss.com'), true);
  assertEquals(out.includes('cdn.tailwindcss.com'), true);
  assertEquals(out.includes(RUNTIME_JS), true);
  assertEquals(out.includes(THEME_CSS), true);
  assertEquals(out.includes('data-workboost-injected="theme"'), true);
  assertEquals(out.includes('data-workboost-injected="runtime"'), true);
  // Alpine injected at end of <body>
  assertEquals(out.includes('cdn.jsdelivr.net/npm/@alpinejs/csp'), true);
  assertEquals(out.search(/<\/body\s*>/i) > -1, true);
  assertEquals(
    out.includes('cdn.tailwindcss.com') &&
      out.indexOf('cdn.tailwindcss.com') < out.indexOf('cdn.jsdelivr.net'),
    true,
  );
});

Deno.test('HTML injector - handles document missing <head>', () => {
  const raw = '<html><body class="x">hello</body></html>';
  const out = injectHtmlAppRuntime(raw, RUNTIME_JS);
  assertEquals(out.includes(RUNTIME_JS), true);
  assertEquals(out.includes('cdn.tailwindcss.com'), true);
  assertEquals(out.includes('cdn.jsdelivr.net'), true);
});

Deno.test('HTML injector - handles document missing <body>', () => {
  const raw = '<html><head><title>B</title></head></html>';
  const out = injectHtmlAppRuntime(raw, RUNTIME_JS);
  assertEquals(out.includes(RUNTIME_JS), true);
  assertEquals(out.includes('cdn.tailwindcss.com'), true);
  assertEquals(out.includes('cdn.jsdelivr.net'), true);
});

Deno.test('HTML injector - injects into document without <head> or <body>', () => {
  const raw = '<p>just content</p>';
  const out = injectHtmlAppRuntime(raw, RUNTIME_JS);
  assertEquals(out.includes(RUNTIME_JS), true);
  assertEquals(out.includes('cdn.tailwindcss.com'), true);
  assertEquals(out.includes('cdn.jsdelivr.net'), true);
});

Deno.test('HTML injector - theme CSS is optional', () => {
  const raw = '<html><head></head><body></body></html>';
  const out = injectHtmlAppRuntime(raw, RUNTIME_JS);
  assertEquals(out.includes('data-workboost-injected="theme"'), false);
  assertEquals(out.includes(RUNTIME_JS), true);
});

Deno.test('HTML injector - injects only once for a single document', () => {
  const raw = '<html><head></head><body></body></html>';
  const out = injectHtmlAppRuntime(raw, RUNTIME_JS, THEME_CSS);
  assertEquals(out.match(/cdn\.tailwindcss\.com/g)?.length, 1);
  assertEquals(out.match(/cdn\.jsdelivr\.net\/npm\/@alpinejs\/csp/g)?.length, 1);
});

Deno.test('HTML injector - injects nonce correctly', () => {
  const raw =
    '<!DOCTYPE html><html><head><script src="old.js"></script></head><body></body></html>';
  const nonce = 'random-nonce';
  const out = injectHtmlAppRuntime(raw, RUNTIME_JS, THEME_CSS, nonce);

  // Check nonce attribute in injected scripts
  assertEquals(out.includes(`nonce="${nonce}"`), true);
  // Original script gets nonce injected
  assertEquals(out.includes(`<script nonce="${nonce}" src="old.js"></script>`), true);
});
