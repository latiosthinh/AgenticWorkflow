# Phase 7: DEPLOY — Native Environment Approval & Telemetry Monitor - Context

**Gathered:** 2026-09-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Human-gated deployment via native ADO Environments (L5) and post-deploy telemetry confidence (L6) across three requirements:
- DPLY-01: Deployment gated by native ADO Environment approval (human ◆) with release notes, migration safety, and rollback readiness (L5 Evidence). No custom approval UI.
- DPLY-02: Post-deployment monitor reads Azure Monitor / Application Insights telemetry for a defined evaluation window (default 30 min): error-rate spike and p95-latency regression checks (L6 Prod Confidence); alert bounces release and notifies owner.
- DPLY-03: Monitor window passing marks work item workflow complete ("Done") with unified L1–L6 evidence index attached.

</domain>

<decisions>
## Implementation Decisions

### Native ADO Environment Approval & L5 Evidence (DPLY-01)
- Deployment gated by native ADO Pipeline Environment approval (human ◆); agent attaches L5 readiness packet to work item discussion
- L5 readiness packet includes: release notes summary, database migration risk assessment, rollback command/procedure, and tested commit SHA
- Active deployment tracking: state remains `Ready to Deploy`, tag `[deploying]` added, `[qa-verified]` retained
- Deployment stage completion detected via ADO service hook webhook for pipeline stage state changed (`StageCompleted` on Environment) with polling fallback

### Telemetry Window, Metrics & Failure Breach Handling (DPLY-02)
- Production telemetry metrics fetched via Azure Monitor / Application Insights REST client with configurable credentials + pluggable mock/offline driver for testing
- Configurable evaluation window `TELEMETRY_WINDOW_MINUTES` (default 30m, 1m in test) sampled at regular intervals
- Regression threshold breach defined as: error rate spike > 1.0% OR p95 latency > 500ms (or >20% baseline regression)
- Telemetry breach handling: alert posted with rollback instructions, tag `[deploy-regressed]` applied, ticket moved to `In Dev` for urgent remediation

### L1–L6 Complete Evidence Index & Done State Transition (DPLY-03)
- Work item marked `Done` strictly after telemetry window passes with zero threshold breaches
- Unified L1–L6 evidence index includes comprehensive audit table:
  - L1: Contract audit (DoD completeness & testability)
  - L2: Code review & quality scans
  - L3: Local unit tests & QA staging integration tests
  - L4: Security / SAST policy gate
  - L5: ADO Environment human approval & release notes
  - L6: Production telemetry monitoring (error rate & p95 latency)
- Evidence index persisted in SQLite table `evidence_index` + formatted sanitized HTML comment on work item with loop shield `<!-- [automated-agent] -->`
- On completion: state transitions to `Done`, tag `[golden-path-complete]` added, `[deploying]` removed

### Claude's Discretion
None — all three grey areas reviewed and accepted.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ado/client.ts`: `adoClient` for ADO REST API interactions with retry
- `src/ado/work-item.ts`: `getWorkItemDetails`, `updateWorkItem`, `buildTagPatch` for work item mutations
- `src/ado/formatter.ts`: HTML sanitization and `<!-- [automated-agent] -->` loop shield formatting
- `src/db/schema.ts` & `src/db/index.ts`: SQLite schema and persistent storage
- `src/ingress/routes.ts`: Fastify webhook ingress with deduplication and lane queues
- `src/execute/router.ts`: Event router for dispatching pipeline stage events

### Established Patterns
- Fastify service hook webhook receiving ADO events (`ms.vss-pipelines.stage-state-changed-event`)
- Circuit breaker / escalation pattern from `src/accept/breaker.ts` and `src/qa/breaker.ts`
- Structured evidence persistence pattern from `src/test-runner/evidence.ts` and `src/qa/runner.ts`

### Integration Points
- `src/ingress/routes.ts`: route pipeline stage completion webhooks to deployment orchestrator
- `src/execute/router.ts`: route `Ready to Deploy` / pipeline events
- Azure Monitor / Application Insights REST API integration for metrics queries

</code_context>

<specifics>
## Specific Ideas
- Native-first governance: Environment approval is handled entirely in ADO Pipelines UI; our orchestrator attaches L5 evidence and monitors the outcome without custom approval UI.
- Deterministic L6 monitoring prevents unverified releases from being marked Done prematurely.

</specifics>

<deferred>
## Deferred Ideas
- Automated canary traffic shifting with instant rollback on telemetry alerts (deferred to v2 GOV-01).

</deferred>
