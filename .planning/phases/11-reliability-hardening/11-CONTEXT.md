# Phase 11: Reliability Hardening - Context

**Gathered:** 2026-09-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Harden the orchestrator against transient failures, resource hangs, data loss, and silent degradation:
1. Tag wipe prevention (REL-01): abort/retry tag operations on ADO fetch failure.
2. Timeouts (REL-02): enforce `LLM_TIMEOUT_MS` and `ADO_TIMEOUT_MS` using `AbortSignal`.
3. Ingress & Dedup (REL-03, REL-07, REL-08): allow 1 retry on `failed` dedup markers, full sha256 hex PR dedup keys, terminal `.catch` on lane promises, and `process.on('unhandledRejection')`.
4. Poller bounds (REL-04): filter WIQL to non-terminal states, changed-date window, `$top 50`, routed via `withRetry`.
5. Hazard isolation & fail-closed (REL-05, REL-06): skill PR publishing in dedicated worktree/lock; QA worktree attach failure fails closed with `[qa-harness-error]`.
6. StateStore & Degradation (REL-10, REL-11): `fsync` before rename, sweep `.bak.*`/`.tmp.*` orphans; record degradation flags in ticket state on silent catch blocks.

</domain>

<decisions>
## Implementation Decisions

### Tag Wipes & Timeouts (REL-01, REL-02)
- In `src/scope/gate.ts:131-137,249-257,276-283`: remove empty `tags = ''` catch fallback. Use `withRetry` to fetch tags. If all retries fail, throw error and abort the tag update.
- In `src/config/env.ts`: add `LLM_TIMEOUT_MS` (default 60_000, max 180_000) and `ADO_TIMEOUT_MS` (default 30_000).
- Pass `AbortSignal.timeout(env.LLM_TIMEOUT_MS)` to `generateText` in `evaluator.ts` and `planner.ts`.
- In `src/ai/provider.ts:customStreamFetch`, enforce timeout signal. In `src/ado/client.ts:withRetry`, add request timeout.

### Ingress, Dedup & Poller (REL-03, REL-04, REL-07, REL-08)
- In `src/state/store.ts:recordDedupEvent` and `src/ingress/routes.ts`: if a dedup marker exists with status `failed`, check retry count (`retryCount < 1`). If eligible, allow redelivery by setting status back to `processing` with `retryCount = 1`. If already retried or `completed`/`skipped`, reject.
- In `src/ingress/routes.ts:64-65`: construct PR dedup key using full `crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')`.
- In `src/ingress/routes.ts` and `src/ingress/poller.ts`: append terminal `.catch((err) => ...)` to all unawaited `runInLane(...)` calls.
- In `src/index.ts`: register `process.on('unhandledRejection', (reason, promise) => ...)`.
- In `src/ingress/poller.ts`: rewrite WIQL query to:
  `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.State] NOT IN ('Done', 'Closed', 'Removed') AND [System.ChangedDate] >= @Today - 1 ORDER BY [System.ChangedDate] DESC` with `$top = 50`. Route all calls through `withRetry`.

### Isolation, StateStore & Degradation Flags (REL-05, REL-06, REL-10, REL-11)
- In `src/learn/publisher.ts`: use `createWorktree` to stage and publish skill PRs on an ephemeral branch in an isolated worktree, rather than checking out branches in `process.cwd()`.
- In `src/qa/worker.ts:76-77`: if `createWorktree` fails to attach or create, fail closed — tag ticket `[qa-harness-error]`, transition to Blocked, post alert comment. Never fallback to `worktreePath = process.cwd()`.
- In `src/state/store.ts:writeCrashAtomicSync`: use `fs.openSync` + `fs.writeSync` + `fs.fsyncSync(fd)` + `fs.closeSync(fd)` before rename. In `purgeDedupRecords`: also sweep files matching `.*\.tmp\..*` and `.*\.bak\..*` in the tickets directory.
- In `src/state/types.ts`: add optional `degradations: Array<{ timestamp: string; component: string; error: string; context?: any }>` to `TicketState`.
- Record degradation in:
  - `src/execute/router.ts:78-80` (prev-rev lookup fail)
  - `src/ingress/pr-router.ts:85-87` (details fail)
  - `src/qa/worker.ts:206-208` (rework dispatch fail)
  - `src/state/store.ts:387-389` (dedup status collision)

</decisions>
