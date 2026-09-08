---
phase: 02-execute-foundation-sandbox-dynamic-mcp-plan-checkpoint
plan: 03
subsystem: plan-checkpoint
tags:
  - plan-checkpoint
  - human-in-the-loop
  - watchdog
  - git-worktree
  - fastify-router
  - ad-qa
dependency_graph:
  requires:
    - 02-01 (git worktree sandbox and runner)
    - 02-02 (dynamic MCP tools and domain dispatcher)
  provides:
    - Drizzle planCheckpoints table and raw SQLite DDL migration (src/db/schema.ts, src/db/index.ts)
    - Zod PlanResultSchema and formulateImplementationPlan AI planning agent (src/plan/schema.ts, src/plan/planner.ts)
    - ADO HTML comment formatters with [Plan Q&A] and [Plan Checkpoint] headers (src/plan/formatter.ts)
    - SQLite persistence repository for plan checkpoint lifecycle (src/plan/checkpoint.ts)
    - 24h reminder ping and 72h Blocked escalation watchdog poller (src/plan/watchdog.ts)
    - Execution worker releasing worktrees on ambiguity and resuming on developer reply (src/execute/worker.ts)
    - Unified webhook router dispatching New to auditor and In Dev to executor (src/execute/router.ts)
  affects:
    - Phase 03 (Autonomous code execution begins with pre-locked plan checkpoints)
tech_stack:
  added: []
  patterns:
    - Interactive plan checkpoint state machine (pending_human_input -> locked / blocked)
    - Immediate release of git worktree and MCP session upon clarification question generation
    - Non-bot discussion comment reply resumption removing [awaiting-input] tag
    - Periodic watchdog poller triggering 24h reminders and 72h Blocked state transitions
    - Unified webhook event dispatcher routing by work item state ('New' vs 'In Dev')
key_files:
  created:
    - src/plan/schema.ts
    - src/plan/formatter.ts
    - src/plan/planner.ts
    - src/plan/checkpoint.ts
    - src/plan/watchdog.ts
    - src/execute/worker.ts
    - src/execute/router.ts
    - tests/planner.test.ts
    - tests/plan-checkpoint.test.ts
  modified:
    - src/db/schema.ts
    - src/db/index.ts
    - src/ado/work-item.ts
    - src/sandbox/worktree.ts
    - src/index.ts
    - tests/ado-client.test.ts
decisions:
  - "Released ephemeral git worktree immediately when ambiguities are detected in ticket planning to prevent holding host resources during 24h-72h human reply window"
  - "Structured clarification Q&A comments with [Plan Q&A] header, tagged ticket [awaiting-input], and filtered bot echoes using <!-- [automated-agent] --> markers"
  - "Triggered 24h reminder ping comment for unanswered questions and escalated to Blocked state after 72h via background poller"
  - "Unified ADO ingress webhook routing by state: 'New' tickets routed to L1 contract auditor, and 'In Dev' or '[awaiting-input]' tickets routed to execution worker"
metrics:
  duration: 12m
  completed_date: "2026-09-08"
  tasks: 3
  files: 15
---

# Phase 02 Plan 03: Plan Checkpoint Lifecycle, Resumption & Watchdog Summary

Substantive achievement: Implemented the interactive plan checkpoint (`Q->human`) lifecycle, immediate sandbox release on ambiguity, developer comment resumption, 24h reminder / 72h blocker watchdog, and unified webhook execution router.

## Accomplishments

1. **Drizzle Plan Checkpoints & AI Planner (PLAN-01)**
   - Defined `planCheckpoints` table in `src/db/schema.ts` and registered raw DDL in `src/db/index.ts`.
   - Built `PlanResultSchema` with Zod validation for technical questions, implementation plan steps, estimated files, and test strategies.
   - Created `formulateImplementationPlan` with deterministic test fallback and live OpenAI `gpt-4o` structured output reasoning.
   - Added `formatPlanQuestionsComment` and `formatPlanLockedComment` producing sanitized HTML comments with automated agent markers.

