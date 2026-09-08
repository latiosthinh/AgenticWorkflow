import type { SimpleGit } from 'simple-git';

// ponytail: diff ceiling and dependency checks run on local worktree; add monorepo package graph scoping in v2

export interface DiffStatResult {
  filesChanged: number;
  insertions: number;
  deletions: number;
  totalLoc: number;
  rawStat: string;
}

/**
 * Calculates cumulative diff statistics between worktree and base commit using git diff --shortstat.
 */
export async function calculateCumulativeDiff(
  git: SimpleGit,
  baseCommit: string
): Promise<DiffStatResult> {
  try {
    await git.raw(['add', '-N', '.']);
  } catch {
    // Ignore error if untracked files cannot be marked intent-to-add
  }
  const rawStat = await git.raw(['diff', '--shortstat', baseCommit]);

  const filesMatch = rawStat.match(/(\d+)\s+files?\s+changed/);
  const insMatch = rawStat.match(/(\d+)\s+insertions?\(\+\)/);
  const delMatch = rawStat.match(/(\d+)\s+deletions?\(-\)/);

  const filesChanged = filesMatch ? parseInt(filesMatch[1], 10) : 0;
  const insertions = insMatch ? parseInt(insMatch[1], 10) : 0;
  const deletions = delMatch ? parseInt(delMatch[1], 10) : 0;
  const totalLoc = insertions + deletions;

  return { filesChanged, insertions, deletions, totalLoc, rawStat: rawStat.trim() };
}

/**
 * Asserts that cumulative diff changes do not exceed maxLoc ceiling (default 250 LOC).
 * Throws an error if ceiling is exceeded to abort execution.
 */
export async function assertDiffCeiling(
  git: SimpleGit,
  baseCommit: string,
  maxLoc = 250
): Promise<DiffStatResult> {
  const stat = await calculateCumulativeDiff(git, baseCommit);
  if (stat.totalLoc > maxLoc) {
    throw new Error(
      `Diff ceiling exceeded: ${stat.totalLoc} LOC changed (ceiling is <${maxLoc} LOC). Aborting implementation.`
    );
  }
  return stat;
}

/**
 * Verifies that any added dependencies in package.json are either mentioned
 * in the ticket acceptance criteria or listed in the pre-approved allowlist.
 */
export function verifyPackageDependencies(
  originalPkgJson: string,
  updatedPkgJson: string,
  ticketAcceptanceCriteria: string,
  allowlist: string[] = []
): { valid: boolean; unauthorizedPackages: string[] } {
  let original: Record<string, any> = {};
  let updated: Record<string, any> = {};

  try {
    original = JSON.parse(originalPkgJson || '{}');
  } catch {
    original = {};
  }

  try {
    updated = JSON.parse(updatedPkgJson || '{}');
  } catch {
    updated = {};
  }

  const origDeps: Record<string, string> = {
    ...original.dependencies,
    ...original.devDependencies,
  };
  const newDeps: Record<string, string> = {
    ...updated.dependencies,
    ...updated.devDependencies,
  };

  const unauthorizedPackages: string[] = [];

  for (const pkg of Object.keys(newDeps)) {
    if (!origDeps[pkg]) {
      const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const isAllowedByAc = new RegExp(
        `(^|[^a-zA-Z0-9_@/.-])${escaped}([^a-zA-Z0-9_@/.-]|$)`,
        'i'
      ).test(ticketAcceptanceCriteria);
      const isAllowlisted = allowlist.includes(pkg);
      if (!isAllowedByAc && !isAllowlisted) {
        unauthorizedPackages.push(pkg);
      }
    }
  }

  return {
    valid: unauthorizedPackages.length === 0,
    unauthorizedPackages,
  };
}
