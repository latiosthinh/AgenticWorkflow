# Feature Landscape

**Domain:** Autonomous Agentic SDLC Platform (Azure DevOps Native)
**Researched:** 2026-09-07

## Table Stakes

Features users expect. Missing = product feels incomplete or unusable.

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| **ADO State Transition Listener** | Trigger agents on board movements (`In Dev`, `Dev Done`, `Ready for QA`). Essential for hands-off dispatch. | Med | Webhooks preferred. Polling fallback needed for firewalled instances or missed events. |
| **Ticket Context Ingestion & Parsing** | Agents must read title, description, acceptance criteria, tags, and comment history. | Low | Parse HTML/Markdown fields from ADO REST API; extract structured acceptance criteria. |
| **Workspace & Repo Sandboxing** | Clean checkout of target branch in isolated directory/container. Avoids host pollution and cross-run file contamination. | Med | Ephemeral working directories or container mounts. Clean git clone per run. |
| **Agent Code Planning & Generation** | Core capability: read ticket, search codebase, formulate edit plan, generate multi-file diffs. | High | Needs repo search tool (grep/glob/symbol search) and file editing capability. |
| **Local Test Execution & Self-Repair** | Run local build/tests (`npm test`, `pytest`, `dotnet test`). Feed test errors back into agent prompt to fix bugs before PR. | High | Hard timeout and max loop counter (3-5 iterations). Must catch compile errors, test failures, syntax errors. |
| **Pull Request & Work Item Linking** | Auto-create branch (`feature/AB#<id>-...`), commit changes, push, create PR, link to ADO ticket (`AB#<id>`). | Med | Azure Repos REST API or Git CLI. Fill PR title, description with summary of changes and test results. |
| **Review Feedback / Rework Loop** | Moving ticket back to `In Dev` with comments triggers agent to read feedback, fetch PR branch, and push new commits. | High | Needs state tracking: recognize existing PR branch rather than creating duplicate branch. |
| **ADO Progress Commenting** | Post run updates, execution plan, test status, and error logs directly as comments on ADO work item. | Low | Keeps team informed without leaving ADO board. Redact sensitive tokens/keys before posting. |
| **Credential & Secret Isolation** | ADO PATs, LLM keys, and repository credentials safely stored and never leaked in PR diffs or ticket logs. | Med | Inject via environment variables; scrub logs before sending to ADO comments. |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **Intake Quality Audit Gate ("Ready to Dev")** | Pre-flight audit of ticket requirements. Checks for missing acceptance criteria, ambiguity, or missing repro steps before dev starts. | Med | Moves valid tickets to "Ready to Dev". Flags vague tickets with questions in comments. Saves wasted LLM tokens. |
| **Dynamic Skill & MCP Dispatch via Domain Tags** | Loads tailored MCP tools and skills based on ticket tags (`frontend`, `backend`, `infra`, `db`). | Med | Keeps context window lean. Prevents tool confusion (e.g. backend agent doesn't load frontend build tools). |
| **Context Compaction Across Rework Loops** | Summarizes past failed attempts and review rounds to preserve context window during long iteration loops. | High | Raw compilation dumps and historical file versions fill context fast. Smart diff summaries keep agent accurate. |
| **Multi-Turn QA Verification Gate ("Ready for QA" to "Ready to Deploy")** | Coordinates QA verification stage. Can trigger automated end-to-end tests or assist manual tester with verification checklists. | High | If QA fails and moves ticket back to `In Dev`, extracts bug reproduction notes into agent fix prompt. |
| **Deterministic Guardrails & Linting Pre-PR** | Runs formatting, linters, and static checks before opening PR. Ensures zero stylistic nitpicks during human review. | Low | Run linter/typechecker as mandatory pre-PR pass. Fail early if lint rules violated. |
| **Execution Cost & Circuit Breakers** | Per-ticket token caps, dollar budgets, and loop limits. Stops runaway loops or infinite hallucination spirals. | Low | Kill run if cost exceeds threshold (e.g., $3.00/ticket) or exceeds 5 self-repair iterations. |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|---|---|---|
| **Custom Web UI / External Dashboard** | Developers and QA already live in ADO. External dashboard causes tab switching, auth duplication, and workflow abandonment. | Use ADO Boards, Work Items, and PRs as primary and sole UI. |
| **Direct Automated Production Deployment** | Auto-deploying agent code to production invites catastrophic outages. Breaks standard compliance and audit standards. | Stop at "Ready to Deploy" gate. Hand off to existing CI/CD release pipelines and human deployment gates. |
| **Generic Multi-Tracker Abstraction (Jira + GitHub + ADO in v1)** | Premature abstraction over multiple trackers dilutes ADO-specific strengths (states, service hooks, work item hierarchy). | Build deep, first-class Azure DevOps integration first. |
| **Unbounded Autonomous Loops** | Agents running without loop limits burn money and produce degraded code on hard bugs. | Hard cap at 3-5 self-repair cycles. If still broken, leave comment detailing failure and move to human dev triage. |
| **Auto-Merging PRs Without Human Approval** | High risk of hallucinated security bugs, edge cases, or broken business logic slipping to master. | Always require human dev code review and PR approval before merge. |
| **Unsandboxed Host Execution** | Running arbitrary code directly on host machine risks file deletion, port conflicts, or secret theft. | Execute builds and tests in isolated directories or disposable worker containers. |
| **Full-Repository Semantic Embedding on Every Run** | Indexing massive repos into vector databases on every run is slow, expensive, and stale. | Use targeted grep, symbol search, file tree exploration, and ripgrep via local tools. |

## Feature Dependencies

```
[ ADO State Listener (Webhook/Polling) ]
                  │
                  ▼
   [ Ticket Ingestion & Parsing ]
                  │
                  ▼
  [ Requirements Audit Gate ("Ready to Dev") ]
                  │
                  ▼
   [ Developer Triage & Tagging ]
                  │
                  ▼
 [ Workspace Sandboxing & Target Checkout ]
                  │
                  ▼
   [ Dynamic Skill & MCP Dispatch ]
                  │
                  ▼
   [ Agent Planning & Code Generation ]
                  │
                  ▼
   [ Local Test Execution & Self-Repair ] ──(Exceeds limit)──► [ Human Escalation Comment ]
                  │ (Tests Pass)
                  ▼
    [ PR Creation & Work Item Link (AB#) ]
                  │
                  ▼
      [ Ticket State -> "Dev Done" ]
                  │
                  ▼
      [ Developer Code Review ]
           │                    │
     (Changes requested)    (Approved & Merged)
           │                    │
           ▼                    ▼
[ Rework Loop (Back to "In Dev") ]  [ Ticket State -> "Ready for QA" ]
                                                │
                                                ▼
                                    [ QA Verification Gate ]
                                         │             │
                                      (Failed)      (Passed)
                                         │             │
                                         ▼             ▼
                        [ Bounce-back to "In Dev" ] [ Ticket State -> "Ready to Deploy" ]
                                                                   │
                                                                   ▼
                                                            [ Workflow Done ]
```

## MVP Recommendation

Prioritize:
1. **ADO State Transition Listener & Work Item Sync**: Core trigger mechanism for `In Dev`.
2. **Ticket Ingestion & Parsing**: Base inputs for agent context.
3. **Workspace Isolation & Git Management**: Safe local workspace per ticket.
4. **Agent Implementation Loop with Local Test Self-Repair**: Multi-file code edits + build/test execution loop.
5. **PR Creation & ADO Work Item Linking**: Open PR with summary and link `AB#<id>`.
6. **Review Bounce-Back Loop**: Moving back to `In Dev` with comments resumes agent on existing PR branch.
7. **One Differentiator: Dynamic Skill & MCP Dispatch**: Domain tagging (`frontend`, `backend`, `infra`) selects focused toolsets, keeping context small and executions reliable.

Defer:
- **Requirements Quality Audit Agent ("Ready to Dev")**: Defer to Phase 2. Start with human dev reviewing ticket before dragging to `In Dev`.
- **Automated QA Verification Agent**: Defer to Phase 2. Let human QA run validation first; ensure dev loop is rock solid.
- **Complex Context Compaction across multiple review rounds**: Basic comment history appending works for v1; add smart compression once runs get long.

## Sources

- **Cognition Devin / Factory AI Droids**: State-driven autonomous SDLC agents with iterative self-repair and PR submission patterns.
- **GitHub Copilot Workspace & OpenHands**: Repo-level context gathering, planner-actor-verifier architectures, and review loop integrations.
- **Azure DevOps REST API & Service Hooks Documentation**: Work item tracking, board column state transitions, pull request API, and `AB#` automatic work item linking conventions.
- **Model Context Protocol (MCP) Specification**: Dynamic tool discovery, scoped runtime capabilities, and local developer environment decoupling.
