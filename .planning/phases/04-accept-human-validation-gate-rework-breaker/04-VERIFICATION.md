---
phase: 04-accept-human-validation-gate-rework-breaker
verified: 2026-09-09T09:15:00Z
status: human_needed
score: 14/14 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Visual inspection of Acceptance Packet in ADO Boards"
    expected: "Work item in Dev Done displays formatted HTML acceptance packet table (Tests, LOC diff, PR link, Preview URL), collapsible reviewer instructions, and <!-- [automated-agent] --> loop shield comment."
    why_human: "Verifying markdown-to-HTML table styling, collapsible details tag rendering, and link usability requires browser inspection in live Azure DevOps Boards."
  - test: "End-to-end webhook delivery on human column transitions"
    expected: "Moving work item from Dev Done to Ready for QA adds [acceptance-approved] tag. Moving from Dev Done to In Dev triggers rework worker resuming task branch, respecting <=2 bounce limit."
    why_human: "Requires active ADO organization service hooks delivering real webhook payloads to Fastify ingress endpoint over HTTPS."
---

# Phase 4: ACCEPT — Human Validation Gate & Rework Breaker Verification Report

**Phase Goal:** Human functional acceptance at `Dev Done` with bounded rework.
**Verified:** 2026-09-09T09:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | Acceptance packet comment displays test run results, cumulative diff stats (<250 LOC), PR link, and preview URL | ✓ VERIFIED | Implemented in `src/accept/packet.ts` (`formatAcceptancePacketComment`), verified in `tests/acceptance-packet.test.ts`. |
| 2   | Acceptance packet HTML contains `<!-- [automated-agent] -->` loop shield to prevent webhook echo recursion | ✓ VERIFIED | Verified in `src/accept/packet.ts` line 74 and test assertion in `tests/acceptance-packet.test.ts`. |
| 3   | Transitioning to `Dev Done` adds `[awaiting-acceptance]` tag and clears `[awaiting-input]` | ✓ VERIFIED | Implemented in `src/accept/packet.ts` (`buildDevDoneAcceptancePatch`) and `src/ado/work-item.ts` (`transitionToDevDoneWithPacket`). |
| 4   | Preview URL template resolves `{workItemId}` placeholder with fallback to localhost port | ✓ VERIFIED | Implemented in `src/accept/urls.ts` (`resolvePreviewUrl`), verified in `tests/acceptance-packet.test.ts`. |
| 5   | PR URL template resolves `{workItemId}` and `{branchName}` with fallback to Azure Repos compare link | ✓ VERIFIED | Implemented in `src/accept/urls.ts` (`resolvePrUrl`), verified in `tests/acceptance-packet.test.ts`. |
| 6   | SQLite table `rework_cycles` records `workItemId`, `bounceCount`, `lastBounceAt`, `sourceGate`, and `escalatedAt` | ✓ VERIFIED | Drizzle schema defined in `src/db/schema.ts`, table initialized in `src/db/index.ts`, verified in `tests/rework-breaker.test.ts`. |
| 7   | First and second rejections allow rework (`bounceCount = 1` and `2`, `allowed = true`) | ✓ VERIFIED | Verified across `accept` and `pr_review` gates in `tests/rework-breaker.test.ts`. |
| 8   | Third rejection trips circuit breaker (`bounceCount = 3`, `allowed = false`), generating patch setting State to `Blocked`, tagging `[rework-escalated]`, removing `[awaiting-acceptance]`, and posting escalation comment | ✓ VERIFIED | Implemented in `src/accept/breaker.ts` (`evaluateCircuitBreaker`, `buildEscalationPatch`), verified in `tests/rework-breaker.test.ts` and `tests/rework-integration.test.ts`. |
| 9   | Calling `resetCircuitBreaker` (or comment `[reset-rework]`) resets `bounceCount` to 0 and clears `escalatedAt` | ✓ VERIFIED | Implemented in `src/accept/breaker.ts`, routed in `src/execute/router.ts`, verified in `tests/rework-breaker.test.ts` and `tests/rework-integration.test.ts`. |
| 10  | Moving ticket from `Dev Done` to `Ready for QA` or commenting `[approve-acceptance]` produces `approve` verdict and unlocks PR path | ✓ VERIFIED | Implemented in `src/accept/verdict.ts` (`detectAcceptanceVerdict`), tags `[acceptance-approved]` in `src/execute/router.ts`, verified in `tests/verdict-detector.test.ts` and `tests/rework-integration.test.ts`. |
| 11  | Moving ticket from `Dev Done` to `In Dev` or commenting `[reject-acceptance]` produces `reject` verdict with extracted human feedback | ✓ VERIFIED | Implemented in `src/accept/verdict.ts`, strips tokens and echo markers, verified in `tests/verdict-detector.test.ts`. |
| 12  | Cumulative rework envelope bundles original AC, prior diff, and reviewer feedback within remaining LOC budget, with XML escaping | ✓ VERIFIED | Implemented in `src/accept/envelope.ts` (`formatReworkPrompt`, `escapeXml`), verified in `tests/verdict-detector.test.ts`. |
| 13  | Git worktree creation with `checkoutExistingBranch: true` preserves existing task branch commits without branch deletion | ✓ VERIFIED | Implemented in `src/sandbox/worktree.ts` (`createWorktree`), verified in `tests/verdict-detector.test.ts`. |
| 14  | Rejection within bounce budget triggers rework pipeline, verifies diff ceiling (<250 LOC) and tests, commits with `fix(review)`, and re-transitions to `Dev Done` | ✓ VERIFIED | Implemented in `src/execute/rework-worker.ts` (`processWorkItemRework`), verified in `tests/rework-integration.test.ts`. |

