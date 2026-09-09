---
phase: 5
slug: merge-pr-lifecycle-native-ci-gate-verification
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-09
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit -x` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

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
| 5-01-01 | 01 | 1 | MRG-01 | T-5-01 | Create PR with AB#<id> header and link ArtifactLink relation to work item | integration | `npx vitest run tests/pr-lifecycle.test.ts -t "create"` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 1 | MRG-03 | T-5-02 | Query native policy evaluations and block merge when policies are pending/failed | unit | `npx vitest run tests/branch-policy.test.ts` | ❌ W0 | ⬜ pending |
| 5-02-01 | 02 | 2 | MRG-02, MRG-04 | T-5-03 | Detect review vote, extract active thread comments, increment shared breaker, push to task branch | integration | `npx vitest run tests/pr-review.test.ts` | ❌ W0 | ⬜ pending |
| 5-02-02 | 02 | 2 | MRG-05 | T-5-04 | Handle PR merge event, patch state to Ready for QA, and post [Merge Summary] HTML comment | integration | `npx vitest run tests/pr-merge.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/pr-lifecycle.test.ts` — Tests for PR creation, description formatting, and ArtifactLink work item attachment
- [ ] `tests/branch-policy.test.ts` — Tests for native ADO policy evaluation reading and merge blockage
- [ ] `tests/pr-review.test.ts` — Tests for PR review rejection detection, thread comment extraction, and shared breaker increment
- [ ] `tests/pr-merge.test.ts` — Tests for PR merge webhook handling, Ready for QA transition, and Merge Summary comment

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Azure Repos PR UI inspection | MRG-01, MRG-03 | Requires active Azure DevOps project with branch policies configured | Open PR in Azure Repos UI; verify AB# link, L1/L3 description, and policy evaluation checkmarks |
