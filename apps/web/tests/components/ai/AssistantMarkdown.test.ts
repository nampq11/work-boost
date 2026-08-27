/// <reference lib="deno.ns" />

import { assertEquals } from '@std/assert';
import { renderAssistantMarkdownHtml } from '../../../src/components/ai/AssistantMarkdown.tsx';

Deno.test('AssistantMarkdown - sanitizes malicious markdown input to prevent XSS', () => {
  const maliciousContent =
    'This is a [malicious link](javascript:alert(1)) and a <script>alert("XSS")</script>';
  const htmlContent = renderAssistantMarkdownHtml(maliciousContent);

  // ensure no script tags
  assertEquals(htmlContent.includes('<script>'), false);
  // ensure javascript: protocol is stripped or not present
  assertEquals(htmlContent.includes('href="javascript:alert(1)"'), false);
});

Deno.test('AssistantMarkdown - preserves valid attributes for formatting', () => {
  const validContent = 'Check this file: `src/test.md`';
  const htmlContent = renderAssistantMarkdownHtml(validContent);

  // ensure custom attributes are kept
  assertEquals(htmlContent.includes('data-file-path'), true);
});
