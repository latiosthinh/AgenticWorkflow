# Phase 6: QA — Verification Loop - Context

**Gathered:** 2026-09-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Post-merge integration verification with deterministic failure handling across four requirements:
- QA-01: "Ready for QA" triggers integration/e2e suite on staging.
- QA-02: 2-strike flake filter with consecutive identical failure verification before bounce.
- QA-03: QA failure moves ticket to "In Dev" with reproduction logs + diagnostics (bounce cap 2, then human escalation).
- QA-04: QA pass transitions ticket to "Ready to Deploy" + QA evidence summary.

</domain>

<decisions>
## Implementation Decisions

### Test Suite Execution & Staging Trigger
- ADO `workitem.updated` webhook detecting `System.State == 'Ready for QA'` enqueues work item to `workItemQueueManager` lane
- Configurable test command via `QA_TEST_COMMAND` (defaults to `npm run test:integration`) with sanitized env pointing to staging
- Execution in ephemeral worktree on target merge commit with clean staging environment variables
- 300s process execution timeout with tree kill cascade via execa

### 2-Strike Flake Filter & Failure Matching
- Consecutive identical failures defined as matching set of failing test names and normalized error signatures across both runs
- Immediate sequential rerun in fresh worktree execution context upon first run failure
- Transient flakes (fail then pass) resolved as passing with `[qa-flake-cleared]` audit note in QA evidence
- QA run history and strike state persisted in SQLite table `qa_runs` tracking run index, strike count, failed test signatures, and timestamps

### Failure Diagnostics & Rework Routing / Bounce Cap
- Sanitized collapsible HTML (`<details><summary>`) with failed test traces, stdout/stderr tails, and loop shield `<!-- [automated-agent] -->`
- Dedicated `qa_bounces` counter in SQLite (cap 2); 3rd strike transitions to `Blocked` with `[qa-escalated]` tag
- State transitions to `In Dev`, tag `[qa-failed]` applied, loop shield diagnostics posted
- Structured `<qa_failure_diagnostic>` envelope with failing test names, stack trace, and reproduction commands provided to rework agent

### QA Evidence Summary & State Transition to Ready to Deploy
- Passing verification defined as exit code 0 on test run 1 OR zero failures on rerun 2 (if initial run flaked)
- QA evidence summary includes test suite count, passed/failed metrics, execution duration, tested commit SHA, and staging environment
- Structured records persisted in SQLite `qa_evidence` table plus formatted HTML comment on work item
- State transitions to `Ready to Deploy`, tag `[qa-verified]` added, `[qa-failed]` removed

### Claude's Discretion
None — all four grey areas reviewed and accepted.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/queue/lane-manager.ts`: `workItemQueueManager` per-work-item serialization
- `src/sandbox/worktree.ts`: `createWorktree`, `cleanupWorktree` ephemeral git worktree isolation
- `src/sandbox/runner.ts`: `runInWorktree` execution runner with timeout and credential scrubbing
- `src/ado/work-item.ts`: `updateWorkItem`, `getWorkItem`, `addWorkItemComment` for ADO updates
- `src/ado/formatter.ts`: loop shield comments and badge formatting
- `src/execute/rework-worker.ts`: rework agent invocation with diagnostics envelope

### Established Patterns
- Fastify webhook routing in `src/ingress/routes.ts` with SQLite deduplication in `dedup_events`
- Circuit breaker / bounce tracking pattern from `src/accept/breaker.ts`
- Evidence persistence pattern from `src/test-runner/evidence.ts`

### Integration Points
- `src/ingress/routes.ts`: route `workitem.updated` to QA worker when state is `Ready for QA`
- `src/ingress/pr-router.ts`: transitions PR merged ticket to `Ready for QA`, triggering the QA loop
- ADO Work Item API: patch state to `In Dev` on failure or `Ready to Deploy` on pass

</code_context>

<specifics>
## Specific Ideas
- Deterministic 2-strike filter prevents false positive bounces from flaky network/timing issues in e2e tests
- Dedicated QA bounce cap (2) prevents infinite ping-pong between In Dev and QA

</specifics>

<deferred>
## Deferred Ideas
None — discussion stayed within phase scope.

</deferred>
