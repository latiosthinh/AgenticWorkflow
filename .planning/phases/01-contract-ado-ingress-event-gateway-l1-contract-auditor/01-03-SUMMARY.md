---
phase: 01-contract-ado-ingress-event-gateway-l1-contract-auditor
plan: 03
subsystem: ado-worker
tags:
  - azure-devops
  - rest-client
  - exponential-backoff
  - html-formatter
  - worker-pipeline
  - fastify-bootstrap
  - sqlite-audit-log
dependency_graph:
  requires:
    - 01-01
    - 01-02
  provides:
    - Resilient Azure DevOps WebApi client with exponential backoff and jitter
    - Sanitized HTML discussion comment formatter with [L1 Evidence] badge and [automated-agent] marker
    - Work Item Tracking JSON Patch operations for state transitions and history comments
    - Background audit worker orchestrating evaluation, ADO updates, and SQLite audit logging
    - Fastify server bootstrap with startup TTL cleanup and graceful shutdown
    - End-to-end integration test suites for ADO client and worker pipeline
  affects:
    - Phase 2 (EXECUTE Foundation will trigger upon work items reaching In Dev state)
tech_stack:
  added:
    - azure-devops-node-api@^17.0.0
    - sanitize-html@^2.17.7
    - marked@^18.0.11
  patterns:
    - Exponential backoff with jitter on HTTP 429 and 5xx errors
    - HTML comment sanitization using sanitize-html (T-1-06 mitigation)
    - Anti-loop marker <!-- [automated-agent] --> appended to discussion comments (T-1-05 mitigation)
    - Two-operation JSON Patch document for atomic state transition and history logging
    - Graceful process termination with Fastify listener closure, queue lane drain, and DB shutdown
key_files:
  created:
    - src/ado/client.ts
    - src/ado/formatter.ts
    - src/ado/work-item.ts
    - src/auditor/worker.ts
    - src/index.ts
    - tests/ado-client.test.ts
    - tests/worker.test.ts
  modified:
    - src/ingress/routes.ts
    - src/queue/lane-manager.ts
decisions:
  - "Implemented withRetry helper supporting HTTP 429 Retry-After headers and exponential backoff with jitter (capped at 10s)"
  - "Sanitized markdown-rendered HTML via sanitize-html before appending <!-- [automated-agent] --> loop shield comment"
  - "Constructed two-step JSON Patch operations (replace System.State and add System.History) for atomic ADO work item updates"
  - "Restricted L1 audit transitions strictly to tickets in 'New' state; non-'New' tickets are marked 'skipped' in dedup_events without mutation"
  - "Persisted comprehensive audit records in SQLite audit_log table with JSON-stringified reasons and criteria summary"
  - "Integrated startup and daily 7-day TTL cleanup and graceful signal handling (SIGINT/SIGTERM) draining all active lane queues"
metrics:
  duration: 4m
  completed_date: "2026-09-08"
  tasks: 2
  files: 7
---

# Phase 01 Plan 03: Azure DevOps REST Client & Background Worker Pipeline Summary

Substantive achievement: Completed the L1 Contract Auditor pipeline by connecting the resilient Azure DevOps REST client, HTML discussion comment formatters with anti-loop shielding, background worker workflow, and Fastify server lifecycle bootstrap.

## Key Changes

1. **Azure DevOps REST Client & Exponential Backoff:**
   - Implemented `AdoClient` in `src/ado/client.ts` with connection caching and dependency injection support for mock testing.
   - Built generic `withRetry<T>` wrapper catching HTTP 429 and 5xx responses, extracting `Retry-After` headers or applying exponential backoff with jitter (`Math.min(10000, baseDelayMs * 2 ** (attempt - 1) + Math.random() * 200)`).

2. **Sanitized HTML Discussion Formatter (T-1-05 & T-1-06):**
   - Implemented `formatL1AuditComment` in `src/ado/formatter.ts` parsing Markdown to HTML via `marked`.
   - Sanitized all HTML tags with `sanitize-html` to neutralize any XSS payloads from untrusted ticket inputs (T-1-06).
   - Injected `<strong>[L1 Evidence] Contract Audit: PASSED</strong>` and DoD checklist for verified tickets.
   - Injected `<strong>[L1 Evidence] Contract Audit: INCOMPLETE (Action Required)</strong>` with missing criteria and developer remediation instructions for ambiguous tickets.
   - Appended `<!-- [automated-agent] -->` comment marker to all outbound discussion posts to prevent webhook echo loops (T-1-05).

3. **Work Item JSON Patch Operations:**
   - Implemented `getWorkItemDetails`, `transitionToReadyToDev`, and `postFeedbackComment` in `src/ado/work-item.ts`.
   - Built `buildReadyToDevPatch` (`Operation.Replace` on `/fields/System.State` to `'Ready to Dev'`, `Operation.Add` on `/fields/System.History`).
   - Built `buildFeedbackPatch` (`Operation.Add` on `/fields/System.History` retaining ticket in `'New'`).

4. **Background Audit Worker Pipeline:**
   - Implemented `processWorkItemAudit` in `src/auditor/worker.ts`.
   - Filtered tickets by state: tickets not in `'New'` (e.g. `'In Dev'`) are marked `'skipped'` in `dedup_events` and avoided.
   - Invoked `auditTicketContract` reasoning engine to evaluate Definition of Done.
   - Recorded audit outcome in SQLite `auditLogs` table (`verdict`, `reasons`, `criteriaSummary`, `model: 'gpt-4o'`).
   - Dispatched state transitions and discussion comments, updating `dedup_events` to `'completed'`.
   - On unhandled error: marked `dedup_events` as `'failed'` with error message.
   - Wired `processWorkItemAudit` into `src/ingress/routes.ts` as the default background work item handler.

5. **Server Lifecycle Bootstrap:**
   - Created `src/index.ts` registering `fastifyRawBody`, `@fastify/sensible`, and `webhookRoutes`.
   - Configured startup 7-day TTL purge (`purgeOldDedupEvents(7)`) and 24-hour interval timer.
   - Implemented `drainAll()` in `src/queue/lane-manager.ts` and wired graceful shutdown on `SIGINT` / `SIGTERM` closing Fastify, draining active lanes, and closing SQLite connection.

6. **Comprehensive Test Suites:**
   - `tests/ado-client.test.ts`: Verified `withRetry` 429 recovery/exhaustion, non-retryable 4xx errors, XSS sanitization, comment formatting, and JSON Patch generation.
   - `tests/worker.test.ts`: Verified passing ticket transitions to Ready to Dev, failing ticket feedback comments, non-New ticket skipping, error state marking, and end-to-end webhook ingress dispatch.

## Verification Results

- `npx vitest run tests/ado-client.test.ts`: 13 passed (100%).
- `npx vitest run tests/worker.test.ts`: 5 passed (100%).
- Full test suite `npx vitest run`: 44 passed across 6 test files.
- TypeScript compiler check `npm run build`: 0 errors.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: src/ado/client.ts
- FOUND: src/ado/formatter.ts
- FOUND: src/ado/work-item.ts
- FOUND: src/auditor/worker.ts
- FOUND: src/index.ts
- FOUND: tests/ado-client.test.ts
- FOUND: tests/worker.test.ts
- FOUND commit 5365e8a: feat(01-03): implement azure devops rest client, backoff and comment formatter
- FOUND commit 1a78720: feat(01-03): implement background worker pipeline and server lifecycle
