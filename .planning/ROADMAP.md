# Roadmap: Agentic SDLC Workflow (Golden Path Standard)

## Overview

Implements the **Golden Path Standard: Ten Steps in Seven Columns with Six Evidence Levels (L1–L6)** integrated with Azure DevOps. The workflow guides each work item through Contract definition (L1), interactive Planning (Q→human) and Bounded Implementation, local Testing & Verification (L3), Human Acceptance Gate, PR Review & CI Pipeline Gates (L2, L3, L4), Deployment Approval & Monitoring (L5, L6), and automated Skill Learning feedback.

## Golden Path Alignment (7 Columns, 10 Steps)

```
[1. CONTRACT] ──► [2. EXECUTE] ──► [3. CHECK] ──► [4. ACCEPT] ──► [5. MERGE] ──► [6. DEPLOY] ──► [7. LEARN]
   Step 1:           Step 2: Plan     Step 4:        Step 5:         Step 6: PR     Step 8:         Step 10:
   Ticket + AC       (Q→human)        Test+verify    Accept          Review (merge) Deploy (approve) Learn (skills)
   (L1 Evidence)     Step 3:          (L3 Evidence)  (Human Verdict) Step 7: CI     Step 9: Monitor
                     Implement                       [◆ Gate]        Gates (L2,L4)  (L5,L6 Evidence)
```

## Phases

- [ ] **Phase 1: CONTRACT — ADO Ingress, Event Gateway & L1 Contract Auditor** - Ingest and verify Azure DevOps service hooks with deduplication, loop protection, and automated requirements audit for Definition of Done (L1 Evidence).
- [ ] **Phase 2: EXECUTE (Plan & Foundation) — Ephemeral Sandbox, Dynamic MCP & Plan Checkpoint** - Ephemeral git worktree manager, process isolation with secret scrubbing, domain-scoped MCP tools, and interactive plan clarification (`Q→human`).
- [ ] **Phase 3: EXECUTE & CHECK — Bounded Implementation & Self-Repair Test Verification** - Bounded multi-file code editing (<250 LOC), read-only test assertion protection, and automated unit test self-repair loops (L3 Evidence).
- [ ] **Phase 4: ACCEPT — Human Validation Gate & Rework Circuit Breaker** - Functional preview/verification artifact attachment, human acceptance verdict gate, and rework circuit breaker (max 2 bounces).
- [ ] **Phase 5: MERGE — PR Review Gate & CI Quality/Security Pipelines** - Automated PR creation (`AB#<id>`), human code review merge gate, and pipeline CI gates re-running tests (L3), code quality scans (L2), and security checks (L4).
- [ ] **Phase 6: DEPLOY — Deploy Safety Approval & Production Telemetry Monitoring** - Human deployment approval gate with rollback verification (L5 Safety), automated pipeline deployment, and production telemetry monitoring (L6 Prod Confidence).
- [ ] **Phase 7: LEARN — Continuous Improvement & Skills Feedback Loop** - Post-deployment learning agent extracting patterns, domain knowledge, and failure postmortems back into project skills and context documentation.

---

## Phase Details

### Phase 1: CONTRACT — ADO Ingress, Event Gateway & L1 Contract Auditor
**Goal**: Establish secure webhook ingress, deduplication, and automated ticket audit verifying Definition of Done (L1 Requirement Evidence).
**Depends on**: Nothing (first phase)
**Requirements**: INGEST-01, INGEST-02, INGEST-03, CONTR-01, CONTR-02
**Success Criteria** (what must be TRUE):
  1. Incoming ADO service hook webhook with valid HMAC signature is accepted with HTTP 202; invalid signature rejected with HTTP 401.
  2. Duplicate webhook deliveries with identical `(workItemId, revId)` are dropped without redundant task execution.
  3. Work item updates performed by bot identity are filtered out to prevent recursive loops.
  4. Auditor agent checks ticket & AC for Definition of Done clarity and testability, attaching L1 Evidence badge to work item.
  5. Valid tickets automatically transition to "Ready to Dev"; ambiguous tickets receive comments detailing missing criteria.
**Plans**: TBD

### Phase 2: EXECUTE (Plan & Foundation) — Ephemeral Sandbox, Dynamic MCP & Plan Checkpoint
**Goal**: Provision isolated execution environments, domain-scoped tools, and execute interactive plan clarification (`Q→human`) before implementation.
**Depends on**: Phase 1
**Requirements**: PLAN-01, PLAN-02, DISP-01, SAND-01, SAND-02
**Success Criteria** (what must be TRUE):
  1. Transition to "In Dev" triggers task worker with ephemeral git worktree isolated from host repository.
  2. Domain tags (`frontend`, `backend`, `infra`) dynamically mount matching MCP tool servers in agent context.
  3. Process runner executes commands within strict 120s timeout and scrubs PATs and API keys from environment and logs.
  4. Agent formulates implementation plan and posts interactive clarification questions (`Q→human`) to discussion when ambiguities arise.
  5. Human responses are captured and incorporated into a locked implementation plan before code modifications begin.
