export const ALLOWED_EXTENSIONS: readonly string[] = ['.md', '.json', '.txt', '.html'];

export const SENSITIVE_SEGMENTS: ReadonlySet<string> = new Set(['..', '.env', '.git']);

export function isPathForbidden(path: string): boolean {
  const segments = path.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => SENSITIVE_SEGMENTS.has(segment))) return true;
  if (segments.at(-1) === 'config.json' && segments.at(-2) === '.workboost') return true;
  return false;
}

export function hasAllowedExtension(path: string): boolean {
  const extension = path.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';
  return ALLOWED_EXTENSIONS.includes(extension);
}

/**
 * Validate a workspace path. Returns an error message string if invalid,
 * or null if the path is safe.
 */
export function guardWorkspacePath(path: string): string | null {
  if (!path) return 'Missing required path';
  if (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)) return 'Absolute paths are forbidden';
  if (isPathForbidden(path)) return 'Path is forbidden';
  if (!hasAllowedExtension(path)) return 'File extension not allowed';
  return null;
}
