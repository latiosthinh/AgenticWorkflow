# Phase 7: DEPLOY — Native Environment Approval & Telemetry Monitor - Validation Strategy

**Phase:** 07 - DEPLOY — Native Environment Approval & Telemetry Monitor
**Date:** 2026-09-09
**Status:** Approved

## Validation Strategy & Test Requirements

### Automated Verification Coverage
- **Unit Tests**:
  - L5 evidence formatting (release notes, migration risk assessment, rollback command).
  - Telemetry metric evaluation logic (error rate calculation, p95 latency evaluation, threshold breach detection).
  - L1–L6 unified evidence index aggregation and HTML formatter.
- **Integration Tests**:
  - Environment approval & deployment initiation:
    - Verifies work item is tagged `[deploying]` while waiting for/processing deployment.
    - Attaches L5 evidence packet comment with loop shield.
  - Telemetry monitoring window:
    - Pass scenario: Metrics stay within limits (error rate <= 1.0%, p95 latency <= 500ms) -> transitions work item to `Done`, applies `[golden-path-complete]`, saves evidence index.
    - Breach scenario: Metric spike (e.g. error rate 2.5% or p95 latency 750ms) -> posts telemetry alert comment, tags `[deploy-regressed]`, bounces ticket to `In Dev`.
  - Ingress routing:
    - Verifies pipeline stage webhook and deployment router updates work item status appropriately.

### Exit Criteria
- `npm test` passes cleanly with all new Phase 7 test suites.
- TypeScript compiles cleanly (`npx tsc --noEmit`).
