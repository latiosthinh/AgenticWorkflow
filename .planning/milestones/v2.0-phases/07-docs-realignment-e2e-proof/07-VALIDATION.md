---
phase: 7
slug: docs-realignment-e2e-proof
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-18
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/state-matrix-sync.test.ts tests/e2e-v2-golden-path.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick unit test (`npx vitest run tests/state-matrix-sync.test.ts tests/e2e-v2-golden-path.test.ts`)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | TAX-02 | T-07-01 | Automated state matrix sync test | unit | `npx vitest run tests/state-matrix-sync.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | TAX-02 | T-07-02 | End-to-end 9-step simulation on StateStore | integration | `npx vitest run tests/e2e-v2-golden-path.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-03 | 01 | 1 | TAX-02 | T-07-03 | Documentation sweep and stale reference cleanup | static | `npx vitest run tests/state-matrix-sync.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/e2e-v2-golden-path.test.ts` — covers full 9-step E2E simulation (TAX-02)
- [ ] `tests/state-matrix-sync.test.ts` — covers state matrix synchronization and documentation assertion (TAX-02)

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
