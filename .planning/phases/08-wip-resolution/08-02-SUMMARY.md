---
phase: 08-wip-resolution
plan: 02
subsystem: state
tags: [evidence-persistence, governance, fallback-provenance, sanitize-html, static-guards, vitest]

# Dependency graph
requires:
  - phase: 08-wip-resolution (plan 01)
    provides: "AuditOutcome/PlannerOutcome return shapes stamping fallbackUsed + model (response.modelId else env.API_MODEL) on every LLM-call-site path"
  - phase: 02-execute (v2.0)
    provides: "createPlanCheckpoint lane-disciplined persistence + watchdog machinery the L2 evidence rides on"
provides:
  - "L1 audit records persist env-resolved/actual model + fallbackUsed — zero 'gpt-4o' hardcodes in src/auditor/ (static-guarded)"
  - "L2 plan checkpoints persist fallbackUsed/model/planDelegated/planNote through the unchanged lane-disciplined createPlanCheckpoint path (additive optional fields, l7Evidence pattern, zero store changes)"
  - "opencode plan-skip stamps planDelegated:true + planNote:'plan delegated to opencode' and surfaces it as a sanitized '**Governance Note:**' section in the ADO plan-locked comment"
  - "formatPlanLockedComment optional 3rd param governanceNote — rides THROUGH marked.parse + sanitizeHtml allowlist + loop shield (hostile-note test)"
  - "src/cli/ado.ts tracked as-is (zero content changes); wire-or-delete + v1 vocabulary fix deferred to Phase 12 QAL-03 per recorded decision"
  - "clean working tree — commit-forward gate (WIP-05) closed for all later phases"
