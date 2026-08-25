/**
 * Pure sync decision for the CodeMirror source editor (ADR 0009).
 * Kept free of DOM/React imports so it stays unit-testable under plain deno test.
 */
export function shouldReplaceExternally(currentDoc: string, nextValue: string): boolean {
  return currentDoc !== nextValue;
}
export function shouldApplyDeferredExternal(
  currentDoc: string,
  deferred: string | null,
  compositionStartDoc: string | null,
): deferred is string {
  if (deferred === null) return false;
  if (currentDoc === deferred) return false;
  // If the user committed text during the composition, that edit already
  // echoes into the store via onChange, so the user's text wins.
  if (compositionStartDoc !== null && currentDoc !== compositionStartDoc) return false;
  return true;
}
