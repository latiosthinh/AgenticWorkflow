---
phase: 4
slug: accept-human-validation-gate-rework-breaker
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-08
---

# Phase 4 — Validation Strategy

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
| 4-01-01 | 01 | 1 | ACCP-01 | T-4-01 | Format acceptance packet with L3 summary, diff stat, PR link, preview URL, and [awaiting-acceptance] tag | unit | `npx vitest run tests/acceptance-packet.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | ACCP-03 | T-4-02 | Shared rework breaker in SQLite enforces max 2 bounces, escalates to Blocked on 3rd, supports [reset-rework] | unit | `npx vitest run tests/rework-breaker.test.ts` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 2 | ACCP-02 | T-4-03 | Rejection from Dev Done to In Dev extracts human feedback, builds cumulative envelope, and preserves task branch | integration | `npx vitest run tests/rework-envelope.test.ts` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 2 | ACCP-02 | T-4-04 | End-to-end acceptance flow: approve unlocks merge path; reject triggers bounded rework and re-verifies tests | integration | `npx vitest run tests/acceptance-flow.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/acceptance-packet.test.ts` — Unit tests for acceptance packet HTML rendering and ADO work item tag patching
- [ ] `tests/rework-breaker.test.ts` — Tests for SQLite rework cycle persistence, 2-bounce trip, and reset mechanism
- [ ] `tests/rework-envelope.test.ts` — Tests for cumulative diff assembly, feedback comment extraction, and branch checkout
- [ ] `tests/acceptance-flow.test.ts` — End-to-end integration tests for approval, rejection rework, and escalation states

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual inspection of Acceptance Packet in ADO | ACCP-01 | Requires active Azure DevOps Boards web interface | View work item in Dev Done state; verify acceptance packet HTML card, preview link, and collapsible diff summary |
