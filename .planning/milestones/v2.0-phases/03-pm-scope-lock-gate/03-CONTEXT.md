# Phase 3: PM Scope-Lock Gate - Context

**Gathered:** 2026-09-17
**Status:** Ready for planning
**Mode:** Auto-accepted recommendations (autonomous execution)

<domain>
## Phase Boundary

A human 👤 PM scope-review verdict (Refinement Step 2) gates entry to EXECUTION — an audit-passed ticket parks on `New` + `[awaiting-scope-lock]` instead of auto-unlocking dev work, with the pending/locked state persisted in the ticket's `StateStore` record (`scopeLock`).

</domain>

<decisions>
## Implementation Decisions

### Scope Gate Mechanics
- **Park State:** Reuses existing `New` ADO state with tags `[audit-passed]` and `[awaiting-scope-lock]`. No new ADO board columns.
- **Verdict Channels:** Primary: ADO state/tag transitions (shield-safe, survives `isBotEcho` on quoted automated history). Secondary: comment tokens `[approve-scope]`, `[reject-scope]`, `[reset-scope]`.
- **Approval Actions:** Transition `New` -> `Ready to Dev`, add `[scope-locked]`, remove `[awaiting-scope-lock]`, record L1 scope-lock evidence in StateStore.
- **Rejection Actions:** Ticket remains in `New`, records feedback in StateStore, separate scope refinement counter incremented. If count > 2, escalate to `Blocked` + `[scope-unresolved]`.
- **Watchdog Cadence:** 24-hour reminder ping comment, 72-hour escalation, background poller reconcile for dropped webhooks.
- **Idempotency & Bypass Protection:** Tag and StateStore guard in `src/auditor/worker.ts` runs BEFORE LLM call, preventing re-audit loops on parked tickets.
- **Router Guard:** In `src/execute/router.ts`, transition to `In Dev` refuses dispatch if `scopeLock?.status !== 'locked'`, recording dedup skip.
- **Breaker Isolation:** Dedicated refinement counter in StateStore; does NOT consume the shared rework circuit breaker (≤2 accept/PR review).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/state/` — `StateStore` interface (`updateTicket`, `getTicket`, `listTickets`) for persisting `scopeLock`.
- `src/accept/verdict.ts` — pattern for comment token parsing and sanitization.
- `src/plan/watchdog.ts` — pattern for interval sweeps and lane-enqueued actions.
- `src/auditor/worker.ts` — audit completion interception point.

### Established Patterns
- Fastify webhook handling, `workItemQueueManager.runInLane`, ADO JSON patch generation with `<!-- [automated-agent] -->` shield.

### Integration Points
- `src/scope/` (new module): `verdict.ts`, `packet.ts`, `gate.ts`, `watchdog.ts`.
- `src/auditor/worker.ts`: modify to park ticket instead of auto-transitioning to `Ready to Dev`.
- `src/execute/router.ts`: add `isScopeLocked` guard on `In Dev` entry.
- `src/state/types.ts`: extend `TicketState` with `scopeLock` section.

</code_context>

<specifics>
## Specific Ideas

- Token names: `[approve-scope]`, `[reject-scope]`, `[reset-scope]`.
- Scope review packet format: L1 audit summary + DoD criteria checklist + testability sign-off.

</specifics>

<deferred>
## Deferred Ideas

- None.

</deferred>
