# Phase 3: EXECUTE + CHECK — Bounded Implementation & Self-Repair Verification - Context

**Gathered:** 2026-09-08
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous batch tables accepted)

<domain>
## Phase Boundary

Autonomous multi-file code editing bounded by a strict diff ceiling (<250 LOC), read-only protection of baseline test assertions, iterative local test execution with an automated self-repair loop (max 3-5 iterations), generation of structured L3 Functional Evidence, and transition of passing tickets from `In Dev` to `Dev Done`.

</domain>

<decisions>
## Implementation Decisions

### Code Editing & Diff Ceiling (<250 LOC)
- Diff ceiling: compute cumulative `git diff --shortstat` before each commit; abort and flag if additions+deletions exceed 250 LOC.
- Multi-file editing: structured tools (`editFile`, `createFile`, `deleteFile`) powered by Vercel AI SDK and TypeScript file operations in the worktree.
- Dependency guard: only allow package additions (`package.json`) if explicitly listed in ticket acceptance criteria or pre-approved allowlist.
- Commit convention: Conventional Commits (`feat(...)`, `fix(...)`) with work item link trailer `AB#<id>`.

### Test Protection & Tamper Resistance
- Baseline test immutability: pre-PR diff check enforces 0 modifications or deletions of existing test files (`tests/**`, `*.test.*`).
- New test creation: agent is permitted to create new test files for newly implemented features.
- Assertion presence: new test files must contain valid assertion statements (`expect(...)` or `assert(...)`) to prevent empty test hacking.
- Contract conflict: if existing tests fail due to intentional requirements shift, flag ticket blocked with `[Contract Conflict]` comment and require human intervention.

### Self-Repair Loop & Failure Diagnostics
- Repair iterations: capped at 3 attempts (configurable up to 5 via `MAX_REPAIR_CYCLES`).
- Diagnostic context: feed pruned test failure output (failing test name, assertion failure message, top 15 application stack trace frames) into the repair prompt.
- Exhaustion handling: on budget exhaustion, push WIP branch `wip/ticket-{id}`, post `[Repair Exhausted]` comment with diagnostics, and flag ticket blocked.

### L3 Evidence Capture & "Dev Done" Transition
- Evidence schema: structured JSON record (`testSuite`, `totalTests`, `passed`, `failed`, `durationMs`, `coverageSummary`, `gitDiffStat`).
- Persistence: store in SQLite `l3_evidence` table and post formatted HTML comment with `[L3 Evidence]` badge to ADO discussion.
- State transition: patch `System.State` from `In Dev` to `Dev Done` via ADO JSON Patch API.
- Tags: add `[l3-verified]`, retain domain tags (`frontend`, `backend`, `infra`).

### Claude's Discretion
- Exact system prompt phrasing for the coder/repair agent.
- Regex rules for stack trace pruning and Vitest output extraction.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/sandbox/worktree.ts`: Ephemeral git worktree manager and test file locker.
- `src/sandbox/runner.ts`: Sanitized `execa` process runner with timeouts and credential scrubbing.
- `src/mcp/registry.ts`: Dynamic MCP tool dispatcher loading scoped tools.
- `src/ado/work-item.ts`: ADO REST client for work item patching and comments.
- `src/db/`: SQLite connection and Drizzle ORM schema.

### Established Patterns
- Fastify webhook routing and decoupled background task execution.
- Transactional state updates in SQLite WAL mode.

### Integration Points
- Triggered by Phase 2 plan checkpoint completion or tickets entering `In Dev` with a locked plan.
- Delivers completed code, passes test verification, and transitions ticket to `Dev Done` for Phase 4 (ACCEPT).

</code_context>

<specifics>
## Specific Ideas
- Never allow an agent to pass a test suite by modifying the test that failed.
- Always preserve WIP commits when repair budget is exhausted so developers don't lose agent progress.

</specifics>

<deferred>
## Deferred Ideas
- Parallel test execution across multiple runners (v2 — single worktree runner for v1).
- Flaky test automated re-try during local unit testing (handled in Phase 6 staging QA gate).

</deferred>
