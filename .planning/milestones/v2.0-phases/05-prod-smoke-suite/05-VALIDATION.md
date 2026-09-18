---
phase: 5
slug: prod-smoke-suite
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-18
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 |
| **Config file** | `package.json` test script (`vitest run`) |
| **Quick run command** | `npx vitest run tests/deploy-smoke.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick unit test (`npx vitest run tests/deploy-smoke.test.ts`)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | SMOKE-01 | T-05-01 | Fail-closed env validation, probe HTTP health and commit SHA | unit | `npx vitest run tests/deploy-smoke.test.ts -t "probeProductionHealth"` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | SMOKE-03 | T-05-02 | StateStore schema types and lane serialization | unit | `npx vitest run tests/state-store.test.ts` | ✅ existing | ⬜ pending |
| 05-02-01 | 02 | 2 | SMOKE-02 | T-05-03 | INFRA vs APP classifier, 2-strike filter | unit | `npx vitest run tests/deploy-smoke.test.ts -t "classifySmokeError"` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 2 | SMOKE-02 | T-05-04 | Sandboxed command execution, secret redaction, timeout | integration | `npx vitest run tests/deploy-smoke.test.ts -t "executeSandboxedSmokeSuite"` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 3 | SMOKE-01 | T-05-05 | Smoke runs before telemetry in deployment workflow | integration | `npx vitest run tests/deploy-orchestrator.test.ts tests/deploy-smoke.test.ts` | ✅ existing | ⬜ pending |
| 05-03-02 | 03 | 3 | SMOKE-03 | T-05-06 | StateStore persistence and evidence index inclusion | integration | `npx vitest run tests/deploy-smoke.test.ts -t "StateStore persistence"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/deploy-smoke.test.ts` — covers SMOKE-01, SMOKE-02, SMOKE-03
- [ ] `src/deploy/smoke.ts` — smoke suite runner, probe, SHA verifier, 2-strike filter, alert formatter
- [ ] `src/config/env.ts` — add `PRODUCTION_SMOKE_URL`, `SMOKE_TEST_COMMAND`, `SMOKE_TIMEOUT_MS`
- [ ] `src/state/types.ts` — add `SmokeRunEntry`, `SmokeEvidenceState`

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
