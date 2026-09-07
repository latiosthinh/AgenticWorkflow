# Agentic SDLC Workflow

## What This Is

An autonomous, human-in-the-loop software development lifecycle (SDLC) automation system implementing the **Golden Path Standard (10 steps across 7 columns with L1–L6 Evidence Levels)** integrated with Azure DevOps (ADO). It orchestrates tickets from human contract definition through agent execution, local verification, human acceptance, CI/PR merge gates, deployment safety checks, and post-deployment skill learning.

## Core Value

Deterministic, evidence-backed software delivery where AI agents autonomously plan, implement, and self-repair code while humans retain governance at key verdict gates (Contract, Plan Q&A, Acceptance, PR Merge, Deploy Approval) supported by continuous pipeline verification and skills feedback.

## The 7-Column Golden Path Lifecycle

1. **CONTRACT**: Step 1 - `Ticket + AC` (Human contract & definition of done) -> **L1 Requirement Evidence**
2. **EXECUTE**: Step 2 - `Plan` (Agent formulates plan, asks clarifying questions to human `Q→human`) + Step 3 - `Implement` (Agent bounded code generation)
3. **CHECK**: Step 4 - `Test + verify` (Agent runs local tests & self-repairs) -> **L3 Functional Evidence**
4. **ACCEPT**: Step 5 - `Accept` (Human validates behavior/preview) [Human Verdict ◆]
5. **MERGE**: Step 6 - `PR review` (Human merges) [Human Verdict ◆] + Step 7 - `CI gates` (Pipeline re-runs tests, linters, and security scans) -> **L2 Code Quality & L4 Security Evidence**
6. **DEPLOY**: Step 8 - `Deploy` (Human approves) [Human Verdict ◆] + Step 9 - `Monitor` (Pipeline checks prod telemetry signals) -> **L5 Deploy Safety & L6 Prod Confidence Evidence**
7. **LEARN**: Step 10 - `Learn` (Agent extracts patterns/anti-patterns, feeds skills back to team knowledge base) -> **L6 Continuous Improvement**

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **CONTRACT (L1 Requirement)**: Ingest ADO ticket & AC; validate contract completeness and definition of done.
- [ ] **EXECUTE - Plan & Clarify**: Agent formulates implementation plan and dispatches interactive clarification questions (`Q→human`) before editing code.
- [ ] **EXECUTE - Bounded Implementation**: Ephemeral sandbox with tag-scoped MCP tools, read-only test assertions, and bounded diff scope (<250 LOC).
- [ ] **CHECK (L3 Functional)**: Agent executes local unit tests with self-repair loops (max 3-5 iterations) and captures verifiable test evidence.
- [ ] **ACCEPT (Human Verdict)**: Preview/acceptance gate allowing developer or product owner to validate functionality before PR merge.
- [ ] **MERGE (L2 Quality & L4 Security)**: PR review gate (human merge) plus pipeline CI gates re-running tests, static analysis, and security vulnerability scans.
- [ ] **DEPLOY (L5 Safety & L6 Confidence)**: Human deployment approval with rollback safety verification, followed by automated telemetry monitoring.
- [ ] **LEARN (Skills Feedback)**: Agent extracts learnings, failure postmortems, and workflow patterns into project skills for future runs.

### Out of Scope

- Jira / GitHub Issues integrations — focus strictly on Azure DevOps for v1.
- Unattended production auto-deployments — human deployment approval gate is mandatory.
- Multi-tenant billing and enterprise org management — single-team runner first.

## Context

- Adheres to the Golden Path SDLC standard: 10 steps across 7 columns.
- Tracks 6 Evidence Levels (L1: Requirement, L2: Code Quality, L3: Functional, L4: Security, L5: Deploy Safety, L6: Prod Confidence).
- Uses Azure DevOps Boards, Repos, and Pipelines as the primary interface.
- Integrates Model Context Protocol (MCP) for tool dispatch and skills repository.

## Constraints

- **Tech Stack**: Node.js/TypeScript orchestration with Fastify webhook gateway, SQLite state persistence, Vercel AI SDK, and official Azure DevOps SDK.
- **Security**: Non-root ephemeral execution, credential scrubbing from process environments, and mandatory L4 security scan gates.
- **Governance**: Hard human verdict gates at Accept, PR Merge, and Deploy.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Golden Path 7-Column Alignment | Standardizes the SDLC lifecycle into Contract, Execute, Check, Accept, Merge, Deploy, Learn | — Pending |
| Six Evidence Levels (L1-L6) | Makes readiness verifiable at every stage rather than relying on subjective status | — Pending |
| Interactive Plan Checkpoint (Q→human) | Clarifies ambiguities before code generation to prevent wasted tokens and rework | — Pending |
| Human Acceptance Before Merge | Ensures functional validation occurs before code enters the main integration branch | — Pending |
| Post-Deploy Skill Learning Loop | Feeds lessons and patterns back into agent skills for continuous improvement | — Pending |

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
*Last updated: 2026-09-07 after Golden Path alignment*
