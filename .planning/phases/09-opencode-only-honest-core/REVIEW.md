---
phase: 09-opencode-only-honest-core
reviewed: 2026-09-19T23:15:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - package.json
  - src/config/env.ts
  - src/execute/coder.ts
  - src/execute/repair.ts
  - src/execute/rework-worker.ts
  - src/execute/worker.ts
  - src/plan/planner.ts
  - src/sandbox/runner.ts
  - tests/command-allowlist.test.ts
  - tests/diff-ceiling.test.ts
  - tests/env-boot-validation.test.ts
  - tests/l3-evidence.test.ts
  - tests/prompt-injection.test.ts
  - tests/provider.test.ts
  - tests/repair-loop.test.ts
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: findings
---

# Phase 9: Code Review Report

**Reviewed:** 2026-09-19T23:15:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** findings

## Summary

Phase 9 implements the Opencode-Only Honest Core:
1. Deletion of the dead MCP subsystem (`src/mcp/`, `@modelcontextprotocol/sdk`, `@ai-sdk/mcp`) and built-in no-op coding path (`createCoderTools`).
2. Boot validation requiring `LOCAL_AGENT_TYPE=opencode` and verifying `OPENCODE_BIN`.
3. Injection chain closure via XML escaping (`escapeXml`) and `<user_ticket_input>` tags with `SECURITY BOUNDARY` directives in `worker.ts` and `planner.ts`.
4. Subprocess command allowlist (`ALLOWED_COMMANDS`) and execution gating in `runner.ts`.
5. Honest repair loop re-invoking `runOpenCode` with test failure diagnostics, recording `repairAttempted` and `filesEdited`.

Protected invariants (§Done-well: HMAC timingSafeEqual, wx-dedup, lane single-writer, sanitizeHtml, crash-atomic StateStore writes) remain intact. All 53 test files (512 tests) pass.

Five findings were identified: 1 Critical (absolute path in `OPENCODE_BIN` fails Windows boot), 2 Warnings (`totalFilesEdited` double-counting and untracked file blindness in repair loop; prompt injection tests asserting against local mock functions rather than production prompt builders), and 2 Info (defensive handling in `escapeXml`; path separator check in `assertAllowedCommand`).

## Critical Issues

### CR-01: Absolute path in OPENCODE_BIN fails boot validation on Windows

**File:** `src/config/env.ts:18-29`
**Issue:** When `OPENCODE_BIN` is configured as an absolute path on Windows (e.g., `C:\Users\...\opencode.cmd` or `D:\tools\opencode.exe`), `execFileSync('where', [val])` fails because Windows `where.exe` interprets colons in drive specifications as pattern qualifiers (`path:pattern`) and exits with code 2 (`ERROR: Invalid pattern is specified in "path:pattern"`). In non-test environments (`NODE_ENV !== 'test'`), Zod boot validation throws despite following the error message instructions ("set OPENCODE_BIN to absolute path").
**Fix:** Check `fs.existsSync(val)` before attempting system PATH lookup with `which`/`where`:
```ts
import fs from 'node:fs';
...
OPENCODE_BIN: z.string().default('opencode').pipe(z.string().min(1, 'OPENCODE_BIN is required').refine(
  (val) => {
    if (process.env.NODE_ENV === 'test') return true;
    if (fs.existsSync(val)) return true;
    try {
      execFileSync(process.platform === 'win32' ? 'where' : 'which', [val], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  },
  'OPENCODE_BIN not found on PATH — install opencode or set OPENCODE_BIN to absolute path'
)),
```

## Warnings

### WR-01: totalFilesEdited compounds cumulative diffs across cycles and misses untracked files

**File:** `src/execute/repair.ts:81-83`
**Issue:** In `executeRepairLoop`, `options.git.diff(['--stat', 'HEAD'])` inspects cumulative changes between the working tree and `HEAD`. No commit occurs between repair cycles, so `diffStat` reflects all modifications since `HEAD`. Line 83 does `totalFilesEdited += diffLines.length` on every cycle. If cycle 1 modifies 2 files and cycle 2 makes no changes or edits one of the same files, `totalFilesEdited` becomes 4 instead of 2. Additionally, `git diff HEAD` only compares tracked files; untracked new files created by `opencode` are ignored unless staged.
**Fix:** Compute the total files edited directly from the latest diff without accumulating past cycle snapshots, and capture untracked files:
```ts
// Check git status/diff to count files edited
const diffStat = await options.git.diff(['--stat', 'HEAD']);
const diffLines = diffStat.trim().split('\n').filter(l => l.includes('|'));
const status = await options.git.status();
const untrackedCount = status.not_added.length;
totalFilesEdited = diffLines.length + untrackedCount;
```

### WR-02: SEC-01 tests assert against local test-file helper functions instead of production prompt builders

**File:** `tests/prompt-injection.test.ts:22-62`
**Issue:** `buildOpenCodePrompt` and `buildPlannerPrompt` are declared locally within `tests/prompt-injection.test.ts`. The prompt injection behavioral tests (lines 65-179) execute against these test helper functions rather than the prompt generation in `src/execute/worker.ts` and `src/plan/planner.ts`. While lines 180-212 perform static source regex checks, behavioral coverage is decoupled from the production code.
**Fix:** Export prompt building functions from `src/execute/worker.ts` and `src/plan/planner.ts`, or test prompt construction via mocked `runOpenCode` / `generateText` invocations.

## Info

### IN-01: escapeXml throws TypeError on undefined or null input

**File:** `src/auditor/prompt.ts:7-14` (called in `src/execute/worker.ts:90-94` and `src/plan/planner.ts:68-72`)
**Issue:** `escapeXml(str: string)` assumes `str` is always defined. If `workItem.description` or `workItem.acceptanceCriteria` is undefined or null, calling `escapeXml` throws `TypeError: Cannot read properties of undefined (reading 'replace')`.
**Fix:** Handle falsy/non-string values defensively in `escapeXml`:
```ts
export function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
```

### IN-02: assertAllowedCommand checks only path.basename without path qualification guard

**File:** `src/sandbox/runner.ts:14-23`
**Issue:** `assertAllowedCommand` checks `path.basename(file).toLowerCase()`. A path-qualified argument such as `/tmp/npm` or `..\..\node.exe` passes allowlist validation because its basename matches. While currently only invoked internally with fixed string literals, enforcing bare command names (no directory separators) prevents potential path confusion.
**Fix:** Verify `file === path.basename(file)` in `assertAllowedCommand`.

---

_Reviewed: 2026-09-19T23:15:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
