---
phase: 3
slug: pm-scope-lock-gate
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-17
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/scope-gate.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick unit test (`npx vitest run tests/scope-gate.test.ts tests/worker.test.ts`)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | SCOPE-01 | T-03-01 | Ticket parks on New + awaiting tag; packet posted; no dev transition | integration | `npx vitest run tests/scope-gate.test.ts -t "SCOPE-01"` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | SCOPE-03 | T-03-02 | Pre-LLM idempotency guard prevents re-audit bypass | integration | `npx vitest run tests/scope-gate.test.ts -t "SCOPE-03 bypass"` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | SCOPE-02 | T-03-03 | Verdict via state/tag & tokens; scope-lock record written; echo-safe | unit / integration | `npx vitest run tests/scope-gate.test.ts -t "SCOPE-02"` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | SCOPE-03 | T-03-04 | Separate refinement counter; does not poison shared breaker | integration | `npx vitest run tests/scope-gate.test.ts -t "SCOPE-03 breaker"` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 3 | SCOPE-02 | T-03-05 | Watchdog 24h ping / 72h escalation / webhook reconcile | integration | `npx vitest run tests/scope-gate.test.ts -t "watchdog"` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 3 | SCOPE-03 | T-03-06 | Router Step 3 guard refuses In Dev without scope lock | integration | `npx vitest run tests/scope-gate.test.ts -t "router guard"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/scope-gate.test.ts` — covers SCOPE-01, SCOPE-02, SCOPE-03 end-to-end.
- [ ] Update `tests/worker.test.ts` Case 1 — update assertion from v1.0 `Ready to Dev` auto-transition to v2.0 parked `New` + `[awaiting-scope-lock]`.
- [ ] Update `tests/lifecycle-replay.test.ts` — verify rev 2/rev 3 flow with scope-locked prerequisite.

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-09-17
