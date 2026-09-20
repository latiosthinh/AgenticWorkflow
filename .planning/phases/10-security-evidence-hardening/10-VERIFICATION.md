---
phase: 10-security-evidence-hardening
verified: 2026-09-20T10:03:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 10: Security & Evidence Hardening Verification Report

**Phase Goal:** All remaining security findings closed — verdict tokens actor-authorized, all 10 inline ADO comments sanitized + loop-shielded, push failures honest, remaining XML-escape/sanitize gaps sealed — and zero fabricated evidence anywhere: router step-4 defaults, evidence-index L2/L4/errorRate/p95 constants, and QA `commitSha='main'` replaced with real values or fail-closed `MissingEvidenceError`.
**Verified:** 2026-09-20T10:03:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Verdict tokens (`[approve-scope]`, `[approve-acceptance]`, reject/reset variants) from commenters outside the configured approver allowlist are rejected, logged, and answered with an ADO comment — allowlisted approver verdicts process normally | ✓ VERIFIED | `detectScopeVerdict` and `detectAcceptanceVerdict` enforce `isActorAuthorized(actor, approverIds)`. Router posts sanitized warning comment with loop-shield and halts transition. 25/25 tests passing in `tests/approver-allowlist.test.ts`. |
| 2 | Every ADO comment posted by the system passes the sanitizing formatter and carries the `<!-- [automated-agent] -->` loop-shield marker (zero raw posts remain) | ✓ VERIFIED | All worker inline comments route through `formatWorkerAlertComment` (`sanitizeHtml` safe tag allowlist + loop shield). `flagTicketBlocked` enforces defense-in-depth sanitization and shield attachment. 14/14 tests passing in `tests/worker-comment-sanitization.test.ts`. |
| 3 | A production git push failure results in Blocked + dedup `failed` + alert comment; error-swallow path executes only under `NODE_ENV=test` | ✓ VERIFIED | `src/execute/worker.ts` and `src/execute/rework-worker.ts` check `env.NODE_ENV === 'test'`. Under production, push failures trigger `flagTicketBlocked` with `[contract-conflict]`, dedup status `failed`, worktree cleanup, and return `false`. 6/6 tests passing in `tests/git-push-honesty.test.ts`. |
| 4 | `learn/prompt.ts` content is XML-escaped (a `</learning_source_context>` payload cannot escape), PR description formatter is sanitized, and scope-gate feedback + actor displayName are sanitized | ✓ VERIFIED | `buildSkillLearningPrompt` and `buildRetroLearningPrompt` escape all inputs via `escapeXml`. `formatPrDescription` uses `sanitizeHtml` with `disallowedTagsMode: 'escape'`. Scope approval/rejection handlers sanitize actor and feedback. 6/6 tests passing in `tests/escape-sanitization.test.ts`. |
| 5 | Zero fabricated evidence: router step-4 defaults, evidence-index L2/L4/errorRate/p95 constants, and QA `commitSha='main'` replaced with real values or fail-closed `MissingEvidenceError`; `executeRepairLoop` passes `knownSecrets` | ✓ VERIFIED | Router step 4 throws `MissingEvidenceError` on absent L3. QA worker resolves SHA via `git rev-parse HEAD` or fails closed with `[qa-harness-error]`. `compileL1L7EvidenceIndex` rejects missing L2/L4/L6 metrics under `failClosed: true`. `executeRepairLoop` scrubs test diagnostics against `getKnownSecrets()`. 16/16 tests passing in `tests/honest-evidence.test.ts` and `tests/repair-secrets.test.ts`. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/config/env.ts` | `APPROVER_IDS` configuration in EnvSchema | ✓ VERIFIED | Validates non-empty string in production; parses comma-separated lists and emails. |
| `src/scope/verdict.ts` | Actor validation for scope verdict tokens | ✓ VERIFIED | Returns `unauthorized` verdict when actor is not in allowlist. |
| `src/accept/verdict.ts` | Actor validation for acceptance verdict tokens | ✓ VERIFIED | Returns `unauthorized` verdict when actor is not in allowlist. |
| `src/ado/formatter.ts` | `formatWorkerAlertComment` and sanitized `formatPrDescription` | ✓ VERIFIED | Escapes disallowed tags and appends `<!-- [automated-agent] -->`. |
| `src/ado/work-item.ts` | Sanitized and shielded `flagTicketBlocked` | ✓ VERIFIED | Sanitizes HTML and appends loop-shield marker if missing. |
| `src/execute/worker.ts` | Sanitized comments, fail-closed push handling, known secrets passed | ✓ VERIFIED | Routes all alerts through `formatWorkerAlertComment`; returns boolean status; passes `getKnownSecrets()`. |
| `src/execute/rework-worker.ts` | Sanitized comments, fail-closed push handling, known secrets passed | ✓ VERIFIED | Routes all alerts through `formatWorkerAlertComment`; fail-closed push in production; passes `getKnownSecrets()`. |
| `src/execute/repair.ts` | Scrubbed diagnostics and fail-closed WIP push diagnostics | ✓ VERIFIED | Diagnostics scrubbed with `scrubOutput`; WIP push failure captured in diagnostics. |
| `src/execute/router.ts` | Fail-closed L3 evidence check in step 4, unauthorized verdict handling | ✓ VERIFIED | Throws `MissingEvidenceError` and blocks ticket when L3 missing; posts unauthorized warning comment. |
| `src/qa/worker.ts` | Dynamic `git rev-parse HEAD` commit SHA resolution | ✓ VERIFIED | Resolves real HEAD or branch ref; fails closed to `[qa-harness-error]`. |
| `src/deploy/evidence-index.ts` | Strict evidence compilation without fabricated constants | ✓ VERIFIED | Throws `MissingEvidenceError` under `failClosed: true`; defaults to Pending/0 otherwise. |
| `src/sandbox/runner.ts` | `getKnownSecrets` helper and enhanced `SENSITIVE_VALUE_PATTERN` | ✓ VERIFIED | Scrubs ADO PATs, Bearer tokens, App Insights keys with `\b` word boundary. |
| `src/learn/prompt.ts` | XML containment for learning prompts | ✓ VERIFIED | Wraps ticket text and review comments with `escapeXml`. |
| `tests/approver-allowlist.test.ts` | 25 unit tests for approver allowlist authorization | ✓ VERIFIED | Covers token extraction, casing, email matching, and warning comments. |
| `tests/worker-comment-sanitization.test.ts` | 14 tests verifying sanitized and loop-shielded comments | ✓ VERIFIED | Covers all alert comment templates and bot-shield filter matching. |
| `tests/git-push-honesty.test.ts` | 6 tests verifying push failure honesty | ✓ VERIFIED | Tests fail-closed production behavior vs test-environment tolerance. |
| `tests/escape-sanitization.test.ts` | 6 tests verifying XML escaping and HTML sanitization | ✓ VERIFIED | Tests breakout payloads in prompts, PR descriptions, and scope feedback. |
| `tests/honest-evidence.test.ts` | 9 tests for honest evidence across router, QA, and index | ✓ VERIFIED | Tests MissingEvidenceError in router step 4, QA SHA resolution, and strict compiler. |
| `tests/repair-secrets.test.ts` | 7 tests verifying secret scrubbing | ✓ VERIFIED | Tests raw 52-char PAT scrubbing, App Insights key scrubbing, and repair output sanitization. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `src/execute/router.ts` | `src/scope/verdict.ts` | `detectScopeVerdict` with revisedBy | ✓ WIRED | Evaluates actor against `approverIds` for scope verdict tokens. |
| `src/execute/router.ts` | `src/accept/verdict.ts` | `detectAcceptanceVerdict` with revisedBy | ✓ WIRED | Evaluates actor against `approverIds` for acceptance verdict tokens. |
| `src/execute/worker.ts` | `src/ado/formatter.ts` | `formatWorkerAlertComment` | ✓ WIRED | Formats all 6 execution failure/blocked alerts safely with loop shield. |
| `src/execute/rework-worker.ts` | `src/ado/formatter.ts` | `formatWorkerAlertComment` | ✓ WIRED | Formats all rework failure/blocked alerts safely with loop shield. |
| `src/execute/router.ts` | `src/deploy/evidence-index.ts` | `MissingEvidenceError` import | ✓ WIRED | Throws `MissingEvidenceError` when ticket lacks real L3 evidence. |
| `src/execute/worker.ts` | `src/sandbox/runner.ts` | `getKnownSecrets` import | ✓ WIRED | Passes active secrets into `executeRepairLoop`. |
| `src/execute/rework-worker.ts` | `src/sandbox/runner.ts` | `getKnownSecrets` import | ✓ WIRED | Passes active secrets into `executeRepairLoop`. |
| `src/learn/prompt.ts` | `src/auditor/prompt.ts` | `escapeXml` import | ✓ WIRED | Wraps untrusted fields inside `<learning_source_context>`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `src/execute/router.ts` | `ticket.l3Evidence` | `stateStore.getTicketState(workItemId)` | Real recorded L3 test suite result | ✓ FLOWING |
| `src/qa/worker.ts` | `commitSha` | `git.raw(['rev-parse', 'HEAD'])` in worktree | Real git commit SHA from worktree | ✓ FLOWING |
| `src/deploy/evidence-index.ts` | `resolvedL2`, `resolvedL4`, `l6Record` | Ticket stateStore record or compile options | Validated against real evidence or throws `MissingEvidenceError` | ✓ FLOWING |
| `src/sandbox/runner.ts` | `knownSecrets` | `env.ADO_PAT`, `env.API_KEY`, etc. | Real active environment credentials | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Approver allowlist authorization | `npx vitest run tests/approver-allowlist.test.ts` | 25 passed | ✓ PASS |
| Worker comment sanitization & loop shield | `npx vitest run tests/worker-comment-sanitization.test.ts` | 14 passed | ✓ PASS |
| Git push failure honesty in production | `npx vitest run tests/git-push-honesty.test.ts` | 6 passed | ✓ PASS |
| XML escaping and HTML sanitization | `npx vitest run tests/escape-sanitization.test.ts` | 6 passed | ✓ PASS |
| Honest evidence and secret scrubbing | `npx vitest run tests/honest-evidence.test.ts tests/repair-secrets.test.ts` | 16 passed | ✓ PASS |
| Full test suite | `npm test` | 59 test files, 585 tests passed | ✓ PASS |
| TypeScript compilation | `npx tsc --noEmit` | 0 errors | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| **SEC-03** | 10-01-PLAN | Scope-lock and acceptance verdict tokens require configured approver allowlist | ✓ SATISFIED | `src/scope/verdict.ts`, `src/accept/verdict.ts`, `tests/approver-allowlist.test.ts` |
| **SEC-04** | 10-02-PLAN | Every ADO comment passes sanitizing formatter and carries loop-shield marker | ✓ SATISFIED | `src/ado/formatter.ts`, `src/ado/work-item.ts`, `tests/worker-comment-sanitization.test.ts` |
| **SEC-05** | 10-02-PLAN | Production git push failure fails closed (Blocked + dedup `failed` + alert comment) | ✓ SATISFIED | `src/execute/worker.ts`, `src/execute/rework-worker.ts`, `tests/git-push-honesty.test.ts` |
| **SEC-06** | 10-01-PLAN | Prompt containment XML-escaped, PR description and scope inputs sanitized | ✓ SATISFIED | `src/learn/prompt.ts`, `src/ado/formatter.ts`, `src/scope/gate.ts`, `tests/escape-sanitization.test.ts` |
| **CORE-04** | 10-03-PLAN | Zero fabricated evidence: router step 4, QA commitSha, evidence index constants | ✓ SATISFIED | `src/execute/router.ts`, `src/qa/worker.ts`, `src/deploy/evidence-index.ts`, `tests/honest-evidence.test.ts` |
| **REL-09** | 10-03-PLAN | `executeRepairLoop` passes `knownSecrets` consistently with QA/smoke paths | ✓ SATISFIED | `src/execute/repair.ts`, `src/sandbox/runner.ts`, `tests/repair-secrets.test.ts` |

### Anti-Patterns Found

None. All fabricated default constants have been replaced with fail-closed checks or real runtime git queries. No placeholder stubs or unhandled exception swallows in production code paths.

### Human Verification Required

None. All security controls, sanitizers, authorization rules, and evidence verification mechanisms are fully covered by automated regression and integration suites.

### Gaps Summary

Zero gaps. All 5 success criteria and 6 requirements are fully satisfied. Full test suite (585 tests across 59 files) passes green, and `tsc --noEmit` is clean.

---

_Verified: 2026-09-20T10:03:00Z_  
_Verifier: the agent (gsd-verifier)_
