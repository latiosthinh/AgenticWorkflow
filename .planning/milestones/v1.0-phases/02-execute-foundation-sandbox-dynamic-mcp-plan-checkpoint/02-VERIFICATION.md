---
phase: 02-execute-foundation-sandbox-dynamic-mcp-plan-checkpoint
verified: 2026-09-08T16:25:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Live ADO Webhook Q&A Resumption"
    expected: "Transitioning a ticket with ambiguous requirements to 'In Dev' posts a [Plan Q&A] discussion comment, tags the ticket [awaiting-input], and releases the worktree. Replying in ADO discussion resumes execution, removes [awaiting-input], and locks the plan with developer clarifications."
    why_human: "Requires real Azure DevOps organization project, active Service Hooks subscription, and interactive human comment entry in ADO Boards UI."
---

# Phase 2: EXECUTE Foundation — Sandbox, Dynamic MCP & Plan Checkpoint Verification Report

**Phase Goal:** Isolated execution environment, tag-scoped tools, and non-blocking interactive plan checkpoint.
**Verified:** 2026-09-08T16:25:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | "In Dev" transition provisions ephemeral git worktree isolated from host repo (SAND-01) | ✓ VERIFIED | `src/sandbox/worktree.ts`: `createWorktree` creates branch `task/ticket-{id}-{slug}` at `.worktrees/ticket-{id}-{slug}`, locks tests via `protectTestFiles` (`0o444`), cleans up via `cleanupWorktree` (`0o666` unlock before `worktree remove --force`), and startup sweeps via `pruneOrphanedWorktrees`. Passed in `tests/worktree.test.ts`. |
| 2 | Domain tags mount matching MCP servers only, no kitchen-sink toolsets (DISP-01) | ✓ VERIFIED | `src/mcp/registry.ts`: `createDynamicMcpTools` mounts common tools (`git_status`, `read_file`, `run_test`) + domain extensions (`frontend`, `backend`, `infra`) via in-process `McpServer` and `InMemoryTransport`. Caps tools at 12 with <=150 char descriptions. Passed in `tests/mcp-registry.test.ts`. |
| 3 | Commands run under 120s timeout with PATs/API keys scrubbed from env and logs (SAND-02) | ✓ VERIFIED | `src/sandbox/runner.ts`: `runCommand` executes via `execa` with `shell: false`, `timeout: 120_000`, `killSignal: 'SIGTERM'`, `forceKillAfterDelay: 2000`. `sanitizeEnv` strips `PAT|API_KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL`. `scrubOutput` redacts bearer tokens and explicit secrets. Buffers capped at 50KB via `truncateBuffer`. Passed in `tests/runner.test.ts`. |
| 4 | Plan questions posted to work item; sandbox released while awaiting answers (PLAN-01, PLAN-02) | ✓ VERIFIED | `src/execute/worker.ts` lines 152-182: on ambiguous requirements (`plan.hasAmbiguities = true`), records checkpoint in SQLite `plan_checkpoints`, posts sanitized HTML discussion comment via `formatPlanQuestionsComment`, tags ticket `[awaiting-input]`, and immediately releases sandbox via `cleanupWorktree` and `mcpSession.close()`. Passed in `tests/plan-checkpoint.test.ts`. |
| 5 | Human answer comment re-triggers run; 24h unanswered pings; plan locked before first code edit (PLAN-02) | ✓ VERIFIED | `src/execute/worker.ts` lines 34-85: non-bot comment on `[awaiting-input]` ticket queries revision via `adoClient.getRevision(workItemId, revId)`, locks plan in SQLite via `lockPlanCheckpoint`, removes `[awaiting-input]` tag, and posts locked plan comment. `src/plan/watchdog.ts` checks timeouts (24h reminder ping comment, 72h escalation to `Blocked`). Passed in `tests/plan-checkpoint.test.ts`. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/utils/paths.ts` | Cross-platform path normalizer and kebab slug generator | ✓ VERIFIED | Substantive (33 LOC), exports `normalizePath` and `slugify`. |
| `src/sandbox/types.ts` | Type definitions for worktree and command runner | ✓ VERIFIED | Substantive (23 LOC), exports `WorktreeResult`, `WorktreeOptions`, `CommandOptions`, `CommandResult`. |
| `src/sandbox/worktree.ts` | Worktree lifecycle management with chmod test file protection | ✓ VERIFIED | Substantive (219 LOC), exports `createWorktree`, `cleanupWorktree`, `protectTestFiles`, `unprotectFiles`, `pruneOrphanedWorktrees`. |
| `src/sandbox/runner.ts` | Hardened execa subprocess runner with timeout and credential scrubber | ✓ VERIFIED | Substantive (127 LOC), exports `runCommand`, `sanitizeEnv`, `scrubOutput`, `truncateBuffer`. |
| `src/mcp/types.ts` | TypeScript interfaces for MCP tool definitions and dynamic sessions | ✓ VERIFIED | Substantive (27 LOC), exports `McpToolDefinition`, `ToolRegistryOptions`, `DynamicMcpSession`. |
| `src/mcp/server.ts` | In-process McpServer bootstrap with InMemoryTransport pair | ✓ VERIFIED | Substantive (22 LOC), exports `createInProcessMcpServer`. |
| `src/mcp/tools/common.ts` | Common baseline tools mounted for all work items | ✓ VERIFIED | Substantive (56 LOC), registers `git_status`, `read_file` (with traversal guard), and `run_test`. |
| `src/mcp/tools/frontend.ts` | Frontend domain tools | ✓ VERIFIED | Substantive (28 LOC), registers `inspect_dom_structure` and `inspect_css_styles`. |
| `src/mcp/tools/backend.ts` | Backend domain tools | ✓ VERIFIED | Substantive (28 LOC), registers `inspect_db_schema` and `validate_api_contract`. |
| `src/mcp/tools/infra.ts` | Infra domain tools | ✓ VERIFIED | Substantive (28 LOC), registers `lint_infra_config` and `mock_cloud_resource`. |
| `src/mcp/registry.ts` | Dynamic tag dispatcher resolving domain tags to scoped AI SDK toolsets | ✓ VERIFIED | Substantive (97 LOC), exports `createDynamicMcpTools` with 12-tool cap and 150-char description truncate. |
| `src/db/schema.ts` | Drizzle schema extended with planCheckpoints table | ✓ VERIFIED | Substantive (67 LOC), defines `planCheckpoints` table with indexes and types. |
| `src/db/index.ts` | SQLite initialization and migration DDL | ✓ VERIFIED | Substantive (70 LOC), runs WAL pragma and creates `plan_checkpoints` table and indexes. |
| `src/ado/work-item.ts` | Work item field mappers and JSON patch builders | ✓ VERIFIED | Substantive (149 LOC), exports `buildTagPatch`, `buildPlanQuestionPatch`, `buildPlanLockedPatch`, `getWorkItemDetails`. |
| `src/plan/schema.ts` | Zod validation schema for plan reasoning and ambiguity outputs | ✓ VERIFIED | Substantive (19 LOC), exports `PlanResultSchema`, `PlanResult`. |
| `src/plan/formatter.ts` | HTML comment formatters with `[Plan Q&A]` and `[Plan Checkpoint]` headers | ✓ VERIFIED | Substantive (59 LOC), exports `formatPlanQuestionsComment`, `formatPlanLockedComment`. |
| `src/plan/planner.ts` | Planning agent evaluating ticket clarity with deterministic test fallback | ✓ VERIFIED | Substantive (72 LOC), exports `formulateImplementationPlan`. |
| `src/plan/checkpoint.ts` | SQLite persistence repository for plan checkpoint state machine | ✓ VERIFIED | Substantive (87 LOC), exports `createPlanCheckpoint`, `getPendingCheckpoint`, `lockPlanCheckpoint`, `updateCheckpointStatus`. |
| `src/plan/watchdog.ts` | Background poller for 24h developer reminder pings and 72h blocker escalations | ✓ VERIFIED | Substantive (111 LOC), exports `checkPlanCheckpointTimeouts`, `startPlanWatchdog`. |
| `src/execute/worker.ts` | Execution orchestrator provisioning sandbox, resolving MCP, evaluating plan, and releasing worktree on Q&A | ✓ VERIFIED | Substantive (259 LOC), exports `processWorkItemExecute`. |
| `src/execute/router.ts` | Unified webhook dispatcher routing 'New' tickets to auditor and 'In Dev' tickets to execute worker | ✓ VERIFIED | Substantive (57 LOC), exports `routeWorkItemEvent`. |
| `src/index.ts` | Fastify server entrypoint wiring routes, queue, watchdog, and startup pruning | ✓ VERIFIED | Substantive (116 LOC), registers router, starts watchdog, runs startup prune. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `src/sandbox/worktree.ts` | `src/utils/paths.ts` | `normalizePath`, `slugify` | ✓ WIRED | Invoked on worktree directory and branch naming |
| `src/sandbox/runner.ts` | `execa` | `execa(file, args, { shell: false, timeout })` | ✓ WIRED | Child process spawned with sanitized env and signal cascades |
| `src/mcp/tools/common.ts` | `src/sandbox/runner.ts` | `runCommand` | ✓ WIRED | Used in `git_status` and `run_test` MCP tools |
| `src/mcp/registry.ts` | `src/mcp/server.ts` | `createInProcessMcpServer` | ✓ WIRED | Bootstraps in-process server with `InMemoryTransport` |
| `src/mcp/registry.ts` | `@ai-sdk/mcp` | `createMCPClient` | ✓ WIRED | Bridges transport to Vercel AI SDK callable tools |
| `src/execute/worker.ts` | `src/sandbox/worktree.ts` | `createWorktree`, `cleanupWorktree` | ✓ WIRED | Provisions worktree on execution start and immediately cleans up on Q&A formulation or completion |
| `src/execute/worker.ts` | `src/mcp/registry.ts` | `createDynamicMcpTools` | ✓ WIRED | Mounts domain-scoped tools for ticket tags with known secrets |
| `src/execute/worker.ts` | `src/plan/planner.ts` | `formulateImplementationPlan` | ✓ WIRED | Evaluates ticket requirements for ambiguities |
| `src/execute/worker.ts` | `src/plan/checkpoint.ts` | `createPlanCheckpoint`, `lockPlanCheckpoint` | ✓ WIRED | Persists questions and locks plan on developer reply |
| `src/index.ts` | `src/execute/router.ts` | `registerWorkItemHandler(routeWorkItemEvent)` | ✓ WIRED | Ingress webhook triggers router |
| `src/index.ts` | `src/sandbox/worktree.ts` | `pruneOrphanedWorktrees(process.cwd())` | ✓ WIRED | Executed on server startup sweep |
| `src/index.ts` | `src/plan/watchdog.ts` | `startPlanWatchdog()` | ✓ WIRED | Starts background timer on startup |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `src/execute/router.ts` | `workItem` | `getWorkItemDetails(workItemId)` | Real ADO REST API work item fields | ✓ FLOWING |
| `src/execute/worker.ts` | `plan` | `formulateImplementationPlan(ticket)` | Zod-validated `PlanResult` (GPT-4o or test rubric) | ✓ FLOWING |
| `src/execute/worker.ts` | `pendingCheckpoint` | `getPendingCheckpoint(workItemId)` | SQLite query on `plan_checkpoints` | ✓ FLOWING |
| `src/execute/worker.ts` | `history` | `getWorkItemDetails(workItemId, revId)` -> `adoClient.getRevision` | Real revision discussion comment from ADO | ✓ FLOWING |
| `src/plan/watchdog.ts` | `pending` | `db.select().from(planCheckpoints)` | Real SQLite query filtering `status = 'pending_human_input'` | ✓ FLOWING |
| `src/mcp/registry.ts` | `tools` | `mcpClient.tools()` | Live tool definitions bound to in-process MCP server | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full Vitest suite | `npm test` | 11 test files passed, 91 tests passed (9.35s) | ✓ PASS |
| Phase 2 Vitest tests | `npx vitest run tests/worktree.test.ts tests/runner.test.ts tests/mcp-registry.test.ts tests/planner.test.ts tests/plan-checkpoint.test.ts` | 5 test files passed, 40 tests passed (5.19s) | ✓ PASS |
| TypeScript compile | `npm run build` | `tsc` finished with 0 errors | ✓ PASS |
| Path normalizer & slugify | `node -e 'import("./dist/utils/paths.js")...'` | `slug: feature-user-authentication-456`, `path: a/b/c` | ✓ PASS |
| Runner env sanitization & secret redaction | `node -e 'import("./dist/sandbox/runner.js")...'` | Sensitive env stripped (`false`), secret redacted (`Bearer [REDACTED]`) | ✓ PASS |
| Dynamic MCP tag resolution | `node -e 'import("./dist/mcp/registry.js")...'` | Returns 7 active tools for `["frontend", "backend"]` | ✓ PASS |
| SQLite checkpoint state machine | `node -e 'import("./dist/plan/checkpoint.js")...'` | Creates `pending_human_input`, locks to `locked`, returns `undefined` on subsequent pending lookup | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| **PLAN-01** | 02-03-PLAN.md | Agent formulates implementation plan and posts interactive clarification questions (`Q→human`) to work item discussion when ambiguities exist | ✓ SATISFIED | `src/plan/planner.ts`, `src/plan/formatter.ts`, `src/execute/worker.ts`, tested in `tests/planner.test.ts` and `tests/plan-checkpoint.test.ts` |
| **PLAN-02** | 02-03-PLAN.md | Plan checkpoint releases sandbox while awaiting human answers; human comment re-triggers run via webhook; unanswered questions ping after 24h; locked plan persists before code edits begin | ✓ SATISFIED | `src/plan/checkpoint.ts`, `src/plan/watchdog.ts`, `src/execute/worker.ts`, tested in `tests/plan-checkpoint.test.ts` |
| **DISP-01** | 02-02-PLAN.md | System dynamically resolves domain tags (`frontend`, `backend`, `infra`) to mount matching MCP tools and scoped context | ✓ SATISFIED | `src/mcp/registry.ts`, `src/mcp/tools/*.ts`, tested in `tests/mcp-registry.test.ts` |
| **SAND-01** | 02-01-PLAN.md | Worker provisions an ephemeral `git worktree` isolated from the host repository for each task run | ✓ SATISFIED | `src/sandbox/worktree.ts`, `tests/worktree.test.ts` |
| **SAND-02** | 02-01-PLAN.md | Process runner enforces execution timeouts (120s) and scrubs sensitive credentials (PATs, API keys) from environment variables and logs | ✓ SATISFIED | `src/sandbox/runner.ts`, `tests/runner.test.ts` |

### Anti-Patterns Found

None. No TODO/FIXME or unhandled stubs in Phase 2 source code. All 11 code review findings from `02-REVIEW.md` (including revision history retrieval, worktree leak on non-ambiguous plans, and watchdog exception isolation) were fixed in `02-REVIEW-FIX.md` and verified.

### Human Verification Required

### 1. Live ADO Webhook Q&A Resumption

**Test:**
1. Configure ADO project Service Hooks webhook targeting running application `/webhook/ado`.
2. Move a work item with ambiguous acceptance criteria to "In Dev".
3. Verify the agent posts `### [Plan Q&A]` clarification questions and tags the work item `[awaiting-input]`. Verify that the `.worktrees/` directory for this ticket has been deleted.
4. As a human developer, post a reply comment in the ADO discussion answering the questions.
5. Verify that the webhook receives the comment event, removes `[awaiting-input]`, and posts `### [Plan Checkpoint]` with the locked plan.

**Expected:** Worktree is released while awaiting answers; developer reply seamlessly re-triggers execution; plan locks in SQLite and ADO history.
**Why human:** Requires live Azure DevOps tenant, network webhook delivery, and human developer interaction in ADO web UI.

### Gaps Summary

No code, logic, or test gaps exist. All 5 requirements (PLAN-01, PLAN-02, DISP-01, SAND-01, SAND-02) and 5 Roadmap Success Criteria are fully satisfied in the codebase. All 91 test cases pass. Status is marked `human_needed` solely to allow live end-to-end testing against an active Azure DevOps organization with real webhook events.

---

_Verified: 2026-09-08T16:25:00Z_
_Verifier: the agent (gsd-verifier)_
