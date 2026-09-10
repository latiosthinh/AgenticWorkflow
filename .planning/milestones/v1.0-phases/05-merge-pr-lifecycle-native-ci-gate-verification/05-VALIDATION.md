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
| 5-01-01 | 01 | 1 | MRG-01 | T-5-01 | Add Git/PR APIs to ADO client, build Markdown/HTML formatters with AB# and loop shields | unit | `npx vitest run tests/pr-lifecycle.test.ts -t "format"` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 1 | MRG-01 | T-5-01 | Create PR targeting main and link ArtifactLink relation to ADO work item | integration | `npx vitest run tests/pr-lifecycle.test.ts -t "create"` | ❌ W0 | ⬜ pending |
| 5-02-01 | 02 | 2 | MRG-03 | T-5-02 | Query native policy evaluations and block merge when L2/L3/L4 policies pending/failed | unit | `npx vitest run tests/branch-policies.test.ts -t "evaluations"` | ❌ W0 | ⬜ pending |
| 5-02-02 | 02 | 2 | MRG-02, MRG-03 | T-5-02 | Two-key merge authorization check ([acceptance-approved] + human vote >= 5) and PR thread extraction | unit | `npx vitest run tests/branch-policies.test.ts -t "gate"` | ❌ W0 | ⬜ pending |
| 5-03-01 | 03 | 3 | MRG-04 | T-5-03 | PR review rejection router, shared max-2 breaker, cumulative rework envelope, task branch push | integration | `npx vitest run tests/pr-rework.test.ts` | ❌ W0 | ⬜ pending |
| 5-03-02 | 03 | 3 | MRG-05 | T-5-04 | Handle git.pullrequest.merged webhook, transition to Ready for QA, post [Merge Summary] HTML comment | integration | `npx vitest run tests/pr-merge.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/pr-lifecycle.test.ts` — Tests for PR creation, description formatting, and ArtifactLink work item attachment
- [ ] `tests/branch-policies.test.ts` — Tests for native ADO policy evaluation reading, merge blockage, and thread comment parsing
- [ ] `tests/pr-rework.test.ts` — Tests for PR review rejection detection, cumulative rework prompt assembly, and shared breaker increment
- [ ] `tests/pr-merge.test.ts` — Tests for PR merge webhook handling, Ready for QA transition, and Merge Summary comment

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Azure Repos PR UI inspection | MRG-01, MRG-03 | Requires active Azure DevOps project with branch policies configured | Open PR in Azure Repos UI; verify AB# link, L1/L3 description, and policy evaluation checkmarks |
