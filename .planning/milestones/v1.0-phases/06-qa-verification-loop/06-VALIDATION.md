# Phase 6: QA — Verification Loop - Validation Strategy

**Phase:** 06 - QA — Verification Loop
**Date:** 2026-09-09
**Status:** Approved

## Validation Strategy & Test Requirements

### Automated Verification Coverage
- **Unit Tests**:
  - Failure signature normalization and comparison logic (`normalizeErrorSignature`, `compareFailures`).
  - 2-strike state machine (pass, flake recovery, confirmed regression).
  - QA bounce counter tracking and escalation threshold (cap = 2).
  - Sanitized HTML QA evidence and diagnostics formatting with loop shield.
- **Integration Tests**:
  - Full QA workflow runner with mocked ADO client:
    1. Pass scenario: State transitions to `Ready to Deploy` with `[qa-verified]`.
    2. Flake scenario: Initial fail, rerun pass -> `Ready to Deploy` with `[qa-flake-cleared]`.
    3. Failure bounce scenario: Identical failures -> State transitions to `In Dev` with `[qa-failed]` and diagnostics comment.
    4. Escalation scenario: 3rd rejection -> State transitions to `Blocked` with `[qa-escalated]`.
  - Ingress routing: verify webhook `workitem.updated` with `System.State == 'Ready for QA'` routes to QA handler in `workItemQueueManager` lane.

### Exit Criteria
- `npm test` passes cleanly with all new QA loop test suites.
- TypeScript compiles cleanly (`npx tsc --noEmit`).
