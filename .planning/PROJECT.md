# Agentic SDLC Workflow

## What This Is

An autonomous, human-in-the-loop SDLC automation system for Azure DevOps implementing the **Golden Path** standard. Shipped v1.0 used an 8-stage / L1–L6 model (CONTRACT → EXECUTE → CHECK → ACCEPT → MERGE → QA → DEPLOY → LEARN). Milestone **v2.0** restructures it to the **Golden Path v2** model: **5 columns, 9 actor-assigned steps, L1–L7 evidence**, adding a human PM scope gate, automated production smoke tests, retro/runbook output, and an L7 Continuous-Feedback evidence level.

## Core Value

Deterministic, evidence-backed software delivery where AI agents autonomously plan, implement, and self-repair code while humans retain verdict gates (PM Scope Lock, Plan Q&A, Dev Accept, PR Merge, QA, Release Approval), CI/security enforcement stays native to ADO, and every stage leaves auditable **L1–L7** evidence on the work item.

## Current State

- **v2.0 shipped 2026-09-18 (git tag `v2.0`)**: 5 columns / 9 steps / L1–L7 evidence on file-backed `StateStore`, 437 tests passing green.
- **v1.0 shipped 2026-09-09 (git tag `v1.0`)**: 8 Golden Path phases, 31 requirements complete.

## Current Milestone: v2.0 — Golden Path v2

**Goal:** Restructure the pipeline to the v2 model — 5 columns (Refinement, Execution, Acceptance, Release, Retro), 9 actor-assigned steps, 7 evidence levels (L1–L7) — adding the 4 capabilities v1.0 lacks.

**The v2 model (5 columns, 9 steps):**

| Column | Step | Actor | Evidence |
|---|---|---|---|
| 1. REFINEMENT | 1. Ticket & AC verify | ⚡ AI Agent | L1 |
| | 2. Scope review & verify | 👤 Human PM | L1 |
| 2. EXECUTION | 3. Loop: Plan-Code-Test | ⚡ AI Agent | L2, L3 |
| | 4. Dev validate & PR | 👤 Human Dev | L2, L3 |
| 3. ACCEPTANCE | 5. PR review & CI deploy | 👤 Human TechLead/SA | L3, L4 |
| | 6. QA staging verify | 👤 Human QA | L3, L5 |
| 4. RELEASE | 7. Release approval + deploy | 👤 Human QA/SA/Lead/PM | L5 |
| | 8. Smoke test & monitor | ⚡ AI / Automation | L6 |
| 5. RETRO | 9. Retro takeaways, docs, skill enhancement | ⚡ AI Agent & Team | L7 |

**Evidence levels (L1–L7):** L1 Requirement · L2 Code Quality · L3 Functional · L4 Security · L5 Deploy Safety · L6 Prod Confidence · **L7 Continuous Feedback (new)**.

**Target features:**
- **Persistence migration (foundation)** — replace v1.0 SQLite/Drizzle with a file-backed `StateStore` (per-ticket markdown+frontmatter, lane-serialized, atomic `wx` dedup); workers call a backend-agnostic interface. Removes the drizzle-migration hazard entirely.
- **Taxonomy restructure** — 8 stages → 5 columns / 9 steps with explicit actors (⚡ AI / 👤 Human) + governance hand-offs; state matrix, evidence index, and docs realigned.
- **L7 Continuous-Feedback evidence** — extend the unified evidence record + index L1–L6 → **L1–L7** (additive field on the ticket state file).
- **PM scope-review gate (Step 2)** — human 👤 PM scope-lock verdict in REFINEMENT before EXECUTION (v1.0 auto-transitions `New→Ready to Dev` with no human gate).
- **Prod smoke-test suite (Step 8)** — automated ⚡ smoke runner in RELEASE alongside the existing telemetry monitor (L6).
- **Retro output (Step 9)** — retro takeaways + runbook updates + skill enhancement captured as **L7** evidence (v1.0 only emits SKILL.md).