**Plans**: TBD

### Phase 3: EXECUTE & CHECK — Bounded Implementation & Self-Repair Test Verification
**Goal**: Autonomously modify code within bounded limits, verify with local test suites, and self-repair failures (L3 Functional Evidence).
**Depends on**: Phase 2
**Requirements**: IMPL-01, IMPL-02, TEST-01, TEST-02
**Success Criteria** (what must be TRUE):
  1. Developer agent executes multi-file code modifications respecting a diff ceiling of <250 LOC.
  2. Existing test assertion files are enforced read-only and agent modifications to them are rejected.
  3. Agent runs local unit tests, detects failures, and autonomously repairs code within 3-5 iterations.
  4. Passing implementation produces structured test execution logs establishing L3 Functional Evidence.
**Plans**: TBD

### Phase 4: ACCEPT — Human Validation Gate & Rework Circuit Breaker
**Goal**: Provide human functional acceptance gate before merge with bounded rework bounce handling.
**Depends on**: Phase 3
**Requirements**: ACCP-01, ACCP-02, ACCP-03
**Success Criteria** (what must be TRUE):
  1. Work item transitions to "Accept" state with preview/test evidence attached for human validation.
  2. Human developer/stakeholder renders acceptance verdict: Approve (proceed to PR) or Reject (rework loop).
  3. Rejection triggers rework agent on existing branch with cumulative context (AC + prior diff + feedback).
  4. Rework cycle counter caps at 2 automated iterations, escalating to human tech lead if issues persist.
**Plans**: TBD

### Phase 5: MERGE — PR Review Gate & CI Quality/Security Pipelines
**Goal**: Orchestrate pull request review, human merge gate, and pipeline CI verification (L2 Code Quality, L3 Functional Re-run, L4 Security).
**Depends on**: Phase 4
**Requirements**: MRG-01, MRG-02, MRG-03
**Success Criteria** (what must be TRUE):
  1. Agent opens Azure DevOps PR linked with `AB#<id>` containing complete L1 and L3 evidence summary.
  2. Human reviewer conducts code review and renders PR merge verdict.
  3. Azure Pipelines CI gates re-run full test suite (L3 Functional re-run), static analysis / linters (L2 Code Quality), and security/dependency scans (L4 Security Gate).
  4. PR merge automatically triggers transition to deployment stage.
**Plans**: TBD

### Phase 6: DEPLOY — Deploy Safety Approval & Production Telemetry Monitoring
**Goal**: Enforce human deployment approval with rollback verification and monitor production signals (L5 Deploy Safety, L6 Prod Confidence).
**Depends on**: Phase 5
**Requirements**: DPLY-01, DPLY-02
**Success Criteria** (what must be TRUE):
  1. Human deployment approval gate validates release notes, migration safety, and automated rollback readiness (L5 Evidence).
  2. Deployment pipeline triggers release upon approval and monitors production telemetry signals (error rates, response times).
  3. Telemetry stability over evaluation window establishes L6 Prod Confidence and marks release as successful.
**Plans**: TBD

### Phase 7: LEARN — Continuous Improvement & Skills Feedback Loop
**Goal**: Capture post-deployment learnings and update agent skills for continuous workflow improvement.
**Depends on**: Phase 6
**Requirements**: LRN-01, LRN-02
**Success Criteria** (what must be TRUE):
  1. Learning agent analyzes completed ticket lifecycle (rework cycles, PR comments, test fixes, telemetry).
  2. Extracts domain patterns, architectural conventions, or error prevention rules.
  3. Commits findings into project skills repository and documentation to guide subsequent agent executions.
**Plans**: TBD

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|---|---|---|---|
| 1. CONTRACT: Ingress & L1 Auditor | 0/TBD | Not started | - |
| 2. EXECUTE: Sandbox, MCP & Plan (Q→human) | 0/TBD | Not started | - |
| 3. EXECUTE & CHECK: Implement & Test (L3) | 0/TBD | Not started | - |
| 4. ACCEPT: Human Validation Gate | 0/TBD | Not started | - |
| 5. MERGE: PR Review & CI Gates (L2, L3, L4) | 0/TBD | Not started | - |
| 6. DEPLOY: Deploy Approval & Monitor (L5, L6) | 0/TBD | Not started | - |
| 7. LEARN: Skills Feedback Loop | 0/TBD | Not started | - |
