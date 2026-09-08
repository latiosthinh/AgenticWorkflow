# Requirements: Agentic SDLC Workflow (Golden Path Standard, v2 post-audit)

**Defined:** 2026-09-07
**Core Value:** Deterministic, evidence-backed software delivery across the Golden Path columns (Contract, Execute, Check, Accept, Merge, QA, Deploy, Learn) with 6 evidence levels (L1–L6), native ADO gates, and human verdicts.

**Post-audit decisions applied:** QA stage restored · gated deploy + monitor in v1 · reuse existing ADO states (ACCEPT = `Dev Done`) · native ADO branch policies + Environments for CI/deploy gates.

## v1 Requirements

### 1. CONTRACT — Ticket & AC (L1 Requirement Evidence)

- [x] **INGEST-01**: System receives and verifies Azure DevOps service hook webhooks using HMAC secret signatures.
- [x] **INGEST-02**: System deduplicates events by `(workItemId, revId)` to prevent duplicate dispatches and race conditions.
- [x] **INGEST-03**: System filters out agent/bot identity actions to prevent recursive webhook loops.
- [x] **CONTR-01**: Auditor agent inspects ticket & AC for Definition of Done clarity, scope completeness, and testability (L1 Evidence).
- [ ] **CONTR-02**: System transitions validated tickets to "Ready to Dev" and posts L1 audit summary in the work item discussion; ambiguous tickets stay in "New" with missing-info comments.

### 2. EXECUTE — Plan & Implement

- [ ] **PLAN-01**: Agent formulates implementation plan and posts interactive clarification questions (`Q→human`) to the work item discussion when ambiguities exist.
- [ ] **PLAN-02**: Plan checkpoint releases the sandbox while awaiting human answers; human comment re-triggers the run via webhook; unanswered questions ping after 24h; locked plan persists before code edits begin.
- [ ] **DISP-01**: System dynamically resolves domain tags (`frontend`, `backend`, `infra`) to mount matching MCP tools and scoped context.
- [ ] **SAND-01**: Worker provisions an ephemeral `git worktree` isolated from the host repository for each task run.
- [ ] **SAND-02**: Process runner enforces execution timeouts (120s) and scrubs sensitive credentials (PATs, API keys) from environment variables and logs.
- [ ] **IMPL-01**: Agent executes bounded implementation modifying source files within a maximum diff budget of <250 LOC.
- [ ] **IMPL-02**: System enforces read-only permissions on existing test assertion files and rejects PRs containing test-file modifications.

### 3. CHECK — Test & Verify (L3 Functional Evidence, local)

- [ ] **TEST-01**: Agent executes local unit tests against modified code and generates structured test execution reports (L3 Evidence).
- [ ] **TEST-02**: Agent detects test failures and enters an automated self-repair loop (max 3-5 iterations) using failure traces; budget exhaustion posts diagnostics and flags ticket blocked.

### 4. ACCEPT — Human Validation Gate (at `Dev Done` state)

- [ ] **ACCP-01**: System transitions work item to "Dev Done" with acceptance packet attached: test run summary, diff stat, PR link, and preview/staging URL where available.
- [ ] **ACCP-02**: Human renders functional acceptance verdict (◆): approve proceeds to PR review/merge; reject moves ticket back to "In Dev" with comments.
- [ ] **ACCP-03**: System enforces a shared rework circuit breaker (max 2 automated bounces across Accept + PR review) before escalating to human tech lead.

### 5. MERGE — PR Review & Native CI Gates (L2, L3, L4)

- [ ] **MRG-01**: Agent pushes task branch and creates Azure Repos PR linked via `AB#<id>` with L1/L3 evidence summary in PR description.
- [ ] **MRG-02**: Human reviewer conducts code review and renders PR merge verdict (◆); merge blocked until acceptance (ACCP-02) passed.
- [ ] **MRG-03**: System verifies native ADO branch policy gate status before merge: build validation green (L3 re-run), code quality scans (L2), security/SAST scans (L4). No custom CI orchestration — branch policies are the enforcement; system reads status only.
- [ ] **MRG-04**: PR review rejection moves ticket back to "In Dev" and re-triggers rework agent with cumulative envelope (original AC + prior diff + review comments); shares ACCP-03 breaker.
- [ ] **MRG-05**: Successful merge transitions ticket to "Ready for QA" and posts merge summary to work item.