**Score:** 14/14 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/config/env.ts` | Environment config schema extended with `PREVIEW_URL_TEMPLATE` and `PR_URL_TEMPLATE` | ✓ VERIFIED | Zod optional string fields present; loaded in runtime configuration. |
| `src/accept/urls.ts` | URL template resolution utilities for staging previews and pull requests | ✓ VERIFIED | Exports `resolvePreviewUrl`, `resolvePrUrl`; supports token interpolation with URL encoding and fallback defaults. |
| `src/accept/packet.ts` | Acceptance packet comment formatter and Dev Done JSON patch builder | ✓ VERIFIED | Exports `formatAcceptancePacketComment`, `buildDevDoneAcceptancePatch`; compiles sanitized HTML with loop shield. |
| `src/db/schema.ts` | Drizzle SQLite table definition and TypeScript types for `rework_cycles` | ✓ VERIFIED | Exports `reworkCycles`, `ReworkCycle`, `InsertReworkCycle`; includes fields for bounce tracking and escalation. |
| `src/accept/breaker.ts` | Shared rework circuit breaker service, reset mechanism, and escalation patch builder | ✓ VERIFIED | Exports `evaluateCircuitBreaker`, `resetCircuitBreaker`, `buildEscalationPatch`; transactional SQLite upsert. |
| `src/accept/verdict.ts` | Human verdict classifier detecting approve, reject, and reset tokens | ✓ VERIFIED | Exports `detectAcceptanceVerdict`, `AcceptanceVerdict`, `VerdictDetectionInput`; state transitions and comment token support. |
| `src/accept/envelope.ts` | Cumulative rework prompt formatter with AC, prior diff, feedback, and remaining LOC budget | ✓ VERIFIED | Exports `formatReworkPrompt`, `escapeXml`, `CumulativeReworkEnvelope`; XML boundaries with character escaping. |
| `src/sandbox/worktree.ts` | Git worktree manager extended with `checkoutExistingBranch` support | ✓ VERIFIED | Exports `createWorktree`, `CreateWorktreeOptions`; bypasses `branch -D` and uses `git worktree add <path> <branch>`. |
| `src/ado/work-item.ts` | Work item helpers for Dev Done acceptance packet transitions and Blocked rework escalations | ✓ VERIFIED | Exports `transitionToDevDoneWithPacket`, `escalateReworkToBlocked`; calls ADO client with JSON Patch operations. |
| `src/execute/rework-worker.ts` | Rework execution pipeline resuming task branch, verifying diffs/tests, committing, and updating ADO | ✓ VERIFIED | Exports `processWorkItemRework`; enforces diff ceiling, immutability, test repairs, conventional commits, and acceptance packet. |
| `src/execute/router.ts` | Event routing handler dispatching Dev Done approval, rejection rework, breaker trips, and resets | ✓ VERIFIED | Exports `routeWorkItemEvent`; evaluates verdict, manages breaker, tags approval, and dispatches rework. |
| `tests/acceptance-packet.test.ts` | Unit tests for acceptance packet formatting, template interpolation, and patch operations | ✓ VERIFIED | 5 tests passing; covers markdown table, bot echo shield, tag operations, and URL fallback behavior. |
| `tests/rework-breaker.test.ts` | Unit tests for bounce tracking, 2-bounce trip condition, and counter reset | ✓ VERIFIED | 7 tests passing; verifies bounce counts, `escalatedAt`, breaker trip, reset, and escalation patch. |
| `tests/verdict-detector.test.ts` | Unit tests for state and comment verdict detection, envelope formatting, and branch resumption | ✓ VERIFIED | 15 tests passing; covers approvals, rejections, resets, XML escaping, and worktree git commit preservation. |
| `tests/rework-integration.test.ts` | Integration tests for end-to-end acceptance approval, rejection rework, and escalation flow | ✓ VERIFIED | 9 tests passing; covers approval tag patches, branch commit resumption, 3rd bounce escalation, and diff ceiling abort. |

---

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `src/accept/packet.ts` | `sanitize-html` | `sanitizeHtml` cleans marked HTML output | ✓ WIRED | Lines 2, 58-72: sanitizes output allowing table, details, summary, and heading tags. |
| `src/accept/urls.ts` | `src/config/env.ts` | `env.PORT` and `env.ADO_ORG_URL` fallbacks | ✓ WIRED | Lines 8, 18: defaults to `http://localhost:${env.PORT}` and `${env.ADO_ORG_URL}/_git`. |
| `src/accept/breaker.ts` | `src/db/index.ts` | `db.transaction` queries on `reworkCycles` | ✓ WIRED | Lines 14-73: runs transactional upsert with `.onConflictDoUpdate` on primary key `workItemId`. |
| `src/accept/breaker.ts` | `src/ado/work-item.ts` | `buildTagPatch` for tags | ✓ WIRED | Line 92: applies `[rework-escalated]` and removes `[awaiting-acceptance]`. |
| `src/execute/router.ts` | `src/accept/verdict.ts` | `detectAcceptanceVerdict` classified routing | ✓ WIRED | Line 36: classifies event into approve, reject, reset_rework, or none. |
| `src/execute/router.ts` | `src/accept/breaker.ts` | `evaluateCircuitBreaker` guards rework | ✓ WIRED | Line 70: queries bounce count before dispatching rework worker or escalating to Blocked. |
| `src/execute/rework-worker.ts` | `src/sandbox/worktree.ts` | `createWorktree({ checkoutExistingBranch: true })` | ✓ WIRED | Line 72: re-attaches to existing task branch preserving commit history. |
| `src/execute/rework-worker.ts` | `src/accept/packet.ts` | `formatAcceptancePacketComment` | ✓ WIRED | Line 294: compiles new acceptance packet comment with latest test run and cumulative diff. |
| `src/execute/rework-worker.ts` | `src/ado/work-item.ts` | `transitionToDevDoneWithPacket` | ✓ WIRED | Line 306: transitions work item back to `Dev Done` with `[awaiting-acceptance]` tag. |
| `src/ado/work-item.ts` | `src/accept/packet.ts` | `buildDevDoneAcceptancePatch` | ✓ WIRED | Line 205: constructs JSON patch document for Dev Done transition. |
| `src/ado/work-item.ts` | `src/accept/breaker.ts` | `buildEscalationPatch` | ✓ WIRED | Line 214: constructs JSON patch document for Blocked escalation. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `src/accept/packet.ts` | `AcceptancePacketData` | `calculateCumulativeDiff` + `parseVitestSummary` + `resolveUrls` | Yes (real LOC count, test results, durations, URLs) | ✓ FLOWING |
| `src/accept/breaker.ts` | `ReworkCycle` | SQLite transactional query `tx.select().from(reworkCycles)` | Yes (atomic bounce counts persisted in SQLite) | ✓ FLOWING |
| `src/accept/verdict.ts` | `AcceptanceVerdict` | ADO work item state transition (`fields['System.State']`) and discussion (`fields['System.History']`) | Yes (real state differences and parsed human feedback) | ✓ FLOWING |
| `src/accept/envelope.ts` | `CumulativeReworkEnvelope` | Ticket AC + `git merge-base` cumulative diff + human reviewer comment | Yes (dynamic XML prompt context with computed remaining LOC budget) | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Acceptance Packet & URL unit test suite | `npx vitest run tests/acceptance-packet.test.ts` | 5 passed (5) in 427ms | ✓ PASS |
| Rework Circuit Breaker unit test suite | `npx vitest run tests/rework-breaker.test.ts` | 7 passed (7) in 402ms | ✓ PASS |
| Human Verdict Detector unit test suite | `npx vitest run tests/verdict-detector.test.ts` | 15 passed (15) in 785ms | ✓ PASS |
| End-to-End Rework Integration test suite | `npx vitest run tests/rework-integration.test.ts` | 9 passed (9) in 5.38s | ✓ PASS |
| Full Phase 4 test suite | `npx vitest run tests/acceptance-packet.test.ts tests/rework-breaker.test.ts tests/verdict-detector.test.ts tests/rework-integration.test.ts` | 4 passed, 36 passed (36) in 7.21s | ✓ PASS |
| Runtime URL Resolver execution | `npx tsx -e "import('./src/accept/urls.ts').then(m => { console.log(m.resolvePreviewUrl(101)); console.log(m.resolvePrUrl(101, 'task/feat')); })"` | `http://localhost:3000/preview/101`<br>`https://dev.azure.com/my-org/_git?version=GBtask%2Ffeat` | ✓ PASS |
| Runtime Acceptance Packet comment generation | `npx tsx -e "import('./src/accept/packet.ts').then(m => { console.log(m.formatAcceptancePacketComment({ workItemId: 1, testSuite: 'vitest', totalTests: 1, passed: 1, failed: 0, durationMs: 10, gitDiffStat: { filesChanged: 1, insertions: 1, deletions: 0, totalLoc: 1, rawStat: '1 file' } }).slice(0, 56)); })"` | `<h3>[Acceptance Packet] Functional Verification Complete</h3>` | ✓ PASS |
| Runtime Circuit Breaker bounce evaluation and reset | `npx tsx -e "import('./src/accept/breaker.ts').then(async m => { console.log(await m.evaluateCircuitBreaker(99999, 'accept')); m.resetCircuitBreaker(99999); })"` | `{ allowed: true, currentCount: 1 }` | ✓ PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| ACCP-01 | 04-01-PLAN | System transitions work item to "Dev Done" with acceptance packet attached: test run summary, diff stat, PR link, and preview/staging URL where available. | ✓ SATISFIED | `src/accept/packet.ts`, `src/accept/urls.ts`, `src/ado/work-item.ts` (`transitionToDevDoneWithPacket`); verified in `tests/acceptance-packet.test.ts` and `tests/rework-integration.test.ts`. |
| ACCP-02 | 04-03-PLAN | Human renders functional acceptance verdict (◆): approve proceeds to PR review/merge; reject moves ticket back to "In Dev" with comments. | ✓ SATISFIED | `src/accept/verdict.ts` (`detectAcceptanceVerdict`), `src/accept/envelope.ts` (`formatReworkPrompt`), `src/sandbox/worktree.ts` (`checkoutExistingBranch: true`), `src/execute/rework-worker.ts` (`processWorkItemRework`), `src/execute/router.ts`; verified in `tests/verdict-detector.test.ts` and `tests/rework-integration.test.ts`. |
| ACCP-03 | 04-02-PLAN | System enforces a shared rework circuit breaker (max 2 automated bounces across Accept + PR review) before escalating to human tech lead. | ✓ SATISFIED | `src/db/schema.ts` (`reworkCycles`), `src/accept/breaker.ts` (`evaluateCircuitBreaker`, `resetCircuitBreaker`, `buildEscalationPatch`), `src/execute/router.ts`; verified in `tests/rework-breaker.test.ts` and `tests/rework-integration.test.ts`. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| None | - | None | - | Clean codebase; zero TODO/FIXME comments, stubs, or unhandled early exits found. |

