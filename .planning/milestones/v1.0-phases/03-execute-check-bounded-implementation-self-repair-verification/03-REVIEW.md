---
phase: 03-execute-check-bounded-implementation-self-repair-verification
reviewed: 2026-09-08T17:40:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - src/ado/work-item.ts
  - src/db/index.ts
  - src/db/schema.ts
  - src/execute/coder.ts
  - src/execute/diff-guard.ts
  - src/execute/repair.ts
  - src/execute/worker.ts
  - src/test-runner/evidence.ts
  - src/test-runner/executor.ts
  - src/test-runner/immutability.ts
  - src/test-runner/parser.ts
  - tests/diff-ceiling.test.ts
  - tests/l3-evidence.test.ts
  - tests/repair-loop.test.ts
  - tests/test-protection.test.ts
findings:
  critical: 2
  warning: 5
  info: 5
  total: 12
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-09-08T17:40:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed 15 files across `src/` and `tests/` implemented in Phase 3. Core infrastructure delivers isolated worktree test execution, diff ceiling computation, test assertion immutability checking, and SQLite L3 evidence persistence with ADO patch updates.

Two critical defects require immediate remediation:
1. **Data loss**: `worker.ts` runs bounded implementation and test execution, records L3 evidence, and transitions to `Dev Done`, but calls `cleanupWorktree` without ever committing changes to the task branch or pushing to remote git `origin`. `commitImplementation` was created and tested in Plan 1 but omitted from `worker.ts`. When `cleanupWorktree` runs `git worktree remove --force`, all written code is permanently destroyed.
2. **Worktree resource leak**: On all four failure exits in `worker.ts` (diff ceiling exceeded, unauthorized dependencies, immutability violation, repair exhausted), the pipeline invokes `flagTicketBlocked` and returns early without calling `cleanupWorktree`. Ephemeral worktrees on disk and git worktree registrations leak on every failure.

Five warnings cover test file protection bypass for paths with spaces, hardcoded fake test counts in L3 evidence, missing assertion presence validation on newly created test files, loose substring matching in dependency verification, and silent git checkout failures during repair exhaustion.

---

## Critical Issues

### CR-01: Data Loss — Uncommitted Implementation Discarded Before Worktree Cleanup

**File:** `src/execute/worker.ts:170-195`
**Issue:** `runExecutionPipeline` executes bounded editing and test verification. On success, it persists L3 evidence to SQLite and transitions ADO work item state to `Dev Done`. However, it never invokes `commitImplementation` to stage and commit the changes on the task branch, nor does it push the branch to git `origin`. It then immediately calls `cleanupWorktree(process.cwd(), worktreeResult.worktreePath)`. `cleanupWorktree` executes `git worktree remove --force`, permanently deleting the uncommitted source files. The task branch remains at `baseCommit` with zero changes.
**Fix:**
```typescript
  // In src/execute/worker.ts, before transitionToDevDone:
  await commitImplementation(
    git,
    workItem.id,
    'feat',
    workItem.title
  );
  try {
    await git.push('origin', worktreeResult.branchName);
  } catch {
    // Ignore remote push failures in local/offline test environments
  }

  await transitionToDevDone(workItem.id, comment);
  await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
```

### CR-02: Ephemeral Worktree Directory and Git Worktree Handle Leaked on All Failure Paths

**File:** `src/execute/worker.ts:88-90, 120-126, 132-138, 161-167`
**Issue:** `runExecutionPipeline` contains four failure exit points:
- Diff ceiling exceeded (`diffStat.totalLoc > maxLoc`)
- Unauthorized package dependencies (`!pkgDiffValid`)
- Immutability violation (`!immutabilityResult.valid`)
- Repair budget exhaustion (`!repairResult.success`)
In each case, `flagTicketBlocked` is called and the function executes `return;`. Because `cleanupWorktree` is only located at line 194 (the success path), and caller `processWorkItemExecute` does not clean up on early return (only on thrown exceptions), the worktree directory `.worktrees/ticket-${workItemId}-...` and its entry in `.git/worktrees` are never removed.
**Fix:**
Wrap `runExecutionPipeline` in `try ... finally` or invoke `cleanupWorktree` before returning on failure:
```typescript
  if (diffStat.totalLoc > maxLoc) {
    const comment = formatL3EvidenceComment({ ... });
    await flagTicketBlocked(workItem.id, comment, 'diff-ceiling');
    await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
    return;
  }
```