affects: [09-opencode-only-core (CORE-01 rewires the execute/worker plan block; static guards mark the invariants), 12-config-quality (QAL-03 wire-or-delete src/cli/ado.ts; CFG opencode-runner '|| gpt-4o' env-default chains), 13-e2e-proof (integration coverage of the skip branch — unreachable under NODE_ENV=test by design)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Governance deviations surfaced on the work item: markdown-first note section fed THROUGH the existing sanitizing formatter pipeline — never raw HTML"
    - "Test-hermetic env pinning: (env as any).API_MODEL pinned in harness beforeEach (mirrors STATE_STORE_DIR pattern) so env-resolved-value assertions are machine-independent"
    - "Static source guards extended: readFileSync + containment/regex assertions make invariant removal test-failing"

key-files:
  created:
    - tests/wip-static-guards.test.ts
  modified:
    - src/state/types.ts
    - src/plan/checkpoint.ts
    - src/auditor/worker.ts
    - src/execute/worker.ts
    - src/plan/formatter.ts
    - tests/plan-checkpoint.test.ts
    - tests/worker.test.ts
    - tests/planner.test.ts
    - src/auditor/prompt.ts (committed as-is, zero edits)
    - src/cli/ado.ts (tracked as-is, zero content changes)

key-decisions:
  - "worker.test.ts pins env.API_MODEL='gpt-4o' in the harness instead of weakening the :80 assertion — local .env overrides the schema default, so the plan's 'defaults to gpt-4o under vitest' assumption was machine-dependent; the assertion text stays verbatim and is now hermetic"
  - "governanceNote inserted into the markdown template BEFORE marked.parse — sanitizeHtml allowlist + loop-shield suffix untouched (§Done-well protected)"
  - "Task 3 landed 2 commits (prompt.ts, cli/ado.ts) per the task's explicit commit spec — objective's '3 atomic commits' counted the prompt as-is inside the cli catch-all; task-level instructions win"

patterns-established:
  - "Additive evidence fields: fallbackUsed/model/planDelegated/planNote optional on persisted entry types — JSON.stringify drops undefined, old state files parse unchanged, zero store changes"
  - "Permanent WIP guards: tests/wip-static-guards.test.ts owns no-hardcoded-model + skip-branch-governance-fields invariants"

requirements-completed: [WIP-02, WIP-04, WIP-05]

# Metrics
duration: 13min
completed: 2026-09-19
---

# Phase 8 Plan 02: WIP Evidence Persistence & Clean Tree Summary

**Fallback provenance (fallbackUsed + env-resolved/actual model) now persists in L1 audit records and L2 plan checkpoints through the lane-disciplined path; the opencode plan-skip records planDelegated + planNote and surfaces a sanitized Governance Note on the work item; prompt.ts and src/cli/ado.ts committed as-is — working tree clean, 488/488 green.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-09-19T17:44:07Z
- **Completed:** 2026-09-19T17:57:30Z
- **Tasks:** 3
- **Files modified:** 11 (1 test file created, 1 source file newly tracked, 9 modified/committed-as-is)

## Accomplishments

- **WIP-02 (persistence half):** both `auditLogs.push` blocks in `src/auditor/worker.ts` persist `model: result.model` + `fallbackUsed: result.fallbackUsed` — the hardcoded `model:'gpt-4o'` at :84/:116 is gone and static-guarded (`rg "gpt-4o" src/auditor` → 0). `createPlanCheckpoint` passes `fallbackUsed/model/planDelegated/planNote` through the UNCHANGED runInLane/lane-context path; both execute-worker checkpoint calls feed it. Roundtrip + backwards-compat tested (fields absent when not supplied).
- **WIP-04:** skip branch stamps `planDelegated: true` + `planNote: 'plan delegated to opencode'`; locked branch persists all four evidence fields and calls `formatPlanLockedComment(plan.planMarkdown, plan.estimatedFiles, plan.planNote)`. The note renders as `**Governance Note:**` THROUGH sanitizeHtml + `<!-- [automated-agent] -->` loop shield (T-08-06 hostile-note test: `onerror` stripped). 2-arg calls render byte-identical to before — existing formatter tests untouched and green.
- **WIP-05:** `src/auditor/prompt.ts` JSON-schema WIP committed verbatim; `src/cli/ado.ts` tracked as-is (163 lines, zero content changes; wire-or-delete → Phase 12 QAL-03, T-08-08 accepted). `git status --porcelain` EMPTY — commit-forward gate closed.
- Test suite: 483 → 488 (5 new: 1 checkpoint roundtrip/backwards-compat, 2 formatter governance tests, 2 static guards). Full gate: 51 files green, `npx tsc --noEmit` clean, `rg "model: 'gpt-4o'" src` → 0, `rg "catch\s*\{\s*\}" src/ai/provider.ts` → 0.
- §Done-well verified untouched: formatter diff is +6/-2 (signature + noteSection only; allowlist, shield suffix, `// ponytail:` comment intact); `git diff HEAD~4 --stat` shows no edits to lane-manager, store.ts, or dedup.

## Task Commits

Each task was committed atomically (TDD RED→GREEN within each task, commit set per plan `<done>` blocks):

1. **Task 1: Persist fallbackUsed + actual model into L1/L2 evidence (WIP-02)** - `9101c33` (feat)
2. **Task 2: Record + surface plan-delegated-to-opencode governance deviation (WIP-04)** - `6f430e0` (feat)
3. **Task 3: Commit remaining WIP as-is + clean tree (WIP-05)** - `f732cab` (feat, prompt.ts as-is) + `e9d4e8d` (chore, cli/ado.ts as-is)

**Plan metadata:** see final docs commit (git log).

## Files Created/Modified

- `src/state/types.ts` - additive optional: `AuditLogEntry.fallbackUsed?`; `PlanCheckpointState.fallbackUsed?/model?/planDelegated?/planNote?`
- `src/plan/checkpoint.ts` - `CreateCheckpointInput` + `created` object pass the four evidence fields (lane logic :36-40 untouched)
- `src/auditor/worker.ts` - both audit-log pushes persist `result.model` + `result.fallbackUsed`
- `src/execute/worker.ts` - skip-branch governance stamps; both createPlanCheckpoint calls pass evidence fields; locked comment carries planNote (completes the uncommitted WIP incl. `forceAiPlanner` escape — all committed in Task 2)
- `src/plan/formatter.ts` - `formatPlanLockedComment(…, governanceNote?)`; note rendered before sanitization
- `tests/wip-static-guards.test.ts` (new) - permanent guards: no `gpt-4o` literal in auditor worker; skip branch keeps `planDelegated: true`/`'plan delegated to opencode'`/`forceAiPlanner`; locked comment call matches `/formatPlanLockedComment\([^)]*plan\.planNote/`
- `tests/plan-checkpoint.test.ts` - roundtrip of 4 evidence fields + backwards-compat checkpoint
- `tests/worker.test.ts` - `fallbackUsed===false` assertions on passed+failed verdict paths; API_MODEL harness pin
- `tests/planner.test.ts` - governanceNote rendering (shield present, 2-arg unchanged) + hostile-note sanitization
- `src/auditor/prompt.ts`, `src/cli/ado.ts` - committed as-is, zero content edits

## Decisions Made

- **Harness pin over assertion rewrite:** plan constraint assumed `env.API_MODEL` defaults to `'gpt-4o'` under vitest; this machine's `.env` sets `API_MODEL=9router/ag/gemini-3.8-flash-high`, so the rewired `:80` assertion failed. Fixed by pinning `(env as any).API_MODEL = 'gpt-4o'` in `beforeEach` (restored in `afterEach`) — same pattern the file already uses for `STATE_STORE_DIR`. Assertion stays verbatim per "do NOT weaken"; test now hermetic on any machine. Matches 08-01's `toBe(env.API_MODEL)` philosophy.
- **`[^)]*` guard regex needs no dotAll flag:** character classes already match newlines; the multi-line comment call contains no `)` before `plan.planNote`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan assumption false on this machine: env.API_MODEL ≠ 'gpt-4o' under vitest**
- **Found during:** Task 1 GREEN — `tests/worker.test.ts` Case 1 failed: `expected '9router/ag/gemini-3.8-flash-high' to be 'gpt-4o'`
- **Issue:** Local `.env` (gitignored) overrides the zod default; the `:80` assertion only passed pre-rewire because the model was hardcoded. Plan constraint forbade weakening the assertion.
- **Fix:** Pinned `API_MODEL='gpt-4o'` in the harness `beforeEach` with `afterEach` restore — assertion unchanged, test machine-independent.
- **Files modified:** tests/worker.test.ts
- **Verification:** 27/27 targeted green; full suite 488/488; tsc clean.
- **Committed in:** 9101c33 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking)
**Impact on plan:** Semantic intent preserved exactly (env-resolved model persisted; assertion intact and strengthened against machine drift). No scope creep.

