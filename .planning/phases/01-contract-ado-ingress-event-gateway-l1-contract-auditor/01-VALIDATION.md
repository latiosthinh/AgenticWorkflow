---
phase: 1
slug: contract-ado-ingress-event-gateway-l1-contract-auditor
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-07
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 |
| **Config file** | `vitest.config.ts` (Wave 0 creates) |
| **Quick run command** | `npx vitest run tests/unit -x` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

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
| 1-01-01 | 01 | 1 | INGEST-01 | T-1-01 | Valid HMAC signature accepts (HTTP 202); invalid/tampered signature rejects (HTTP 401) | integration | `npx vitest run tests/ingress.test.ts -t "HMAC"` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | INGEST-02 | T-1-03 | Duplicate (workItemId, revId) returns HTTP 200 duplicate_ignored and skips execution | integration | `npx vitest run tests/dedup.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | INGEST-03 | T-1-05 | Bot ID in revisedBy or marker in comment terminates task before LLM invocation | unit | `npx vitest run tests/bot-shield.test.ts` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 2 | CONTR-01 | T-1-04 | Auditor evaluates DoD testability and completeness with structured Zod schema output | unit | `npx vitest run tests/auditor.test.ts` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 2 | CONTR-02 | — | Valid AC patches state to Ready to Dev; ambiguous keeps New with missing specs comment | integration | `npx vitest run tests/ado-client.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — test configuration with TypeScript path resolution
- [ ] `tests/ingress.test.ts` — Fastify injection tests for HMAC validation (valid, missing, mismatched length, corrupted)
- [ ] `tests/dedup.test.ts` — SQLite table constraint tests verifying idempotency and 200 duplicate responses
- [ ] `tests/bot-shield.test.ts` — Unit tests for bot ID and marker matching
- [ ] `tests/auditor.test.ts` — Unit tests mocking LLM response to verify Zod schema validation and rubric parsing
- [ ] `tests/ado-client.test.ts` — Integration tests with mocked ADO REST client verifying JSON Patch structure

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real ADO Service Hook delivery | INGEST-01 | Requires active Azure DevOps project with outbound network connectivity | Configure Service Hook subscription in ADO pointing to tunnel endpoint; trigger ticket update |
