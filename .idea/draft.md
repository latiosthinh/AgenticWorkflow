# Agentic SDLC Workflow Draft

## Lifecycle Overview

```
[ ADO Dashboard ]
       │
       ▼
1. Ticket Intake & Audit (Agent)
   - Read ticket requirements & acceptance criteria
   - Audit quality / missing details
   - Transition: -> "Ready to Dev"
       │
       ▼
2. Developer Triage & Trigger (Human)
   - Assign domain tags: frontend, backend, fullstack, infra
   - Transition: -> "In Dev"
       │
       ▼ (Event Trigger)
3. Implementation Loop (Agent - Local / Cloud)
   - Load role-specific skills & MCP tools
   - Plan -> Code -> Unit Test -> Fix loop
   - Create Pull Request (PR)
   - Transition: -> "Dev Done"
       │
       ▼
4. Developer Review & Iteration (Human / Feedback Loop)
   - Review PR
   - Option A: Request changes (comments, modified description) -> Move back to "In Dev" -> Re-triggers Agent
   - Option B: Approve & Merge PR -> Move to "Ready for QA"
       │
       ▼
5. QA Verification Loop (Tester / QA Agent)
   - Tester runs manual / automated validation loop
   - Fail -> Move back to "In Dev" with bug details
   - Pass -> Move to "Ready to Deploy"
       │
       ▼
6. Done
   - Ticket reaches "Ready to Deploy"
   - Workflow marked completed
```

## Key Components

### 1. Integration & Triggers
- **Source**: Azure DevOps (ADO) Boards / Work Items API & Webhooks.
- **Event Listeners**:
  - `ticket.created` / `ticket.updated` -> triggers requirements audit agent.
  - `ticket.state_changed` to `"In Dev"` -> triggers coding agent dispatch.
  - `ticket.state_changed` back to `"In Dev"` with comments -> triggers review-fix agent loop.
  - `ticket.state_changed` to `"Ready for QA"` -> triggers QA workflow.

### 2. Agent Execution Layer
- **Environment**: Local CLI runner or Cloud container worker.
- **Context Injection**:
  - Ticket description, acceptance criteria, comments history.
  - Repository context, branches, target stack.
  - Modular skills and MCP servers (Git, Code search, Test runner, ADO API).
- **Execution Loop**:
  - Self-verification with local tests before PR.
  - PR link attached back to ADO work item.

### 3. Human-in-the-Loop Gates
- Gate 1: Requirement audit sign-off (Dev picks up ticket).
- Gate 2: Code review & PR approval.
- Gate 3: QA sign-off before deploy.
