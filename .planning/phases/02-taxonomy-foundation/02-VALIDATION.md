---
phase: 2
slug: taxonomy-foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-17
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/taxonomy.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick unit test (`npx vitest run tests/taxonomy.test.ts tests/lifecycle-replay.test.ts`)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | TAX-01 | T-02-01 | Deeply frozen immutable taxonomy | unit | `npx vitest run tests/taxonomy.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | TAX-01 | T-02-01 | Zero runtime dependencies | unit | `npx vitest run tests/taxonomy.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | TAX-03 | T-02-02 | Taxonomy-driven router dispatch | integration | `npx vitest run tests/worker.test.ts` | ✅ existing | ⬜ pending |
| 02-02-02 | 02 | 2 | TAX-03 | T-02-02 | Complete v1 lifecycle replay parity | integration | `npx vitest run tests/lifecycle-replay.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/pipeline/taxonomy.ts` — taxonomy definition module
- [ ] `tests/taxonomy.test.ts` — unit tests for taxonomy resolution and step mapping
- [ ] `tests/lifecycle-replay.test.ts` — full lifecycle replay test

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
