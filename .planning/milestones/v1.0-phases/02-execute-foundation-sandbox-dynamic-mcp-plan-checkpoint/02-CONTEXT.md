# Phase 2: EXECUTE Foundation — Sandbox, Dynamic MCP & Plan Checkpoint - Context

**Gathered:** 2026-09-08
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous batch tables accepted)

<domain>
## Phase Boundary

Provisions isolated execution environments via ephemeral git worktrees, executes shell commands under strict timeouts with credential scrubbing, dynamically resolves work item domain tags to specialized MCP toolsets, and orchestrates the non-blocking interactive plan checkpoint (`Q→human`) releasing sandbox resources while awaiting developer clarification.

</domain>

<decisions>
## Implementation Decisions

### Ephemeral Git Worktree & Sandbox Lifecycle
- Worktree directory: `.worktrees/ticket-{id}-{slug}` within repository root, ignored by `.gitignore`.
- Branch naming: `task/ticket-{id}-{slug}` branched from latest `origin/main`.
- Cleanup: explicit cleanup on normal completion; startup sweep prunes orphaned worktrees older than 2 hours.
- Test protection: mark existing test directory files read-only (`chmod 444`) prior to agent execution; verify no modifications in pre-PR diff check.

### Process Runner & Credential Scrubbing
- Process execution via `execa` with parameterized argument arrays (`execa(cmd, args, options)`), strictly disabling `shell: false`.
- Credential scrubbing: strip all variables matching `*PAT*`, `*API_KEY*`, `*TOKEN*`, `*SECRET*` from child process environments; provide sanitized `PATH`, `HOME`, `NODE_ENV`.
- Timeout enforcement: 120s hard timeout with `SIGTERM` followed by `SIGKILL` after a 2-second grace period.
- Output truncation: cap stdout/stderr buffers at 50KB with `[...truncated...]` retention to avoid memory exhaustion and log bloat.

### Dynamic MCP Tool Registry & Domain Tag Resolver
- Tag resolver registry:
  - `frontend`: mounts DOM, CSS inspection, and browser test tools.
  - `backend`: mounts database schema inspection and API contract validation tools.
  - `infra`: mounts infrastructure linter and cloud resource mock tools.
  - Common: always mounts `git-tools`, `test-runner`, `file-tools`.
- Untagged fallback: defaults to the common toolset without domain-specific extensions.
- Integration: in-process TypeScript MCP definitions consuming `@modelcontextprotocol/sdk` and `@ai-sdk/mcp`.
- Guardrail: cap active tools at maximum 12 per agent run with 1-sentence concise descriptions to protect LLM context windows.

### Interactive Plan Checkpoint (Q→human) Lifecycle
- Question format: post ADO discussion comment with `[Plan Q&A]` header, structured numbered questions, and tag work item with `[awaiting-input]`.
- Resource release: immediately release ephemeral git worktree and terminate worker process cleanly; store pending question state in SQLite `plan_checkpoints` table.
- Resumption trigger: ADO webhook on `workitem.comment` from non-bot user matching `[awaiting-input]` ticket state incorporates answers, removes tag, locks plan, and enqueues worker.
- Timeout policy: send reminder notification after 24h unanswered; after 72h, mark ticket blocked and notify human tech lead.

### Claude's Discretion
- Exact database schema for `plan_checkpoints` table.
- Helper scripts for worktree creation and cross-platform Windows/POSIX path normalization.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/config/env.ts`: Environment configuration and validation.
- `src/db/`: SQLite connection (`better-sqlite3`) and schema definitions.
- `src/ado/client.ts`: Azure DevOps REST API client with backoff and retry.
- `src/ado/work-item.ts`: Work item patch and discussion comment methods.
- `src/queue/lane-manager.ts`: Per-ticket serialized task execution queue.

### Established Patterns
- Fastify webhook handling with HMAC verification and bot loop filtering.
- Transactional SQLite persistence using WAL mode.

### Integration Points
- Ingress webhook routes trigger worktree provisioning when `System.State` becomes `In Dev`.
- Discussion comment webhooks feed back into `plan_checkpoints` resolver to resume execution.

</code_context>

<specifics>
## Specific Ideas
- Never leave a worker process running or a git lock held while waiting for human input.
- Keep tool schemas minimal to leave maximum context for code files and test stack traces.

</specifics>

<deferred>
## Deferred Ideas
- Containerized Docker/OCI runner isolation on remote VM cluster (v2 — host process sandbox with execa and worktree for v1).
- Interactive web portal for plan Q&A (ADO work item discussion is sole interface for v1).

</deferred>
