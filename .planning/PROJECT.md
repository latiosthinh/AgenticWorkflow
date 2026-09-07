# Agentic SDLC Workflow

## What This Is

An autonomous, human-in-the-loop SDLC automation system implementing the **Golden Path Standard (ten steps, seven columns, L1–L6 evidence)** adapted for Azure DevOps: CONTRACT audit (L1) → EXECUTE plan/implement with interactive `Q→human` checkpoint → CHECK local test self-repair (L3) → ACCEPT human verdict at `Dev Done` → MERGE PR review + native branch-policy CI gates (L2/L3/L4) → QA integration loop → DEPLOY via native ADO Environment approval (L5) with telemetry monitoring (L6) → LEARN skills feedback through reviewed PRs.

## Core Value

Deterministic, evidence-backed software delivery where AI agents autonomously plan, implement, and self-repair code while humans retain verdict gates (Contract, Plan Q&A, Accept, PR Merge, QA, Deploy Approval), CI/security enforcement stays native to ADO, and every stage leaves auditable L1–L6 evidence on the work item.

## The Adapted Golden Path (8 stages)

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

(None yet — ship to validate)

### Active

Full list with REQ-IDs: `.planning/REQUIREMENTS.md` (31 v1 requirements, 8 phases).

- [ ] **CONTRACT**: Webhook ingress (HMAC, dedup, echo shield) + L1 AC auditor.
- [ ] **EXECUTE**: Plan checkpoint (`Q→human`, non-blocking), dynamic MCP dispatch by tag, ephemeral worktree sandbox, secret scrubbing, bounded implementation.
- [ ] **CHECK**: Local unit tests + self-repair loop with L3 evidence capture.
- [ ] **ACCEPT**: Human validation gate at `Dev Done` with acceptance packet + shared max-2 rework breaker.
- [ ] **MERGE**: PR lifecycle with `AB#` linking, native branch-policy gate reading (no custom CI), review-reject rework loop, merge → `Ready for QA`.
- [ ] **QA**: Integration verification loop with 2-strike flake filter and failure diagnostics.
- [ ] **DEPLOY**: Native Environment approval (L5) + Azure Monitor/App Insights evaluation window (L6) + Done marking with evidence index.
- [ ] **LEARN**: Lifecycle analysis → skills PR (never direct commit; human merge required).

### Out of Scope

- Jira / GitHub Issues integrations — Azure DevOps only for v1.
- Custom CI orchestration — native ADO branch policies enforce L2/L3/L4; system reads status only.
- Custom deploy approval UI — native ADO Environments enforce L5.
- Unattended production deployments — human Environment approval mandatory.
- Direct-commit skill updates — prompt-injection persistence guard; learning writes go through PR review.
- Multi-tenant billing / enterprise org management — single-team runner first.

## Context

- Golden Path Standard source sketch: `.idea/draft.md` (7 columns, 10 steps, L1–L6 cards).
- Research: `.planning/research/` (stack, features, architecture, pitfalls) — SUMMARY.md carries a post-audit addendum; queue/persistence = SQLite WAL + p-queue (not Redis/BullMQ).
- Azure DevOps Boards/Repos/Pipelines is the only UI; no custom dashboard.
- MCP for tool dispatch; skills repository for learned context.

## Constraints

- **Tech Stack**: Node.js 24 LTS + TypeScript, Fastify webhook gateway, SQLite (better-sqlite3 + Drizzle, WAL), Vercel AI SDK + MCP SDK, azure-devops-node-api, simple-git + execa.
- **Security**: Non-root ephemeral execution, credential scrubbing, egress restrictions, read-only test assertions, mandatory L4 scan gate.
- **Governance**: Human verdict gates at Accept, PR Merge, QA escalation, Deploy. Shared rework breaker ≤2 automated bounces per stage family.
- **Native-first**: ADO branch policies (CI), ADO Environments (deploy approval) — extend, don't reimplement.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Golden Path 7-column standard adopted | Standardizes lifecycle into contract→execute→check→accept→merge→deploy→learn with explicit evidence | — Pending |
| Six Evidence Levels (L1–L6) | Readiness verifiable at every stage, not subjective status | — Pending |
| QA stage restored (post-audit) | Original draft's tester loop was silently dropped by raw standard; integration verification needs its own gate | ✓ Applied |
| Gated deploy + monitor in v1 (post-audit) | Golden Path includes Deploy/Monitor columns; human ◆ approval keeps governance | ✓ Applied |
| Reuse existing ADO states (post-audit) | ACCEPT lives on `Dev Done`; no new board columns; less migration friction | ✓ Applied |
| Native ADO gates (post-audit) | Branch policies enforce L2/L3/L4; Environments enforce L5 — least code, org-policy compliant | ✓ Applied |
| Plan checkpoint non-blocking (post-audit) | `Q→human` releases sandbox; comment re-triggers; 24h ping — no idle resource holds | ✓ Applied |
| Learning via PR only (post-audit) | Prevents self-modifying prompt-injection persistence in skills | ✓ Applied |
| Interactive Plan Checkpoint (Q→human) | Clarifies ambiguity before codegen; prevents wasted tokens/rework | — Pending |
| Shared rework breaker ≤2 | Bounds LLM cost and review ping-pong across Accept + PR review | — Pending |

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
*Last updated: 2026-09-07 after Golden Path audit decisions applied*
