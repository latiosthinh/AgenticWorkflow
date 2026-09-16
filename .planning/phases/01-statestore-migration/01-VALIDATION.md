---
phase: 1
slug: statestore-migration
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-16
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/dedup.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick unit test for modified module (`npx vitest run tests/<module>.test.ts`)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | STATE-01 | T-01-01 | Safe path resolution, no traversal | unit | `npx vitest run tests/state-store.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | STATE-02 | T-01-02 | Atomic create-if-absent wx flag dedup | integration | `npx vitest run tests/dedup.test.ts` | ✅ existing | ⬜ pending |
| 01-03-01 | 03 | 2 | STATE-03 | T-01-03 | Rejects off-lane mutations | unit | `npx vitest run tests/state-single-writer.test.ts` | ❌ W0 | ⬜ pending |
| 01-04-01 | 04 | 2 | STATE-04 | T-01-04 | Readdir scan & ticket lifecycle parity | unit | `npx vitest run tests/state-scans.test.ts` | ❌ W0 | ⬜ pending |
| 01-05-01 | 05 | 3 | STATE-04 | T-01-05 | Full suite 277+ green on mkdtemp | regression | `npm test` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/state/types.ts` & `src/state/store.ts` — core `StateStore` implementation
- [ ] `tests/state-store.test.ts` — unit tests for document parsing, serialization, and ticket lifecycle operations
- [ ] `tests/state-single-writer.test.ts` — verification of single-writer invariant and win32 crash-atomic updates
- [ ] `src/state/test-harness.ts` — shared `mkdtemp` test fixture for tests

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-09-16