2. **Checkpoint Persistence, Tag Patching & Watchdog (PLAN-02)**
   - Implemented SQLite repository methods (`createPlanCheckpoint`, `getPendingCheckpoint`, `lockPlanCheckpoint`, `updateCheckpointStatus`).
   - Extended `src/ado/work-item.ts` with `buildTagPatch`, `buildPlanQuestionPatch`, and `buildPlanLockedPatch` to manage `[awaiting-input]` tag and discussion comments.
   - Built `checkPlanCheckpointTimeouts` and `startPlanWatchdog` background poller executing 24h developer reminder pings and 72h Blocked escalation state transitions.

3. **Worker Orchestration & Unified Webhook Router (PLAN-01, PLAN-02)**
   - Built `processWorkItemExecute` provisioning ephemeral worktrees, resolving dynamic MCP tools, and formulating plans.
   - Enforced immediate release of git worktree and MCP session when ambiguities are detected, preventing host resource starvation while waiting for human developers.
   - Implemented comment resumption flow: detects human replies on `[awaiting-input]` tickets, updates checkpoint to `locked`, removes tag, and posts locked confirmation.
   - Implemented `routeWorkItemEvent` directing `New` tickets to contract auditor and `In Dev` / `[awaiting-input]` tickets to execution worker.
   - Connected `routeWorkItemEvent` and `startPlanWatchdog` in Fastify server lifecycle in `src/index.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing test for WorkItemDetails extensions**
- **Found during:** Task 3 verification (`npm test`)
- **Issue:** `tests/ado-client.test.ts` expected `getWorkItemDetails` to strictly match previous object without `tags` and `history`.
- **Fix:** Added default `tags: ''` and `history: ''` assertions to match updated schema.
- **Files modified:** `tests/ado-client.test.ts`
- **Commit:** `0dd6177`

**2. [Rule 1 - Bug] Idempotent worktree cleanup on duplicate/re-run tickets**
- **Found during:** Task 3 integration test run
- **Issue:** `createWorktree` threw `fatal: a branch named '...' already exists` if a previous run had left a worktree at the same path.
- **Fix:** Added check in `createWorktree` to invoke `cleanupWorktree` if `worktreePath` already exists.
- **Files modified:** `src/sandbox/worktree.ts`
- **Commit:** `0dd6177`

**3. [Rule 3 - Blocking Issue] TypeScript iterable spread error on JsonPatchDocument**
- **Found during:** Task 3 `npm run build`
- **Issue:** `JsonPatchDocument` in `azure-devops-node-api` is defined as an empty interface rather than array type, causing `error TS2488: Type 'JsonPatchDocument' must have a '[Symbol.iterator]()' method`.
- **Fix:** Typed `buildTagPatch` return value as `JsonPatchOperation[] & JsonPatchDocument`.
- **Files modified:** `src/ado/work-item.ts`
- **Commit:** `0dd6177`

## Verification Results

1. Planner unit tests:
   ```bash
   npx vitest run tests/planner.test.ts
   # 9 passed
   ```
2. Plan checkpoint integration tests:
   ```bash
   npx vitest run tests/plan-checkpoint.test.ts
   # 8 passed
   ```
3. Full project regression suite:
   ```bash
   npm test
   # 11 test files passed, 87 total tests passed
   ```
4. TypeScript compilation:
   ```bash
   npm run build
   # tsc exited cleanly with 0 errors
   ```

## Self-Check: PASSED

- FOUND: `src/db/schema.ts`
- FOUND: `src/db/index.ts`
- FOUND: `src/ado/work-item.ts`
- FOUND: `src/plan/schema.ts`
- FOUND: `src/plan/formatter.ts`
- FOUND: `src/plan/planner.ts`
- FOUND: `src/plan/checkpoint.ts`
- FOUND: `src/plan/watchdog.ts`
- FOUND: `src/execute/worker.ts`
- FOUND: `src/execute/router.ts`
- FOUND: `src/index.ts`
- FOUND: `tests/planner.test.ts`
- FOUND: `tests/plan-checkpoint.test.ts`
- FOUND: `d6cd0c2`
- FOUND: `a1af2d8`
- FOUND: `0dd6177`