---

### Human Verification Required

### 1. Visual Inspection of Acceptance Packet in ADO Boards

**Test:** Inspect an updated work item in Azure DevOps Boards at `Dev Done` state.
**Expected:** The work item discussion displays an HTML comment with header `[Acceptance Packet] Functional Verification Complete`, a metrics table showing test pass count, cumulative LOC stat (<250 LOC ceiling), PR link, preview link, collapsible reviewer instructions (`Ready for QA` to approve, `In Dev` to reject, `[reset-rework]` to reset), and trailing `<!-- [automated-agent] -->` loop shield.
**Why human:** Automated tests verify markdown generation and sanitization, but live visual rendering inside Azure DevOps Boards web UI requires human inspection.

### 2. Live ADO Service Hook Webhook Verification

**Test:** Drag a work item from `Dev Done` to `Ready for QA` or `In Dev` on a live Azure DevOps board connected to the gateway.
**Expected:** On `Ready for QA`, work item receives tag `[acceptance-approved]` and removes `[awaiting-acceptance]`. On `In Dev`, system extracts review comments, initiates rework on the task branch, and transitions back to `Dev Done` (or sets state to `Blocked` with tag `[rework-escalated]` if bounce count exceeds 2).
**Why human:** Automated integration tests mock the ADO REST client; testing live webhook ingress and HMAC signature verification against Microsoft Azure DevOps servers requires human deployment.

---

### Gaps Summary

No functional gaps blocking Phase 4 goals were identified. All three requirements (`ACCP-01`, `ACCP-02`, `ACCP-03`) are fully satisfied in implemented code and covered by automated unit and integration tests.

**Architecture Note:** Initial task execution in `src/execute/worker.ts` (Phase 3) currently transitions work items to `Dev Done` using `transitionToDevDone` with L3 evidence comments. Rework cycles in `src/execute/rework-worker.ts` (Phase 4) use `transitionToDevDoneWithPacket` to post the complete acceptance packet and apply the `[awaiting-acceptance]` tag. In Phase 5 (MERGE), when PR creation (`MRG-01`) is introduced on initial branch push, the initial execution path can be unified to attach the acceptance packet containing the freshly created PR link.

---

_Verified: 2026-09-09T09:15:00Z_
_Verifier: the agent (gsd-verifier)_
