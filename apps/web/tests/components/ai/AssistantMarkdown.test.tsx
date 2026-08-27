import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantMarkdown } from '../../../src/components/ai/AssistantMarkdown.tsx';

// Mock the workspace store
vi.mock('../../../src/store/workspace-store.ts', () => ({
  useWorkspaceStore: () => vi.fn(),
}));

describe('AssistantMarkdown', () => {
  it('sanitizes malicious markdown input to prevent XSS', () => {
    // When parsing `This is a [malicious link](javascript:alert(1))`
    // it gets converted into a string containing `javascript:alert(1)` by our code before DOMPurify.
    const maliciousContent =
      'This is a [malicious link](javascript:alert(1)) and a <script>alert("XSS")</script>';
    const { container } = render(<AssistantMarkdown content={maliciousContent} />);

    const htmlContent = container.innerHTML;
    // ensure no script tags
    expect(htmlContent).not.toContain('<script>');
    // ensure javascript: protocol is stripped or not present
    // DOMPurify strips the `href` attribute if it contains javascript:
    expect(htmlContent).not.toContain('href="javascript:alert(1)"');
  });

  it('preserves valid attributes for formatting', () => {
    const validContent = 'Check this file: `src/test.md`';
    const { container } = render(<AssistantMarkdown content={validContent} />);

    const htmlContent = container.innerHTML;
    // ensure custom attributes are kept
    expect(htmlContent).toContain('data-file-path');
  });
});
