# Phase 4: ACCEPT — Human Validation Gate & Rework Breaker - Context

**Gathered:** 2026-09-08
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous batch tables accepted)

<domain>
## Phase Boundary

Assembles and attaches the comprehensive acceptance packet (test summary, diff stat, PR link, preview URL) when tickets reach `Dev Done`, detects human acceptance verdicts (approval advancing to merge vs rejection returning to `In Dev`), constructs the cumulative rework context envelope (original AC + prior diff + review comments), and enforces a shared circuit breaker capping automated rework loops at 2 bounces across Accept and PR Review.

</domain>

<decisions>
## Implementation Decisions

### Acceptance Packet Composition & Presentation
- Packet contents: test run summary (passed/failed counts, duration), cumulative diff stat (<250 LOC), PR link, and optional preview/staging URL.
- ADO presentation: formatted HTML comment with `[Acceptance Packet]` header, structured table, collapsible details, and bot loop shield tag.
- Preview resolution: template-based via `PREVIEW_URL_TEMPLATE` env var or local development port fallback.
- Tagging: append `[awaiting-acceptance]` tag to work item when transitioning to `Dev Done`.

### Human Verdict Detection (Approve vs Reject)
- Approval signal: moving work item from `Dev Done` to `Ready for QA` (or posting `[approve-acceptance]` comment).
- Rejection signal: moving work item from `Dev Done` back to `In Dev` with human feedback comments.
- Feedback extraction: query latest human comments submitted since ticket entered `Dev Done`.
- Loop prevention: verify `System.ChangedBy.id !== ADO_BOT_ID` and comment lacks `[automated-agent]` marker.

### Rework Context Envelope & Resumption
- Cumulative envelope: original ticket acceptance criteria + prior cumulative git diff + recent developer review comments.
- Task branch: check out existing branch `task/ticket-{id}-{slug}` and apply iterative fixes.
- Commit convention: Conventional Commit `fix(review): address acceptance feedback` with `AB#<id>` trailer.
- Full verification: re-run diff ceiling check, test immutability guard, test runner, and self-repair loop on every rework turn.

### Shared Rework Circuit Breaker (Max 2 Bounces)
- Counter storage: SQLite `rework_cycles` table `(work_item_id, bounce_count, last_bounce_at, source_gate)`.
- Limit: shared maximum of 2 automated rework cycles across both Accept and PR Review gates.
- Breaker action (3rd rejection): patch `System.State` to `Blocked`, add tag `[rework-escalated]`, post escalation comment tagging human lead.
- Reset mechanism: human comment `[reset-rework]` resets counter to 0 in SQLite.

### Claude's Discretion
- Drizzle schema definition and indexes for `rework_cycles`.
- HTML styling and Markdown formatting for the acceptance packet and rework comments.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/db/schema.ts` & `src/db/index.ts`: SQLite schema and transactional queries.
- `src/ado/work-item.ts`: Work item patch methods and discussion comment helpers.
- `src/execute/worker.ts`: Execution worker running bounded implementation and verification.
- `src/test-runner/evidence.ts`: L3 evidence formatting and SQLite persistence.

### Established Patterns
- Fastify webhook routing and decoupled background task execution.
- Bot echo loop prevention via author ID and marker checks.

### Integration Points
- Extends the `Dev Done` transition from Phase 3 with structured acceptance packets.
- Routes `Dev Done` -> `In Dev` rejections through rework context envelope back into the execution worker.

</code_context>

<specifics>
## Specific Ideas
- The acceptance gate must give human reviewers full visibility into what the agent changed and verified before merging.
- Never exceed 2 automated rework attempts to prevent token waste and review fatigue.

</specifics>

<deferred>
## Deferred Ideas
- Interactive approval buttons directly inside Slack or Microsoft Teams (v2).
- Automatic staging environment provisioning via Kubernetes ephemeral namespaces (v2).

</deferred>