### 6. QA — Verification Loop (L3 integration evidence)

- [ ] **QA-01**: Merge into target branch triggers QA validation stage on "Ready for QA" (human tester and/or QA agent).
- [ ] **QA-02**: QA validation executes integration/e2e test suites with 2-strike deterministic flake filtering.
- [ ] **QA-03**: QA failure moves ticket back to "In Dev" with reproduction logs and diagnostic report in discussion (QA bounce cap 2, then human escalation).
- [ ] **QA-04**: QA pass transitions ticket to "Ready to Deploy" and posts QA evidence summary.

### 7. DEPLOY — Native Approval Gate & Monitoring (L5, L6)

- [ ] **DPLY-01**: Deployment gated by native ADO Environment approval (human ◆): reviewer validates release notes, migration safety, and rollback readiness (L5 Evidence). No custom approval UI.
- [ ] **DPLY-02**: Post-deployment monitor reads Azure Monitor / Application Insights telemetry for a defined evaluation window (default 30 min): error-rate spike and p95-latency regression checks (L6 Prod Confidence); alert bounces release and notifies owner.
- [ ] **DPLY-03**: Monitor window passing marks work item workflow complete ("Done") with L1–L6 evidence index attached.

### 8. LEARN — Skills Feedback Loop

- [ ] **LRN-01**: Post-completion learning agent analyzes ticket lifecycle (rework cycles, review comments, test fixes, telemetry) and extracts reusable patterns and failure postmortems.
- [ ] **LRN-02**: Learnings are submitted as a Pull Request to the skills repository — never direct-committed; human merges before skills affect future runs.

## v2 Requirements

### Multi-Tracker Support
- **MULTI-01**: GitHub Issues / Projects as alternative ticket source.
- **MULTI-02**: Jira Software Cloud webhooks and transitions.

### Advanced Production Governance
- **GOV-01**: Automated canary traffic shifting with instant rollback on telemetry alerts.
- **GOV-02**: Multi-tenant cloud runner pool with per-team quotas.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Custom Web Dashboard | ADO Boards is the single pane of glass. |
| Custom CI gate orchestration | Native ADO branch policies enforce L2/L3/L4; system reads status only. |
| Custom deploy approval UI | Native ADO Environments approval gates enforce L5. |
| Unattended production deployments | Human Environment approval (◆) is mandatory. |
| Unbounded autonomous loops | Hard breakers at plan, implement, accept, review, QA. |
| Auto-merging PRs without human sign-off | PR review verdict (◆) non-negotiable. |
| Direct-commit skill updates | Learning writes go through PR review (prompt-injection persistence guard). |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INGEST-01 | Phase 1 | Complete |
| INGEST-02 | Phase 1 | Complete |
| INGEST-03 | Phase 1 | Complete |
| CONTR-01 | Phase 1 | Complete |
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
| MRG-04 | Phase 5 | Pending |
| MRG-05 | Phase 5 | Pending |
| QA-01 | Phase 6 | Pending |
| QA-02 | Phase 6 | Pending |
| QA-03 | Phase 6 | Pending |
| QA-04 | Phase 6 | Pending |
| DPLY-01 | Phase 7 | Pending |
| DPLY-02 | Phase 7 | Pending |
| DPLY-03 | Phase 7 | Pending |
| LRN-01 | Phase 8 | Pending |
| LRN-02 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 31 total
- Mapped to phases: 31
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-07*
*Last updated: 2026-09-07 after Golden Path audit — QA restored, deploy in scope, native gates, rework loop reinstated*