**Preserved from v1.0:** native ADO gates (branch policies L2/L3/L4, Environments L5); security posture (prompt-injection defenses, secret scrubbing, loop shields, shared rework breaker ≤2); ADO Boards as single source of truth.

## v1.0 Baseline — Adapted Golden Path (8 stages, shipped)

> Superseded by the v2.0 model above for the current milestone. Retained for historical context; v1.0 details live in `.planning/milestones/v1.0-*`.

1. **CONTRACT** (Step 1): Ticket + AC authored by human ◇, audited by agent → **L1**
2. **EXECUTE** (Steps 2–3): Plan with `Q→human` ◇ (sandbox released while waiting), bounded implement (<250 LOC, test files locked)
3. **CHECK** (Step 4): Local unit tests + self-repair (3–5x) → **L3 local**
4. **ACCEPT** (Step 5): Human verdict ◆ at `Dev Done` with evidence packet (tests + diff + preview)
5. **MERGE** (Steps 6–7): PR review ◆ + native branch-policy CI gates → **L2, L3 re-run, L4**
6. **QA** (restored): Integration/e2e on `Ready for QA`, 2-strike flake filter, fail → `In Dev`
7. **DEPLOY** (Steps 8–9): Native ADO Environment approval ◆ → **L5**; Azure Monitor telemetry window → **L6**; Done = deployed + monitor passed
8. **LEARN** (Step 10): Agent extracts patterns → PR to skills repo (human merges) → fed back to EXECUTE

Authoritative state matrix: `.planning/ROADMAP.md`.

## Requirements

### Validated

v1.0 shipped (git tag `v1.0`, 2026-09-09): all 31 Golden Path requirements complete and validated across 8 phases, 277 tests passing.

### Active

Milestone **v2.0 — Golden Path v2** (full REQ-ID breakdown defined in `.planning/REQUIREMENTS.md`):

- [x] **RESTRUCTURE**: Re-taxonomize the pipeline into 5 columns / 9 steps with actor roles (⚡/👤) + governance hand-offs; realign state matrix, evidence index, and docs.
- [x] **L7 EVIDENCE**: Add L7 Continuous-Feedback schema and extend the unified evidence index L1–L6 → L1–L7.
- [x] **PM SCOPE GATE**: Add human PM scope-review & verify (scope-lock) gate in REFINEMENT (Step 2) before EXECUTION begins.
- [x] **PROD SMOKE**: Add automated production smoke-test suite in RELEASE (Step 8) alongside the existing telemetry monitor (L6).
- [x] **RETRO OUTPUT**: Emit retro takeaways + runbook updates + skill enhancement as L7 evidence in RETRO (Step 9).

### Out of Scope

- Jira / GitHub Issues integrations — Azure DevOps only.
- Custom CI orchestration — native ADO branch policies enforce L2/L3/L4; system reads status only.
- Custom deploy approval UI — native ADO Environments enforce L5.
- Unattended production deployments — human Environment approval mandatory.
- Direct-commit skill updates — prompt-injection persistence guard; learning writes go through PR review.
- Multi-tenant billing / enterprise org management — single-team runner first.
- Multi-tracker (Jira/GitHub), canary traffic shifting, multi-tenant runner pool — future backlog (`MULTI-*`, `GOV-*`), NOT in v2.0 model-restructure scope.

## Context

- Golden Path Standard source sketch: `.idea/draft.md` (7 columns, 10 steps, L1–L6 cards).
- **Golden Path v2 source sketch: `.idea/v2.md`** (5 columns, 9 steps, L1–L7 cards, actor roles + governance hand-offs) — authoritative model for milestone v2.0.
- Research: `.planning/research/` (stack, features, architecture, pitfalls) — SUMMARY.md carries a post-audit addendum; queue/persistence = SQLite WAL + p-queue (not Redis/BullMQ).
- Azure DevOps Boards/Repos/Pipelines is the only UI; no custom dashboard.
- MCP for tool dispatch; skills repository for learned context.

## Constraints