---

## Warnings

### WR-01: Protected Baseline Test Immutability Check Bypassed for File Paths Containing Spaces

**File:** `src/test-runner/immutability.ts:28`
**Issue:** `checkTestImmutability` splits `git diff --name-status` lines with `line.split(/\s+/)`. When a baseline test file path contains spaces (e.g. `tests/user profile.test.ts`), `parts` splits into `['M', 'tests/user', 'profile.test.ts']`. `parts[1]` becomes `'tests/user'`, failing the path match against `normalizedInitial`. Modifications, deletions, and renames of baseline test files containing spaces bypass detection. Git uses tab characters (`\t`) to delimit fields in `--name-status`.
**Fix:**
```typescript
  for (const line of lines) {
    const parts = line.split('\t');
    const status = parts[0];
    if (!status || parts.length < 2) continue;
```

### WR-02: Hardcoded Verification Metrics Stored in SQLite and Posted to ADO

**File:** `src/execute/worker.ts:177-179, 186-188`
**Issue:** When persisting L3 evidence and formatting the discussion badge, `totalTests: 1, passed: 1, failed: 0` is hardcoded regardless of how many tests ran or passed. `parseVitestSummary` was implemented in `src/test-runner/parser.ts` specifically to extract real test totals and counts from stdout, but is never called in `worker.ts`.
**Fix:**
```typescript
  import { parseVitestSummary } from '../test-runner/parser.js';

  const vitestSummary = parseVitestSummary(
    repairResult.testResult?.stdout || '',
    durationMs
  );
  const totalTests = vitestSummary.totalTests || 1;
  const passed = vitestSummary.passed || (vitestSummary.failed === 0 ? totalTests : 0);
  const failed = vitestSummary.failed;

  await recordL3Evidence({
    workItemId: workItem.id,
    revId,
    testSuite: 'vitest',
    totalTests,
    passed,
    failed,
    durationMs,
    gitDiffStat: rawDiffStat,
  });
```

### WR-03: Missing Assertion Presence Verification on Newly Added Test Files (Security Threat T-3-03)

**File:** `src/execute/worker.ts:129-138`
**Issue:** Design requirement `T-3-03` stipulates that agents must not introduce empty test files to pass verification. `src/test-runner/immutability.ts` exports `hasValidAssertions`, and `checkTestImmutability` populates `newTestFiles`. However, `worker.ts` completely ignores `immutabilityResult.newTestFiles`. Empty or dummy test files lacking assertions (`expect(...)` / `assert(...)`) pass uninspected.
**Fix:**
```typescript
  for (const newTest of immutabilityResult.newTestFiles) {
    const fullPath = path.join(worktreeResult.worktreePath, newTest);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (!hasValidAssertions(content)) {
        await flagTicketBlocked(
          workItem.id,
          `<h3>[Contract Conflict] New test file lacks valid assertions: <code>${newTest}</code></h3>`,
          'contract-conflict'
        );
        await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
        return;
      }
    }
  }
```

### WR-04: Substring Match in Package Dependency Guard Permits Arbitrary Packages

**File:** `src/execute/diff-guard.ts:95`
**Issue:** `verifyPackageDependencies` checks if added packages are authorized using `acLower.includes(pkg.toLowerCase())`. Any npm package matching common English words or substrings inside the acceptance criteria (e.g. `in`, `to`, `form`, `valid`, `auth`, `react`, `or`) is treated as authorized without allowlist approval.
**Fix:**
```typescript
  const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isAllowedByAc = new RegExp(`\\b${escaped}\\b`, 'i').test(ticketAcceptanceCriteria);
```