## Issues Encountered

- TDD RED nuance: the hostile-note sanitization test passed trivially before implementation (2-arg signature ignores the 3rd argument — no injection surface existed yet). The governanceNote-rendering test and static guards provided the true RED failures. Kept as a post-implementation regression guard for T-08-06.
- Plan text inconsistency: objective says "3 atomic commits", Task 3 `<done>` specifies two separate commits (prompt.ts + cli/ado.ts). Followed task-level spec → 4 code commits total.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None. All evidence fields wired to real values (`result.model`/`result.fallbackUsed` from 08-01 outcomes; `planNote` is an orchestrator-internal constant per T-08-09). Skip branch itself is deliberate design (recorded decision), not a stub — integration coverage is Phase 13 E2E territory per plan.

## Next Phase Readiness

- Clean tree unblocks all Phase 9–13 work (commit-forward gate WIP-05 closed).
- Phase 9 CORE-01 rewires the execute/worker plan block — static guards in `tests/wip-static-guards.test.ts` mark the governance invariants that must survive (or be deliberately replaced with updated guards).
- Phase 12: QAL-03 executes the recorded wire-or-delete decision for `src/cli/ado.ts` (v1 vocabulary + WIQL interpolation are KNOWN, deliberately unfixed — T-08-08 accept); CFG owns opencode-runner's `|| 'gpt-4o'` env-default chains (not audit-log hardcodes).
- Phase 8 complete: WIP-01..05 all checked; 2 plans, 6 tasks, 7 commits.

## Self-Check: PASSED

- FOUND: src/state/types.ts (contains `planDelegated`)
- FOUND: src/plan/checkpoint.ts (contains `planNote`)
- FOUND: src/auditor/worker.ts (contains `model: result.model`; zero `gpt-4o`)
- FOUND: src/execute/worker.ts (contains `planDelegated: true`)
- FOUND: src/plan/formatter.ts (contains `Governance Note`)
- FOUND: tests/wip-static-guards.test.ts
- FOUND: src/cli/ado.ts (tracked, git log e9d4e8d)
- FOUND commits: 9101c33, 6f430e0, f732cab, e9d4e8d (git log)
- VERIFIED: `git status --porcelain` empty; npm test 488/488; tsc clean

---
*Phase: 08-wip-resolution*
*Completed: 2026-09-19*
