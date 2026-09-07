# Agentic SDLC Workflow

## What This Is

An autonomous, human-in-the-loop software development lifecycle (SDLC) automation system integrated with Azure DevOps (ADO). It monitors ADO boards, audits ticket requirements into "Ready to Dev", triggers specialized local or cloud AI agents upon moving tickets to "In Dev" (coding, unit testing, PR creation, moving to "Dev Done"), supports developer review and iterative rework loops, and coordinates QA verification until tickets reach "Ready to Deploy".

## Core Value

End-to-end automated ticket lifecycle where AI agents autonomously write and test code within iterative loops while developers and QA maintain control via ADO state transitions and review gates.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **ADO Ingestion & Audit**: Connect to Azure DevOps boards, fetch tickets, audit acceptance criteria/clarity, and transition valid tickets to "Ready to Dev".
- [ ] **Developer Triage & Trigger**: Support domain tagging (frontend, backend, infra) and dispatch agents when tickets transition to "In Dev".
- [ ] **Dynamic Skill & MCP Dispatch**: Load domain-tailored MCP tools, skills, and repository context into local or cloud agent runner environments.
- [ ] **Autonomous Implementation Loop**: Agent plans changes, generates code, executes local unit tests, self-repairs failures, creates a Pull Request, and links the PR to the ADO work item.
- [ ] **Dev Done & Review Loop**: Move ticket to "Dev Done"; allow developer review with approval/merge or request-changes (moving back to "In Dev" with comments to re-trigger the agent).
- [ ] **QA Verification Flow**: Transition approved PR tickets to "Ready for QA", manage test validation loops, handle failure bounce-backs to "In Dev", and advance passing tickets to "Ready to Deploy".
- [ ] **Workflow Completion Gate**: Mark workflow as done when work items arrive in "Ready to Deploy" with all verification criteria satisfied.

### Out of Scope

- Jira / GitHub Issues integrations — focus strictly on Azure DevOps for v1.
- Direct automated production deployment — v1 stops at "Ready to Deploy" gate.
- Multi-tenant billing and enterprise org management — local/single-team cloud runner first.

## Context

- Driven by team agile workflows in Azure DevOps Boards and Repos.
- Incorporates Model Context Protocol (MCP) and tool use for local test execution and git operations.
- Minimizes developer context switching by letting the ADO board serve as the primary orchestration interface.

## Constraints

- **Tech Stack**: TypeScript/Node.js or Python orchestration layer compatible with Azure DevOps REST API and MCP standard.
- **Security**: Secure storage and handling of ADO PATs, git repository credentials, and LLM API keys; isolated execution environment for untrusted agent code runs.
- **Latency & Reliability**: Webhook or polling listener must handle ADO rate limits and prevent duplicate agent dispatches.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| ADO Board as Single Source of Truth | Developers and QA manage workflow via familiar board states rather than custom dashboard | — Pending |
| State-Driven Re-triggering | Moving ticket back to "In Dev" with comments seamlessly activates iteration without new ticket creation | — Pending |
| Dynamic MCP / Skill Injection | Scoping tools by ticket tags (frontend vs backend) saves context window and avoids tool confusion | — Pending |

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
*Last updated: 2026-09-07 after initialization*
