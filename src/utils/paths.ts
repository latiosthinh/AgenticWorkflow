import path from 'node:path';

/**
 * Normalizes file path across Windows and POSIX environments.
 * Converts backslashes to forward slashes, collapses multiple consecutive slashes,
 * and strips trailing slashes (except root like "/" or "C:/").
 */
export function normalizePath(p: string): string {
  if (!p) return '';
  let normalized = p.replace(/\\/g, '/');
  normalized = normalized.replace(/\/{2,}/g, '/');
  if (normalized.length > 1 && normalized.endsWith('/')) {
    if (!/^[a-zA-Z]:\/$/.test(normalized)) {
      normalized = normalized.slice(0, -1);
    }
  }
  return normalized;
}

/**
 * Converts input text into a URL-friendly, git-branch-friendly kebab slug.
 * Lowercases, replaces non-alphanumeric chars with hyphens, trims hyphens,
 * and limits length to 40 characters.
 */
export function slugify(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}
