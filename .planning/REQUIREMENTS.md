# Requirements: Agentic SDLC Workflow (Golden Path Standard)

**Defined:** 2026-09-07
**Core Value:** Deterministic, evidence-backed software delivery across the 7 Golden Path columns (Contract, Execute, Check, Accept, Merge, Deploy, Learn) with 6 evidence levels (L1–L6) and human verdict gates.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### 1. CONTRACT — Ticket & AC (L1 Requirement Evidence)

- [ ] **INGEST-01**: System receives and verifies Azure DevOps service hook webhooks using HMAC secret signatures.
- [ ] **INGEST-02**: System deduplicates events by `(workItemId, revId)` to prevent duplicate dispatches and race conditions.
- [ ] **INGEST-03**: System filters out agent/bot identity actions to prevent recursive webhook loops.
- [ ] **CONTR-01**: Auditor agent inspects ticket & AC for Definition of Done (DoD) clarity, scope completeness, and testability (L1 Evidence).
- [ ] **CONTR-02**: System automatically transitions validated tickets to "Ready to Dev" and posts L1 requirement audit summary in the work item discussion.

### 2. EXECUTE — Plan & Implement

- [ ] **PLAN-01**: Agent formulates technical implementation plan and generates interactive clarification questions (`Q→human`) when ambiguities exist.
- [ ] **PLAN-02**: System captures human developer answers from discussion and locks the verified implementation plan before coding begins.
- [ ] **DISP-01**: System dynamically resolves domain tags (`frontend`, `backend`, `infra`) to mount matching MCP tools and scoped context.
- [ ] **SAND-01**: Worker provisions an ephemeral `git worktree` isolated from the host repository for each task run.
- [ ] **SAND-02**: Process runner enforces execution timeouts (120s) and scrubs sensitive credentials (PATs, API keys) from environment variables.
- [ ] **IMPL-01**: Agent executes bounded implementation modifying source files within a maximum diff budget of <250 LOC.
- [ ] **IMPL-02**: System enforces read-only permissions on existing test assertion files to prevent test tampering during implementation.

### 3. CHECK — Test & Verify (L3 Functional Evidence)

- [ ] **TEST-01**: Agent executes local unit tests against modified code and generates structured test execution reports (L3 Evidence).
- [ ] **TEST-02**: Agent detects test failures and enters an automated self-repair loop (max 3-5 iterations) using failure traces.

### 4. ACCEPT — Human Validation Gate

- [ ] **ACCP-01**: System transitions work item to "Accept" state with preview/verification evidence attached for human validation.
- [ ] **ACCP-02**: Human developer/tester renders functional acceptance verdict: approve to proceed to PR merge, or reject back to Execute.
- [ ] **ACCP-03**: System enforces a maximum bounce circuit breaker (max 2 rework cycles) before escalating to human tech lead.

### 5. MERGE — PR Review & CI Gates (L2 Quality, L3 Functional Re-run, L4 Security)

- [ ] **MRG-01**: Agent pushes task branch and creates Azure Repos PR linked via `AB#<id>` with evidence summary attached.
- [ ] **MRG-02**: Human reviewer conducts code review and renders PR merge verdict.
- [ ] **MRG-03**: Azure Pipelines CI gates re-run functional tests (L3), static code quality scans (L2), and security/vulnerability scans (L4).

### 6. DEPLOY — Deploy Approval & Monitor (L5 Safety, L6 Prod Confidence)

- [ ] **DPLY-01**: Human deployment approval gate validates deployment safety and rollback readiness (L5 Evidence).
- [ ] **DPLY-02**: Automated pipeline deployment monitors production telemetry signals (error rates, health checks) to establish L6 Prod Confidence.

### 7. LEARN — Skills Feedback Loop

- [ ] **LRN-01**: Post-deployment learning agent extracts reusable patterns, domain knowledge, and failure postmortems from resolved tickets.
- [ ] **LRN-02**: System commits extracted learnings into project skills and context documentation to enhance subsequent agent runs.

## v2 Requirements

### Multi-Tracker Support
- **MULTI-01**: Support GitHub Issues and GitHub Projects as alternative ticket sources.
- **MULTI-02**: Support Jira Software Cloud webhooks and transitions.

### Advanced Production Governance
- **GOV-01**: Automated canary traffic shifting with instant automated rollback on telemetry alerts.
- **GOV-02**: Multi-tenant cloud runner pool with per-team resource quotas.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Custom Web Dashboard | ADO Boards serves as the single pane of glass to prevent developer tool fragmentation. |
| Unattended Production Auto-Deployments | Human deployment approval (Step 8 verdict) is mandatory for governance. |
| Unbounded Autonomous Loops | Hard circuit breakers required at Plan, Implement, and Accept to prevent runaway LLM costs. |
| Auto-Merging PRs Without Human Sign-off | Developer code review gate (Step 6 verdict) is non-negotiable. |

## Traceability

Which phases cover which requirements.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INGEST-01 | Phase 1 | Pending |
| INGEST-02 | Phase 1 | Pending |
| INGEST-03 | Phase 1 | Pending |
| CONTR-01 | Phase 1 | Pending |
| CONTR-02 | Phase 1 | Pending |
| PLAN-01 | Phase 2 | Pending |
| PLAN-02 | Phase 2 | Pending |
| DISP-01 | Phase 2 | Pending |
| SAND-01 | Phase 2 | Pending |
| SAND-02 | Phase 2 | Pending |
| IMPL-01 | Phase 3 | Pending |
| IMPL-02 | Phase 3 | Pending |
| TEST-01 | Phase 3 | Pending |
| TEST-02 | Phase 3 | Pending |
| ACCP-01 | Phase 4 | Pending |
| ACCP-02 | Phase 4 | Pending |
| ACCP-03 | Phase 4 | Pending |
| MRG-01 | Phase 5 | Pending |
| MRG-02 | Phase 5 | Pending |
| MRG-03 | Phase 5 | Pending |
| DPLY-01 | Phase 6 | Pending |
| DPLY-02 | Phase 6 | Pending |
| LRN-01 | Phase 7 | Pending |
| LRN-02 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-07*
*Last updated: 2026-09-07 after Golden Path standard alignment*
