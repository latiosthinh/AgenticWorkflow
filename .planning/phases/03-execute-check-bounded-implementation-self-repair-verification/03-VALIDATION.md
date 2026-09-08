---
phase: 3
slug: execute-check-bounded-implementation-self-repair-verification
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-08
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit -x` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit -x`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | IMPL-01 | T-3-01, T-3-02 | Enforce <250 LOC diff ceiling; abort and roll back if additions+deletions exceed budget; validate dependencies | unit | `npx vitest run tests/diff-budget.test.ts` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | IMPL-02 | T-3-03 | Reject modifications/deletions of baseline test files; require assertions in newly created test files | unit | `npx vitest run tests/test-guard.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 2 | TEST-02 | T-3-04 | Prune stack traces to 15 frames; iterate self-repair up to 3-5 cycles; push WIP branch on exhaustion | unit | `npx vitest run tests/repair-loop.test.ts` | ❌ W0 | ⬜ pending |
| 3-03-01 | 03 | 3 | TEST-01 | — | Generate structured L3 Evidence JSON; persist to SQLite and post [L3 Evidence] comment | unit | `npx vitest run tests/l3-evidence.test.ts` | ❌ W0 | ⬜ pending |
| 3-03-02 | 03 | 3 | TEST-01 | — | Transition work item state to Dev Done, update [l3-verified] tag, and record execution trace | integration | `npx vitest run tests/execute-flow.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/diff-budget.test.ts` — Tests for diff ceiling calculation, rollback, and dependency allowlist verification
- [ ] `tests/test-guard.test.ts` — Tests for baseline test file immutability and empty test assertion rejection
- [ ] `tests/repair-loop.test.ts` — Tests for test output parser, stack trace pruner, and self-repair loop retry limits
- [ ] `tests/l3-evidence.test.ts` — Tests for L3 evidence schema formatting and SQLite persistence
- [ ] `tests/execute-flow.test.ts` — Integration test for end-to-end plan execution, repair, and Dev Done transition

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Multi-file patch visual inspection in Azure Repos | IMPL-01 | Requires pushing real branch to Azure Repos and inspecting PR diff UI | Push task branch with multi-file change, verify diff in Azure Repos matches expected LOC |
