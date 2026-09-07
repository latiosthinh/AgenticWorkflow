# Requirements: Agentic SDLC Workflow

**Defined:** 2026-09-07
**Core Value:** End-to-end automated ticket lifecycle where AI agents autonomously write and test code within iterative loops while developers and QA maintain control via ADO state transitions and review gates.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Ingestion & Event Gateway (INGEST)

- [ ] **INGEST-01**: System receives and verifies Azure DevOps service hook webhooks using HMAC secret signatures.
- [ ] **INGEST-02**: System deduplicates events by `(workItemId, revId)` to prevent duplicate dispatches and race conditions.
- [ ] **INGEST-03**: System filters out agent/bot identity actions to prevent recursive webhook loops.

### Requirements Quality Audit (AUDIT)

- [ ] **AUDIT-01**: Auditor agent inspects new ADO work items for required acceptance criteria, description clarity, and scope completeness.
- [ ] **AUDIT-02**: System automatically transitions validated work items to "Ready to Dev" and posts audit findings into the work item discussion.
- [ ] **AUDIT-03**: System flags incomplete or ambiguous tickets with specific missing-info comments, preventing premature development.

### Dispatch & Dynamic MCP Harness (DISP)

- [ ] **DISP-01**: System detects work item state transition to "In Dev" after developer assignment and domain tagging (`frontend`, `backend`, `infra`).
- [ ] **DISP-02**: System dynamically resolves domain tags to inject matching MCP tool servers, skills, and scoped context into the agent environment.

### Workspace Sandboxing (SANDBOX)

- [ ] **SANDBOX-01**: Worker provisions an ephemeral `git worktree` isolated from the host repository for each task run.
- [ ] **SANDBOX-02**: Process runner enforces execution timeouts and scrubs sensitive credentials (PATs, API keys) from environment variables passed to test commands.

### Autonomous Coding & Self-Repair Loop (EXEC)

- [ ] **EXEC-01**: Coding agent analyzes requirements and existing codebase to generate an implementation plan and multi-file code modifications.
- [ ] **EXEC-02**: Agent executes local unit tests against changes, detects test failures, and enters a self-repair loop (max 3-5 iterations).
- [ ] **EXEC-03**: System enforces read-only boundaries on existing unit test assertions to prevent agent test tampering.

### Pull Request & State Update (PR)

- [ ] **PR-01**: Agent pushes the task branch and creates an Azure DevOps Pull Request linked to the work item via `AB#<id>`.
- [ ] **PR-02**: System automatically transitions work item to "Dev Done" and posts PR link and test execution summary to the work item thread.

### Developer Review & Iterative Rework Loop (REV)

- [ ] **REV-01**: System detects developer review outcome: approves/merges PR or requests changes by moving work item back to "In Dev" with review comments.
- [ ] **REV-02**: Moving work item back to "In Dev" triggers rework agent with cumulative context (acceptance criteria, original PR diff, and review comments).
- [ ] **REV-03**: System enforces a maximum bounce circuit breaker (max 2 rework cycles) before escalating to human intervention if tests or review fail repeatedly.

### QA Verification & Workflow Completion (QA)

- [ ] **QA-01**: Work item transitions to "Ready for QA" upon PR merge/approval to trigger QA validation.
- [ ] **QA-02**: QA verification agent executes integration/e2e test suites with deterministic failure detection (2-strike check to filter flakes).
- [ ] **QA-03**: Failing QA tests transition work item back to "In Dev" with reproduction logs and diagnostic reports.
- [ ] **QA-04**: Passing QA tests transition work item to "Ready to Deploy", marking the automated SDLC workflow as completed.

## v2 Requirements

### Multi-Tracker Support
- **MULTI-01**: Support GitHub Issues and GitHub Projects as alternative ticket sources.
- **MULTI-02**: Support Jira Software Cloud webhooks and transitions.

### Automated Delivery
- **DELIV-01**: Automated triggering of staged release deployment pipelines after reaching "Ready to Deploy".
- **DELIV-02**: Canary release monitoring with automatic rollback triggers.

### Enterprise Multi-Tenancy
- **CORP-01**: Multi-tenant cloud runner pool with per-team resource quotas and concurrency management.
- **CORP-02**: SSO and RBAC for enterprise agent management.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Custom Web Dashboard | ADO Boards serves as the sole single pane of glass to avoid developer context switching. |
| Direct Production Deployment | v1 intentionally stops at "Ready to Deploy" to ensure organizational deployment policy compliance. |
| Unbounded Autonomous Loops | Hard circuit breakers required to prevent runaway LLM costs and infinite repair loops. |
| Auto-Merging PRs Without Human Sign-off | Developer code review gate is mandatory for quality and security governance. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INGEST-01 | Phase 1 | Pending |
| INGEST-02 | Phase 1 | Pending |
| INGEST-03 | Phase 1 | Pending |
| AUDIT-01 | Phase 2 | Pending |
| AUDIT-02 | Phase 2 | Pending |
| AUDIT-03 | Phase 2 | Pending |
| DISP-01 | Phase 3 | Pending |
| DISP-02 | Phase 3 | Pending |
| SANDBOX-01 | Phase 3 | Pending |
| SANDBOX-02 | Phase 3 | Pending |
| EXEC-01 | Phase 4 | Pending |
| EXEC-02 | Phase 4 | Pending |
| EXEC-03 | Phase 4 | Pending |
| PR-01 | Phase 4 | Pending |
| PR-02 | Phase 4 | Pending |
| REV-01 | Phase 5 | Pending |
| REV-02 | Phase 5 | Pending |
| REV-03 | Phase 5 | Pending |
| QA-01 | Phase 6 | Pending |
| QA-02 | Phase 6 | Pending |
| QA-03 | Phase 6 | Pending |
| QA-04 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-07*
*Last updated: 2026-09-07 after roadmap creation*
