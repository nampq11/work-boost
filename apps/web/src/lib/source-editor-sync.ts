/**
 * Pure sync decision for the CodeMirror source editor (ADR 0009).
 * Kept free of DOM/React imports so it stays unit-testable under plain deno test.
 */
export function shouldReplaceExternally(currentDoc: string, nextValue: string): boolean {
  return currentDoc !== nextValue;
}
