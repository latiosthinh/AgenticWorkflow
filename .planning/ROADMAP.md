# Roadmap: Agentic SDLC Workflow

## Overview

Deliver autonomous, human-in-the-loop SDLC automation integrated with Azure DevOps. Webhook ingestion and idempotency locks capture board events, intake audit validates acceptance criteria into "Ready to Dev", dynamic MCP harnesses and ephemeral sandboxes isolate runs, autonomous coding loops write and test code before opening PRs into "Dev Done", review loops handle feedback iterations, and QA verification gates validate staging readiness before reaching "Ready to Deploy".

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: ADO Ingress, Event Orchestration & Core Integration** - Webhook listener, HMAC verification, SQLite deduplication lock, and ADO client foundation.
- [ ] **Phase 2: SDLC State Machine & Intake Requirements Auditor** - Finite state machine engine, ticket parser, and LLM requirements quality gate for "Ready to Dev".
- [ ] **Phase 3: Ephemeral Sandbox & Dynamic MCP Tool Infrastructure** - Ephemeral git worktree lifecycle manager, process isolation with secret scrubbing, and domain-scoped MCP servers.
- [ ] **Phase 4: Autonomous Developer Agent & Test-Driven Self-Repair Loop** - Multi-file code generation, test execution, self-repair loops, PR creation, and "Dev Done" transition.
- [ ] **Phase 5: Developer Review Gate & Iterative Rework Loop** - Review outcome listener, cumulative rework prompt context, and bounce-back circuit breaker.
- [ ] **Phase 6: QA Verification Gate & Workflow Completion** - Post-merge QA validation agent, deterministic flake check, diagnostic reporting, and "Ready to Deploy" completion.

## Phase Details

### Phase 1: ADO Ingress, Event Orchestration & Core Integration
**Goal**: Ingest and verify Azure DevOps service hooks with deduplication and loop protection
**Depends on**: Nothing (first phase)
**Requirements**: INGEST-01, INGEST-02, INGEST-03
**Success Criteria** (what must be TRUE):
  1. Incoming ADO service hook webhook with valid HMAC signature is accepted with HTTP 202 and queued.
  2. Webhook delivery with invalid HMAC signature is rejected with HTTP 401.
  3. Duplicate webhook deliveries with identical (workItemId, revId) are dropped without duplicate task execution.
  4. Work item updates performed by bot identity are ignored without triggering recursive runs.
**Plans**: TBD

### Phase 2: SDLC State Machine & Intake Requirements Auditor
**Goal**: Audit incoming ticket requirements and guide work items through initial SDLC transition gates
**Depends on**: Phase 1
**Requirements**: AUDIT-01, AUDIT-02, AUDIT-03
**Success Criteria** (what must be TRUE):
  1. New work item with complete acceptance criteria automatically transitions to "Ready to Dev" with audit summary posted in discussion.
  2. Ambiguous or incomplete work item remains in triage and receives comment detailing specific missing requirements.
  3. Work item state transitions follow defined lifecycle without allowing invalid state jumps.
**Plans**: TBD

### Phase 3: Ephemeral Sandbox & Dynamic MCP Tool Infrastructure
**Goal**: Provision isolated execution worktrees with sanitized environments and domain-scoped MCP tools
**Depends on**: Phase 2
**Requirements**: DISP-01, DISP-02, SANDBOX-01, SANDBOX-02
**Success Criteria** (what must be TRUE):
  1. Work item transition to "In Dev" triggers task worker with ephemeral git worktree isolated from host repository.
  2. Domain tags on work item dynamically mount matching MCP tool servers in agent context.
  3. Process runner executes commands within strict timeout and scrubs PATs and API keys from environment and logs.
  4. Ephemeral worktree cleanly releases and deletes upon task completion or timeout.
**Plans**: TBD

### Phase 4: Autonomous Developer Agent & Test-Driven Self-Repair Loop
**Goal**: Autonomously implement code changes, verify with local tests, and open linked pull requests
**Depends on**: Phase 3
**Requirements**: EXEC-01, EXEC-02, EXEC-03, PR-01, PR-02
**Success Criteria** (what must be TRUE):
  1. Developer agent generates multi-file code modifications addressing ticket acceptance criteria.
  2. Agent runs local unit tests, detects failures, and autonomously repairs code within 3-5 iterations.
  3. Existing test assertion files are enforced read-only and agent modifications to them are rejected.
  4. Passing implementation pushes branch, opens Azure DevOps PR linked with `AB#<id>`, transitions ticket to "Dev Done", and posts summary comment.
**Plans**: TBD

### Phase 5: Developer Review Gate & Iterative Rework Loop
**Goal**: Detect developer code review outcomes and autonomously execute rework iterations
**Depends on**: Phase 4
**Requirements**: REV-01, REV-02, REV-03
**Success Criteria** (what must be TRUE):
  1. Developer moving PR ticket from "Dev Done" back to "In Dev" with review comments triggers rework agent on existing branch.
  2. Rework agent consumes cumulative context (original criteria, PR diff, review comments) to apply targeted code fixes.
  3. Rework cycle counter caps at 2 automated iterations, escalating to human intervention if issues persist.
  4. Developer PR approval/merge advances ticket to next stage without triggering additional rework.
**Plans**: TBD

### Phase 6: QA Verification Gate & Workflow Completion
**Goal**: Run integration test validation on merged changes and transition completed tickets to deployment ready
**Depends on**: Phase 5
**Requirements**: QA-01, QA-02, QA-03, QA-04
**Success Criteria** (what must be TRUE):
  1. PR merge/approval automatically transitions ticket to "Ready for QA" and triggers verification agent.
  2. QA agent executes integration/e2e test suite with 2-strike deterministic flake filtering.
  3. Test failure transitions ticket back to "In Dev" with reproduction logs and diagnostic reports in discussion.
  4. Passing QA test suite transitions ticket to "Ready to Deploy", marking automated SDLC workflow complete.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. ADO Ingress, Event Orchestration & Core Integration | 0/TBD | Not started | - |
| 2. SDLC State Machine & Intake Requirements Auditor | 0/TBD | Not started | - |
| 3. Ephemeral Sandbox & Dynamic MCP Tool Infrastructure | 0/TBD | Not started | - |
| 4. Autonomous Developer Agent & Test-Driven Self-Repair Loop | 0/TBD | Not started | - |
| 5. Developer Review Gate & Iterative Rework Loop | 0/TBD | Not started | - |
| 6. QA Verification Gate & Workflow Completion | 0/TBD | Not started | - |