### WR-05: Silent Checkout Failure When `wipBranch` Already Exists During Repair Exhaustion

**File:** `src/execute/repair.ts:63-67`
**Issue:** On repair exhaustion, `executeRepairLoop` checks if `wipBranch` already exists in `branches.all` and calls `git.checkout(wipBranch)`. If `wipBranch` exists from a prior execution with different committed files, `git checkout` aborts with `error: Your local changes to the following files would be overwritten by checkout`. Because the block is wrapped in `try { ... } catch { }`, the error is swallowed and the WIP commit is never created.
**Fix:**
Use `git.checkout(['-B', wipBranch])` to switch and reset the branch pointer while preserving current working tree changes:
```typescript
  await options.git.checkout(['-B', wipBranch]);
  await options.git.add('.');
  const status = await options.git.status();
  if (status.staged.length > 0 || !status.isClean()) {
    await options.git.commit(
      `wip: repair budget exhausted for ticket ${options.workItemId}\n\nAB#${options.workItemId}`
    );
  }
```

---

## Info

### IN-01: Contradictory Success Footer in `formatL3EvidenceComment` on Verification Failure

**File:** `src/test-runner/evidence.ts:45`
**Issue:** When `failed > 0` (e.g. during diff ceiling violation in `worker.ts:80`), `formatL3EvidenceComment` displays header `### [L3 Evidence] Functional Verification: FAILED`, but the footer hardcodes `*All unit tests executed and passed within isolated worktree sandbox.*`.
**Fix:** Make the footer text conditional:
```typescript
  const footerNote = evidence.failed > 0
    ? '*Unit test verification failed or encountered violations within isolated worktree sandbox.*'
    : '*All unit tests executed and passed within isolated worktree sandbox.*';
```

### IN-02: Missing Clean Tree Check Before Commit in `commitImplementation`

**File:** `src/execute/coder.ts:94-97`
**Issue:** `commitImplementation` stages all changes with `git.add('.')` and calls `git.commit()` directly. If called when the working tree has no modifications, SimpleGit throws an uncaught error.
**Fix:** Check `const status = await git.status();` before calling `git.commit()`.

### IN-03: `createFile` Silently Overwrites Pre-existing Files

**File:** `src/execute/coder.ts:48-50`
**Issue:** `createFile` does not check `fs.existsSync(fullPath)`, unlike `editFile`. An LLM calling `createFile` on an existing path will silently wipe and overwrite the file instead of being prompted to use `editFile`.
**Fix:** Add `if (fs.existsSync(fullPath)) throw new Error(\`File already exists: \${relativePath}. Use editFile to update.\`);` to `createFile`.

### IN-04: Code Generation and Self-Repair Reasoning Left as Comment Stubs

**File:** `src/execute/worker.ts:71-73`, `src/execute/repair.ts:51-57`
**Issue:** In live execution without `mockCodeEdit`, `worker.ts` skips code generation entirely. In `executeRepairLoop`, cycles 1..N do not invoke an LLM reasoning call to edit code based on diagnostics, leaving self-repair non-operational outside test mocks.
**Fix:** Wire `generateText` / `streamText` from Vercel AI SDK using `createCoderTools` in `worker.ts` and `repair.ts`.

### IN-05: Duplicate Entries in `newTestFiles` on File Renames

**File:** `src/test-runner/immutability.ts:54-58`
**Issue:** When a file rename (`status.startsWith('R')`) touches non-baseline tests, `affectedPaths` contains both the old path and new path. Both are pushed into `newTestFiles`, even though the old path no longer exists on disk.
**Fix:** For renames, only push `parts[2]` (the destination path) to `newTestFiles`.

---

_Reviewed: 2026-09-08T17:40:00Z_
_Reviewer: gsd-code-reviewer_
_Depth: standard_
