import { normalizePath } from '../utils/paths.js';

// ponytail: regex test detection in worktree diff; add AST-based assertion validator in v2

export interface TestImmutabilityResult {
  valid: boolean;
  violations: string[];
  newTestFiles: string[];
}

/**
 * Checks git diff --name-status output against baseline protected test files.
 * Rejects any modifications (M), deletions (D), or renames (R) to baseline test files.
 * Allows newly added test files (A) and tracks them in newTestFiles.
 */
export function checkTestImmutability(
  nameStatusDiff: string,
  initialProtectedFiles: string[]
): TestImmutabilityResult {
  const normalizedInitial = new Set(
    initialProtectedFiles.map((p) => normalizePath(p).toLowerCase())
  );
  const violations: string[] = [];
  const newTestFiles: string[] = [];

  const lines = nameStatusDiff.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const parts = line.split('\t');
    const status = parts[0];
    if (!status || parts.length < 2) continue;

    // Handle standard status (M, D, A) vs rename (R100 oldPath newPath)
    const affectedPaths = status.startsWith('R') && parts.length >= 3
      ? [parts[1], parts[2]]
      : [parts[1]];

    let touchedBaseline = false;
    for (const rawPath of affectedPaths) {
      const normalized = normalizePath(rawPath).toLowerCase();
      const isBaseline = Array.from(normalizedInitial).some(
        (init) => init === normalized || init.endsWith('/' + normalized) || normalized.endsWith('/' + init)
      );
      if (isBaseline) {
        touchedBaseline = true;
        break;
      }
    }

    if (touchedBaseline) {
      if (status.startsWith('M') || status.startsWith('D') || status.startsWith('R')) {
        violations.push(`Modified protected baseline test: [${status}] ${parts.slice(1).join(' -> ')}`);
      }
    } else {
      const pathsToCheck = status.startsWith('R') && parts.length >= 3 ? [parts[2]] : affectedPaths;
      for (const rawPath of pathsToCheck) {
        if (/\.(test|spec)\.(ts|js|tsx|jsx)$/i.test(rawPath)) {
          if (status.startsWith('A') || status.startsWith('R')) {
            newTestFiles.push(rawPath);
          }
        }
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    newTestFiles,
  };
}

/**
 * Checks whether the test file content contains valid assertion statements (expect or assert).
 * Prevents empty or dummy test file generation.
 */
export function hasValidAssertions(content: string): boolean {
  return /\b(expect|assert)\s*\(|assert\.[a-zA-Z]+/i.test(content);
}
