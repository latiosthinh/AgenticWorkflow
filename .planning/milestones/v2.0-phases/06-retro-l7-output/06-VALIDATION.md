---
phase: 6
slug: retro-l7-output
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-18
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/learn-orchestrator.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick unit test (`npx vitest run tests/retro.test.ts tests/runbook.test.ts`)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | EVID-01 | T-06-01 | Zod action item validation & DORA metrics | unit | `npx vitest run tests/retro.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | RETRO-02 | T-06-02 | Runbook synthesis & XML prompt defense | unit | `npx vitest run tests/runbook.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | RETRO-02 | T-06-03 | Single PR dual-asset staging (SKILL+RUNBOOK) | integration | `npx vitest run tests/learn-publisher.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 2 | RETRO-01 | T-06-04 | Feedback loop persistence and L7 record | integration | `npx vitest run tests/learn-orchestrator.test.ts` | ✅ existing | ⬜ pending |
| 06-03-01 | 03 | 3 | RETRO-01 | T-06-05 | Awaited pre-Done sequencing & retry cap | integration | `npx vitest run tests/deploy-orchestrator.test.ts` | ✅ existing | ⬜ pending |
| 06-03-02 | 03 | 3 | RETRO-03 | T-06-06 | Fail-closed Done gate & [retro-failed] alert | integration | `npx vitest run tests/deploy-orchestrator.test.ts` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/retro.test.ts` — covers RETRO-01, EVID-01
- [ ] `tests/runbook.test.ts` — covers RETRO-02
- [ ] `tests/learn-publisher.test.ts` — covers RETRO-02

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

**Approval:** 2026-09-18
