---
phase: 09-opencode-only-honest-core
fixed_at: 2026-09-19T23:20:00Z
review_path: .planning/phases/09-opencode-only-honest-core/REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 9: Code Review Fix Report

**Fixed at:** 2026-09-19T23:20:00Z
**Source review:** .planning/phases/09-opencode-only-honest-core/REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (1 Critical, 2 Warning, 2 Info)
- Fixed: 5
- Skipped: 0
- Verification: `npx tsc --noEmit` clean; full `npm test` 517/517 green across 53 files (+5 new verification tests)

## Fixed Issues

### CR-01: Absolute path in OPENCODE_BIN fails boot validation on Windows

**Files modified:** `src/config/env.ts`, `tests/env-boot-validation.test.ts`
**Commit:** `2086308`
**Applied fix:** In `src/config/env.ts`, added `fs.existsSync(val)` check before invoking `where`/`which`. Windows `where.exe` fails on drive letters with colons (e.g. `C:\...`). Added test in `tests/env-boot-validation.test.ts` verifying valid absolute binary path is accepted in non-test mode.

### WR-01: totalFilesEdited compounds cumulative diffs across cycles and misses untracked files

**Files modified:** `src/execute/repair.ts`, `tests/repair-loop.test.ts`
**Commit:** `7d728b9`
**Applied fix:** Replaced cumulative `totalFilesEdited += diffLines.length` accumulation with latest snapshot evaluation using tracked `diffLines.length` plus `status.not_added.length` (untracked files created during repair). Added test in `tests/repair-loop.test.ts` verifying no double-counting across repair cycles and accurate counting of untracked files.

### WR-02: SEC-01 tests assert against local test-file helper functions instead of production prompt builders

**Files modified:** `src/execute/worker.ts`, `src/plan/planner.ts`, `tests/prompt-injection.test.ts`
**Commit:** `423b5ff`
**Applied fix:** Exported canonical `buildOpenCodePrompt` from `src/execute/worker.ts` and `buildPlannerPrompt` from `src/plan/planner.ts`. Replaced duplicate local test helper declarations in `tests/prompt-injection.test.ts` with imports of production prompt builders, and added test coverage for production `buildAuditorPrompt`.

### IN-01: escapeXml throws TypeError on undefined or null input

**Files modified:** `src/auditor/prompt.ts`, `tests/prompt-injection.test.ts`
**Commit:** `09962e3`
**Applied fix:** Updated `escapeXml(str?: string | null): string` in `src/auditor/prompt.ts` to wrap input with `String(str ?? '')`, safely handling `null`, `undefined`, and non-string inputs. Added defensive input tests in `tests/prompt-injection.test.ts`.

### IN-02: assertAllowedCommand checks only path.basename without path qualification guard

**Files modified:** `src/sandbox/runner.ts`, `tests/command-allowlist.test.ts`
**Commit:** `2c2bc37`
**Applied fix:** Updated `assertAllowedCommand` in `src/sandbox/runner.ts` to enforce bare command names without directory separators (`file === path.basename(file) && !file.includes('/') && !file.includes('\\')`) or matching `process.execPath`. Path-qualified binaries such as `/tmp/npm` or `./node` are strictly rejected. Added test coverage in `tests/command-allowlist.test.ts`.

## Skipped Issues

None — all in-scope findings fixed.

## Invariants Preserved

- §Done-well (AUDIT-v2.1.md) untouched: HMAC timingSafeEqual, wx-dedup, lane single-writer, sanitizeHtml, crash-atomic StateStore writes.
- No new dependencies.
- No Phase 10+ scope pre-empted.

---

_Fixed: 2026-09-19T23:20:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
