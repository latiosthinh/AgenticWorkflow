---
phase: 4
slug: l7-evidence-index-extension
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-17
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 |
| **Config file** | `package.json` test script |
| **Quick run command** | `npx vitest run tests/deploy-evidence-index.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick unit test (`npx vitest run tests/deploy-evidence-index.test.ts`)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | EVID-02 | T-04-01 | Additive L7 state schema | unit | `npx vitest run tests/state-store.test.ts` | ✅ existing | ⬜ pending |
| 04-01-02 | 01 | 1 | EVID-02 | T-04-01 | Compiler L1–L7 derivation from GOLDEN_PATH_V2 | unit | `npx vitest run tests/deploy-evidence-index.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | EVID-03 | T-04-02 | Fail-closed MissingEvidenceError & zero fallbacks | unit | `npx vitest run tests/deploy-evidence-index.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | EVID-02 | T-04-03 | Formatted comment update and cutover tolerance | unit | `npx vitest run tests/deploy-orchestrator.test.ts tests/deploy-evidence-index.test.ts` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/deploy-evidence-index.test.ts` — covers EVID-02 and EVID-03 (full L1–L7 compilation, fail-closed `MissingEvidenceError`, cutover tolerance, recompile freshness, and zero-fabrication grep assertion).

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