- **Tech Stack**: Node.js 24 LTS + TypeScript, Fastify webhook gateway, **file-backed `StateStore`** (per-ticket markdown+frontmatter under `data/state/`, lane-serialized writes, atomic `wx` dedup markers — replaces v1.0's better-sqlite3 + Drizzle), Vercel AI SDK + MCP SDK, azure-devops-node-api, simple-git + execa.
- **Persistence ceiling**: single orchestrator machine is load-bearing (local files). Multi-instance enterprise re-introduces a shared store — swap the `StateStore` impl (e.g. Postgres) behind the same interface; workers stay backend-agnostic. `ponytail:` upgrade path, not solved in v2.0.
- **Security**: Non-root ephemeral execution, credential scrubbing, egress restrictions, read-only test assertions, mandatory L4 scan gate.
- **Governance**: Human verdict gates at Accept, PR Merge, QA escalation, Deploy. Shared rework breaker ≤2 automated bounces per stage family.
- **Native-first**: ADO branch policies (CI), ADO Environments (deploy approval) — extend, don't reimplement.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Golden Path 7-column standard adopted | Standardizes lifecycle into contract→execute→check→accept→merge→deploy→learn with explicit evidence | — Superseded by v2.0 (5 columns) |
| Six Evidence Levels (L1–L6) | Readiness verifiable at every stage, not subjective status | — Superseded by v2.0 (L1–L7) |
| QA stage restored (post-audit) | Original draft's tester loop was silently dropped by raw standard; integration verification needs its own gate | ✓ Applied |
| Gated deploy + monitor in v1 (post-audit) | Golden Path includes Deploy/Monitor columns; human ◆ approval keeps governance | ✓ Applied |
| Reuse existing ADO states (post-audit) | ACCEPT lives on `Dev Done`; no new board columns; less migration friction | ✓ Applied |
| Native ADO gates (post-audit) | Branch policies enforce L2/L3/L4; Environments enforce L5 — least code, org-policy compliant | ✓ Applied |
| Plan checkpoint non-blocking (post-audit) | `Q→human` releases sandbox; comment re-triggers; 24h ping — no idle resource holds | ✓ Applied |
| Learning via PR only (post-audit) | Prevents self-modifying prompt-injection persistence in skills | ✓ Applied |
| Interactive Plan Checkpoint (Q→human) | Clarifies ambiguity before codegen; prevents wasted tokens/rework | ✓ Applied |
| Shared rework breaker ≤2 | Bounds LLM cost and review ping-pong across Accept + PR review | ✓ Applied |
| **Golden Path v2 model (5 cols / 9 steps / L1–L7)** | v2.0 restructure aligns pipeline to `.idea/v2.md`; explicit actor roles + governance hand-offs | ✓ v2.0 active |
| **L7 Continuous-Feedback evidence** | Retro/skill output becomes a first-class audited evidence level, not just a skills PR | ✓ v2.0 active |
| **Human PM scope-lock gate (Step 2)** | v1.0 auto-transitioned `New→Ready to Dev`; v2.0 adds a human scope verdict before EXECUTION | ✓ v2.0 active |
| **Automated prod smoke tests (Step 8)** | Telemetry alone (L6) is reactive; active smoke suite confirms deploy health in RELEASE | ✓ v2.0 active |
| **Remove SQLite → file-backed `StateStore`** | Orchestrator is an agent layer; per-ticket markdown checkpoint-memory the agent reads directly is simpler than querying a DB. Viable because the per-work-item lane (`concurrency:1`) already serializes writes → single-writer per ticket; ingress dedup uses atomic `wx` create. Collapses 12 tables → 1 file/ticket. `StateStore` interface keeps workers backend-agnostic. | ✓ v2.0 active |
| **Single-machine persistence ceiling** | Local files don't share across instances; enterprise multi-machine swaps `StateStore` → network store (Postgres). Recorded as `ponytail:` ceiling, deferred. | ✓ v2.0 active |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-16 — milestone v2.0 (Golden Path v2 restructure) started*
