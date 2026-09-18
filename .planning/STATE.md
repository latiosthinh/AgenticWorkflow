---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Golden Path v2
status: executing
stopped_at: Completed Phase 5 Plan 03 (05-03-PLAN.md)
last_updated: "2026-09-18T00:50:03.863Z"
last_activity: 2026-09-18 — completed Plan 06-02 (Harvester enhancement, single-PR dual-asset staging & StateStore L7 persistence)
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 18
  completed_plans: 17
  percent: 94
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-09-16 — milestone v2.0)

**Core value:** Deterministic, evidence-backed delivery across the Golden Path v2 model (Refinement → Execution → Acceptance → Release → Retro; 9 steps) with **L1–L7** evidence, native ADO gates, and human verdicts.
**Current focus:** Milestone v2.0 — full restructure to the v2 model (5 columns / 9 steps / L1–L7) on a **file-backed `StateStore`** (SQLite removed — binding post-research owner decision).

## Current Position

Phase: 6 — Retro & L7 Output
Plan: 06-02 (completed) — Harvester enhancement, single-PR dual-asset staging & StateStore L7 persistence
Status: In progress (2 of 3 plans complete). Next: Plan 06-03 (Done transition re-sequencing, bounded retro retry & fail-closed L7 gate)
Last activity: 2026-09-18 — completed Plan 06-02 (Harvester enhancement, single-PR dual-asset staging & StateStore L7 persistence)

Progress: [█████████░] 94%

**Phase structure (v2.0 re-plan):** Wave A (serial): 1 StateStore Migration → 2 Taxonomy Foundation → **Wave B (3-way parallel): 3 PM Scope-Lock Gate ∥ 4 L7 Evidence Index Extension ∥ 5 Prod Smoke Suite** → Wave C: 6 Retro & L7 Output → Wave D: 7 Docs Realignment & E2E Proof. Critical path: 1 → 2 → 4 → 6 → 7.

## Performance Metrics

**Velocity:**

- Total plans completed: 34
- Average duration: 5.2 min
- Total execution time: 2.03 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. CONTRACT: Ingress & L1 Auditor | 3 | 13m | 4.3m |
| 2. EXECUTE Foundation: Sandbox, MCP & Plan | 3 | 23m | 7.7m |
| 3. EXECUTE + CHECK: Implement & Test | 3 | 17m | 5.7m |
| 4. ACCEPT: Human Validation Gate | 3 | 14m | 4.7m |
| 5. MERGE: PR & Native CI Gates | 3 | 15m | 5.0m |
| 6. QA: Verification Loop | 3 | 16m | 5.3m |
| 7. DEPLOY: Environment Approval & Monitor | 3 | 16m | 5.3m |
| 8. LEARN: Skills Feedback Loop | 2 | 11m | 5.5m |

*(v1.0 history — v2.0 phases start at 0.)*

**Recent Trend:**

- Last 5 plans: 03-01 (8m), 03-02 (6m), 03-03 (8m), 04-01 (4m), 05-01 (4m)
- Trend: Stable

*Updated after each plan completion*
| Phase 01 P02 | 4m | 2 tasks | 9 files |
| Phase 01 P03 | 6m | 2 tasks | 7 files |
| Phase 01 P04 | 8m | 2 tasks | 10 files |
| Phase 01 P05 | 15m | 3 tasks | 15 files |
| Phase 02 P01 | 3m | 2 tasks | 2 files |
| Phase 02 P02 | 6m | 2 tasks | 2 files |
| Phase 03 P01 | 8m | 2 tasks | 4 files |
| Phase 03 P02 | 6m | 2 tasks | 4 files |
| Phase 03 P03 | 8m | 2 tasks | 7 files |
| Phase 04 P01 | 4m | 2 tasks | 3 files |
| Phase 04 P02 | 4m | 2 tasks | 3 files |
| Phase 05 P01 | 4m | 2 tasks | 5 files |
| Phase 05 P02 | 4m | 2 tasks | 2 files |
| Phase Phase 05 PP03 | 5m | 2 tasks | 4 files |
| Phase 06 P01 | 4m | 2 tasks | 7 files |
| Phase 06 P02 | 4m | 2 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Audit]: QA stage restored as Phase 6 (`Ready for QA` state, 2-strike flake filter, bounce ≤2).
- [Audit]: v1 includes gated deploy + telemetry monitor (native ADO Environments approval, Azure Monitor 30-min window).
- [Audit]: Reuse existing ADO states — ACCEPT gate lives on `Dev Done`; no new board columns.
- [Audit]: Native ADO branch policies enforce L2/L3/L4 CI gates; system reads status only, no custom CI orchestration.
- [Audit]: Plan checkpoint (`Q→human`) non-blocking — sandbox released while awaiting answers; comment re-triggers; 24h ping.
- [Audit]: PR-review rejection rework loop reinstated (MRG-04), shares max-2 breaker with ACCEPT (ACCP-03).
- [Audit]: LEARN writes go through PR to skills repo — never direct commit (prompt-injection persistence guard).
- [Init]: ADO Boards is single source of truth; SQLite WAL queue decouples ingress from workers.
- [01-01]: Configured SQLite in WAL mode with synchronous=NORMAL for concurrent non-blocking reads and sub-millisecond writes.
- [01-01]: Configured 7-day TTL cleanup function for dedup_events to prevent unbounded table growth.
- [01-01]: Guarded crypto.timingSafeEqual with explicit buffer length check to prevent RangeError crashes on malformed signatures.
- [01-01]: Employed per-work-item concurrency=1 p-queue lanes to serialize rapid revisions on the same ticket without Redis.
- [01-02]: Enforced 4-point DoD rubric (Testability, Scope Boundaries, Personas & Behaviors, Completeness) via system instructions.
- [01-02]: Isolated untrusted ticket content in <user_ticket_input> XML tags with explicit meta-instruction override denial instructions.
- [01-02]: Included deterministic offline rule-based fallback in auditTicketContract when NODE_ENV === 'test' or custom mock is provided to guarantee fast, reliable unit testing without external API calls.
- [01-03]: Implemented withRetry helper supporting HTTP 429 Retry-After headers and exponential backoff with jitter (capped at 10s).
- [01-03]: Sanitized markdown-rendered HTML via sanitize-html before appending <!-- [automated-agent] --> loop shield comment.
- [01-03]: Constructed two-step JSON Patch operations (replace System.State and add System.History) for atomic ADO work item updates.
- [01-03]: Restricted L1 audit transitions strictly to tickets in 'New' state; non-'New' tickets are marked 'skipped' in dedup_events without mutation.
- [01-03]: Persisted comprehensive audit records in SQLite audit_log table with JSON-stringified reasons and criteria summary.
- [01-03]: Integrated startup and daily 7-day TTL cleanup and graceful signal handling (SIGINT/SIGTERM) draining all active lane queues.
- [02-01]: Configured extendEnv: false on execa calls to ensure host process credentials cannot leak into subprocess environments.
- [02-01]: Configured test assertion files with 0o444 read-only permissions during worktree setup and restored 0o666 on teardown to prevent Windows NTFS EPERM deletion locks.
- [02-01]: Enforced 120s execution timeout with SIGTERM and 2000ms forceKill SIGKILL cascade, returning standard exit code 124 on timeout.
- [02-01]: Added .worktrees/ to .gitignore to prevent ephemeral worktree directories from polluting git repository status.
- [02-02]: Initialized tool request handlers on McpServer prior to connecting InMemoryTransport to permit dynamic runtime tool registration.
- [02-02]: Enforced 12-tool ceiling and single-sentence descriptions (<=150 chars) across all tool registrations to prevent LLM prompt pollution and context saturation.
- [02-02]: Guarded read_file against path traversal by checking relative resolution against worktreePath root.
- [02-02]: Defaulted untagged work items safely to baseline common toolset (git_status, read_file, run_test).
- [02-03]: Released ephemeral git worktree immediately when ambiguities are detected in ticket planning to prevent holding host resources during 24h-72h human reply window.
- [02-03]: Structured clarification Q&A comments with [Plan Q&A] header, tagged ticket [awaiting-input], and filtered bot echoes using <!-- [automated-agent] --> markers.
- [02-03]: Triggered 24h reminder ping comment for unanswered questions and escalated to Blocked state after 72h via background poller.
- [02-03]: Unified ADO ingress webhook routing by state: 'New' tickets routed to L1 contract auditor, and 'In Dev' or '[awaiting-input]' tickets routed to execution worker.
- [03-01]: Used git add -N . before git diff --shortstat to ensure untracked additions in working tree count towards cumulative diff ceiling.
- [03-01]: Used inputSchema instead of parameters in createCoderTools for Vercel AI SDK v7 type alignment.
- [03-01]: Enforced strict path resolution prefix checks with case-insensitivity on Windows in coder tools to deny directory traversal.
- [03-01]: Enforced rejection of modifications, deletions, and renames targeting baseline test files while permitting new test additions.
- [03-02]: Stripped ANSI escape codes from stdout/stderr prior to Vitest summary and stack frame parsing.
- [03-02]: Enforced clamp on repair cycles between min 1 and max 5 (defaulting to 3).
- [03-02]: Preserved uncommitted changes on budget exhaustion to branch wip/ticket-{id} with AB#{id} commit trailer.
- [03-03]: Persisted structured L3 test evidence in SQLite l3_evidence table before transitioning ADO ticket state to prevent phantom transitions.
- [03-03]: Formatted sanitized HTML discussion comment badges with <!-- [automated-agent] --> loop shield to protect against recursive webhook triggers.
- [03-03]: Wired end-to-end execution pipeline transitioning passing tickets to Dev Done with [l3-verified] tag, and flagging Blocked on diff ceiling, contract conflict, or repair exhaustion.
- [04-01]: Sanitized markdown-rendered HTML allowing details and summary tags to present collapsible verification instructions.
- [04-01]: Appended <!-- [automated-agent] --> comment shield to acceptance packet comments to prevent webhook echo recursion.
- [04-01]: Used encodeURIComponent on branch names when resolving PR URLs to prevent parameter pollution.
- [04-01]: Implemented buildDevDoneAcceptancePatch replacing System.State with 'Dev Done' and applying '[awaiting-acceptance]' tag while removing '[awaiting-input]'.
- [04-02]: Used SQLite transactional upsert with onConflictDoUpdate on primary key workItemId to ensure atomic increment and prevent race conditions.
- [04-02]: Configured shared maximum bounce limit of 2, tripping on the 3rd rejection across both accept and pr_review gates.
- [04-02]: Preserved escalatedAt timestamp across subsequent rejected evaluations once circuit breaker is tripped.
- [04-02]: Appended <!-- [automated-agent] --> loop shield comment to escalation comments to prevent webhook echo loops.
- [04-03]: Detected human acceptance verdicts using both state transitions (Dev Done -> Ready for QA / In Dev) and explicit comment tokens ([approve-acceptance], [reject-acceptance], [reset-rework]) with loop shields and markers stripped from feedback.
- [04-03]: Preserved task branch history on rework turns via checkoutExistingBranch in createWorktree, bypassing branch deletion and reusing existing branch commits.
- [04-03]: Calculated base commit dynamically using git merge-base against base branch candidates (origin/main, master, etc.) to evaluate cumulative diff strictly across ticket changes.
- [04-03]: Integrated router event handling: approve tags [acceptance-approved], reject routes through circuit breaker (bounces <= 2 trigger rework, bounce 3 escalates to Blocked with [rework-escalated]), and [reset-rework] resets the counter.
- [05-01]: Exposed GitApi and PolicyApi accessors on AdoClient with mock injection setters for isolated testing.
- [05-01]: Normalized source and target branch ref names with refs/heads/ prefix in createOrGetPullRequest to ensure Azure Repos API compatibility.
- [05-01]: Prevented duplicate PR creation by querying existing active PRs (status=1) for the branch before calling createPullRequest.
- [05-01]: Registered formal ArtifactLink relation on ADO work items using vstfs:///Git/PullRequestId/{projectId}/{repositoryId}/{pullRequestId} URI.
- [05-01]: Enforced HTML sanitization on merge summary comments disallowing script, iframe, and unsafe schemes with loop shield marker.
- [05-02]: Used CodeReview artifact URI format vstfs:///CodeReview/CodeReviewId/${projectId}/${pullRequestId} to query ADO policy evaluations.
- [05-02]: Categorized branch policies by keyword classification into L2 (reviewers/quality), L3 (build), and L4 (status/security).
- [05-02]: Enforced two-key merge protection requiring both [acceptance-approved] tag and reviewer vote >= 5 (with zero negative votes) alongside green policies.
- [05-02]: Filtered PR discussion threads to skip Fixed, Closed, ByDesign, and deleted threads, while stripping bot-authored comments and <!-- [automated-agent] --> markers.
- [05-03]: Integrated shared rework circuit breaker (sourceGate: 'pr_review') capping combined rejections across accept and PR review at 2.
- [05-03]: Sanitized reviewer feedback by stripping script/HTML tags and wrapping comments in <pr_review_feedback> XML tags to mitigate prompt injection.
- [05-03]: Deduplicated git.pullrequest.* events in SQLite dedup_events table and serialized background processing per work item lane.
- [05-03]: Triggered PR creation automatically when tickets enter Dev Done, querying active PRs before creation to guarantee idempotency.
- [05-03]: Transitioned merged PRs to Ready for QA with [pr-merged] tag while removing [awaiting-acceptance] and posting a sanitized [Merge Summary] HTML comment.
- [06-01]: Added qa_runs, qa_bounces, and qa_evidence tables with Drizzle SQLite schema definitions.
- [06-01]: Normalized error traces by stripping timestamps, ports, and random UUIDs before computing SHA-256 fingerprint hashes.
- [06-01]: Enforced dedicated QA circuit breaker capping returns to In Dev at 2 bounces before escalating to Blocked with [qa-escalated].
- [06-02]: Configured QA environment variables and staging health check to avoid false failures during deployment cold starts.
- [06-02]: Implemented 2-strike sequential filter: clears flake on second run success; confirms regression on identical failure signatures.
- [06-03]: Formatted sanitized HTML discussion comments with <!-- [automated-agent] --> loop shield for QA evidence and diagnostics.
- [06-03]: Wired processQaVerification to route Ready for QA tickets to Ready to Deploy with [qa-verified] on pass, or In Dev with [qa-failed] on failure.
- [07-01]: Added deployment_records, telemetry_evaluations, and evidence_indices tables to SQLite Drizzle schema.
- [07-01]: Implemented L5 Deployment Readiness Packet evaluating migration risk and building automated rollback commands.
- [07-02]: Built production telemetry evaluation engine checking error-rate spikes (>1.0%) and p95-latency regressions (>500ms).
- [07-03]: Implemented unified L1–L6 evidence index aggregating contract, code review, test verification, security compliance, deploy approval, and telemetry.
- [07-03]: Wired processDeploymentWorkflow to route Ready to Deploy work items to Done with [golden-path-complete] upon passing telemetry, or In Dev with [deploy-regressed] upon breach.
- [08-01]: Added skills_prs table to SQLite Drizzle schema.
- [08-01]: Implemented harvestTicketLifecycleData collecting rework bounces, test repairs, telemetry metrics, and review comments.
- [08-01]: Enforced prompt-injection defense with <learning_source_context> isolation and meta-directive override denial.
- [08-01]: Synthesized standard SKILL.md files capturing overview, core patterns, and gotchas from rework history.
- [08-02]: Implemented stageAndPublishSkillPr opening Pull Requests with AB#<id> titles targeting main (never direct-committed).
- [08-02]: Attached sanitized HTML discussion comments with PR links and loop shield <!-- [automated-agent] --> to work items.
- [08-02]: Wired post-Done trigger in deploy worker to dispatch continuous learning feedback loop.

*(v1.0 [01-01]…[08-02] entries above are historical; SQLite/Drizzle-specific mechanics they describe are superseded by the file-backed StateStore decision below.)*

- [Roadmap] (SUPERSEDED by 2026-09-16 re-plan): v2.0 = 6 phases on a SQLite schema/migration foundation; 15/15 requirements. Replaced by the 7-phase / 19-requirement roadmap below.
- [Roadmap] (SUPERSEDED — VOID per ⚠ DECISION OVERRIDE): "Schema/migration grouped with taxonomy in Phase 1" and "raw idempotent DDL + guarded ALTER, no drizzle-kit, nullable l7_summary, permanent v1-fixture upgrade test" (old Resolved Conflict #2). There is no DB, no DDL, and no migration — Pitfall #1 is VOID. Replacement: additive `l7` field/section on the ticket state file; the StateStore migration IS the new Phase 1.
- [Roadmap]: Scope-gate park state = `New` + `[awaiting-scope-lock]` (SCOPE-01 wording authoritative — resolves research Open Decision #1 Axis B); Pitfall-6 second auditor guard (tag/record check before any LLM call) + triple-rev idempotency test are NON-optional. (Now Phase 3.)
- [Roadmap]: TAX-02 → Phase 7 (docs must describe the BUILT system); the behavior-preserving router refactor lands in Phase 2 under TAX-01 and is verified end-to-end in Phase 7.
- [Roadmap]: Resolved Conflict #3 binding — retro awaited BEFORE Done (fail-closed, single post-retro L1–L7 compile); human PR merge async, never gates Done; fire-and-forget learn call removed in Phase 6.
- [Roadmap]: Open Decision #2 resolved — v1.0 hardcoded L2/L4 index defaults stay as logged backlog debt; do NOT extend the fabrication pattern to L7 (grep-asserted in Phase 4).
- [Roadmap]: `deploy/worker.ts` edit split preserved under new numbering — Phase 5 (smoke) owns the smoke→telemetry sequencing insertion ONLY; Phase 6 (retro) owns the FINAL Done re-sequencing (smoke → telemetry → await retro → persist L7 → compile L1–L7 → Done) to avoid a conflicting edit.
- [Roadmap]: v2.0 RE-PLANNED (2026-09-16) around the binding ⚠ DECISION OVERRIDE — SQLite/Drizzle REMOVED; all orchestrator state on a file-backed `StateStore` (per-ticket markdown+frontmatter `data/state/tickets/<id>.md`; 12 tables → 1 file/ticket; workers backend-agnostic). New 7-phase roadmap replaces the stale 6-phase draft; 19/19 rev-2 requirements (new STATE-01..04 category) mapped exactly once.
- [Roadmap]: Wave structure — A (serial): 1 StateStore Migration → 2 Taxonomy Foundation (sequential: both edit router state calls) · B (3-way parallel): 3 Scope ∥ 4 L7 Index ∥ 5 Smoke (mutually independent file sets) · C: 6 Retro & L7 Output (needs 4 + 5) · D: 7 Docs & E2E. Critical path: 1 → 2 → 4 → 6 → 7. Total plan estimate: 19.
- [Roadmap]: Safety linchpin VERIFIED — `lane-manager.ts:9` `concurrency:1` ⇒ single-writer per ticket; ALL mutations (workers + watchdog + poller) route through `getLane(id)`; ingress dedup = atomic `wx` markers `data/state/dedup/<id>-<rev>` (EEXIST ⇒ duplicate) with TTL sweep mirroring the 7-day purge; writes crash-atomic (temp + rename, rm-then-rename on win32); watchdog scans + L7/DORA trends = `readdir` + frontmatter parse (O(active tickets)); ticket files get archive/TTL lifecycle; 277 tests port from `:memory:` SQLite to per-test `mkdtemp` dirs.
- [Roadmap]: `ponytail:` ceiling recorded — single orchestrator machine is load-bearing for local files; enterprise multi-instance swaps the `StateStore` impl → Postgres behind the same interface (STORE-01, deferred, NOT v2.0).
- [Roadmap]: Binding for every phase — no reintroduction of SQLite/Drizzle/tables/DDL; zero new deps AND dep reduction (`better-sqlite3`/`drizzle-orm`/`drizzle-kit` removed in Phase 1); research Pitfalls 2, 5–12 remain binding with storage wording read as the StateStore file equivalent.
- [01-01]: File-backed StateStore foundation implemented using strict JSON frontmatter between triple-dash fences with path traversal guards.
- [01-01]: Atomic file deduplication marker creation implemented via fs.writeFileSync with flag wx and 7-day TTL sweep.
- [01-01]: Ephemeral mkdtemp test harness created to isolate StateStore file system tests.
- [Phase 01]: Delegated stateStore methods through dynamic store reference with resetStateStore for seamless test directory rebinding
- [Phase 01]: Protected terminal dedup statuses ('skipped', 'failed') from being overwritten by 'completed' in FileStateStore
- [01-03]: Bound AsyncLocalStorage to per-work-item concurrency:1 lane queues, rejecting mutations outside matching lane context
- [01-03]: Added orphan sibling temp file recovery (.workItemId.md.tmp.*) on read and update to preserve crash atomicity
- [01-03]: Updated ingress routes to invoke background handlers via workItemQueueManager.runInLane to maintain ambient context
- [01-04]: Migrated plan checkpoints and watchdog scanner to StateStore with O(active tickets) readdir directory scans
- [01-04]: Migrated rework circuit breaker and QA circuit breaker bounce counters into single-writer serialized TicketState frontmatter
- [01-04]: Persisted QA test runs and evidence directly into ticket documents without SQLite dependencies
- [01-05]: Migrated execution, test runner, deploy, and learn worker state exclusively to file-backed StateStore
- [01-05]: Compiled unified L1-L6 evidence index directly from TicketState frontmatter without database queries
- [01-05]: Completely eliminated better-sqlite3, drizzle-orm, drizzle-kit, and src/db/ from repository
- [01-05]: Added re-entrancy support to WorkItemQueueManager.runInLane to avoid nested lane self-deadlocks
- [01-05]: Configured vitest test.exclude to ignore ephemeral .worktrees/** directories
- [02-01]: Recursively freeze GOLDEN_PATH_V2 array, step definitions, and child tag/evidence collections via Object.freeze
- [02-01]: Support both string and string-array formats for tags in resolveRoutingStep to maintain compatibility with ADO work item models
- [02-02]: Router state dispatch delegates to resolveRoutingStep from pipeline taxonomy using a step.step switch table
- [02-02]: Bound routeWorkItemEvent inside workItemQueueManager.runInLane to guarantee ambient lane context for all direct and routed state store mutations
- [03-01]: Park audit-passed tickets in 'New' with tags '[awaiting-scope-lock]; [audit-passed]' and post scope review packet instead of auto-transitioning to 'Ready to Dev'
- [03-01]: Pre-LLM idempotency guard checks ADO tags and StateStore scopeLock status early, skipping re-audit with dedup 'skipped' to eliminate token burns and duplicate transitions
- [03-02]: Scope verdict detection evaluates state transitions (New -> Ready to Dev), tags ([scope-locked], [scope-rejected]), and tokens ([approve-scope], [reject-scope], [reset-scope]) with HTML loop shields stripped
- [03-02]: Refinement circuit breaker operates strictly on draft.scopeLock.iterationCount without reading or modifying draft.reworkCycles, enforcing complete breaker isolation
- [03-02]: Third scope rejection trips refinement circuit breaker to Blocked state with [scope-unresolved] tag and posts escalation instructions
- [03-03]: Scope watchdog scans pending tickets on interval, posting 24h reminders and escalating tickets pending over 72h to Blocked with [scope-unresolved]
- [03-03]: Scope watchdog reconciles dropped webhooks by checking ADO state for Ready to Dev or [scope-locked] tag, updating StateStore to locked without reminder/escalation
- [03-03]: Router enforces fail-closed scope check at Step 3 In Dev, refusing dispatch with dedup status 'skipped' when scopeLock.status is not 'locked'
- [03-03]: Scope watchdog lifecycle wired into Fastify server startup and graceful shutdown alongside plan watchdog
- [04-01]: Exported L7EvidenceState interface with gateFriction, trendDeltas, and optional id/completedAt in StateStore types
- [04-01]: Added additive l7Summary to EvidenceIndexState and retroRecords/l7Evidence to TicketState
- [04-01]: Implemented compileL1L7EvidenceIndex extracting L1-L7 evidence and persisting l7Summary to StateStore inside runInLane
- [04-01]: Exported MissingEvidenceError and backward-compatible compileL1L6EvidenceIndex alias returning L1L7EvidenceSummary
- [04-02]: Dynamically derive stage columns for L1-L7 table rows from GOLDEN_PATH_V2 columns
- [04-02]: Permit pending retro status with [PENDING — retro in progress] when failClosed is false for cutover tolerance
- [04-02]: Enforce strict fail-closed MissingEvidenceError across L1-L7 when failClosed is true
- [04-02]: Reject fallback operators (??, ||) in L7 evidence mapping verified via static grep assertion test
- [05-01]: Enforced fail-closed check throwing descriptive error when PRODUCTION_SMOKE_URL is missing under NODE_ENV === 'production'
- [05-01]: Verified commit SHA from response headers or JSON body with 7-character prefix match to detect stale slot swaps
- [05-01]: Classified HTTP >= 500 as APP failures and HTTP 401/403 or network errors as INFRA failures
- [05-01]: Initialized smokeRuns: [] in default TicketState creation in StateStore
- [05-02]: Clamped smoke execution timeout to Math.min(timeoutMs, 300_000) with extendEnv: false and scrubbed known secrets (ADO_PAT, OPENAI_API_KEY, ADO_WEBHOOK_SECRET)
- [05-02]: Classified smoke errors into INFRA (timeouts, 401/403, socket hang up, ECONNRESET) vs APP (>= 500, SHA mismatch, test assertions) to isolate harness blips from code regressions
- [05-02]: Applied two-strike flake filter clearing flakes on sequential run 2 success and comparing SHA-256 fingerprints on run 2 failure
- [05-02]: Serialized smokeRuns and smokeEvidence state persistence via workItemQueueManager.runInLane
- [05-02]: Formatted sanitized bot-shielded alert comments with emergency rollback command for APP regressions
- [05-03]: Fail-fast smoke verification executed before opening 30-minute telemetry observation window
- [05-03]: APP smoke regressions bounce work item to In Dev with tag [deploy-regressed] and emergency rollback command
- [05-03]: INFRA smoke errors park work item in Ready to Deploy with tag [smoke-harness-error] for human operator review
- [05-03]: Composite L6 evidence index aggregates both smoke verification status and telemetry observation metrics
- [06-01]: Enforce strict Zod validation on retrospective action items with P1/P2/P3 priorities and trackingRef
- [06-01]: Guard DORA trend metrics against zero-baseline historical deployed tickets returning delta=0 and trend=stable without NaN
- [06-01]: Sanitize newlines and quotes in runbook titles and YAML frontmatter via escapeYamlString
- [06-02]: Stage both SKILL.md and RUNBOOK.md under .claude/skills/<name>/ in a single PR to eliminate review churn
- [06-02]: Omit RUNBOOK.md from PR staging when hasChanges is false, marking PR description with (no operational changes required)
- [06-02]: Persist complete L7EvidenceState to draft.retroRecords and draft.l7Evidence within workItemQueueManager.runInLane prior to ADO notification comment

### Pending Todos

Plan-phase validation items (from research flags — resolve during discuss/plan of the owning phase):

- [Phase 1]: Decide frontmatter codec approach (hand-rolled parse/serialize — zero new deps), archive/TTL policy location (e.g. `data/state/archive/`) + sweep cadence, and the win32 rm-then-rename crash-safe ordering; StateStore root via zod env (default `data/state/`).
- [Phase 3]: Validate ADO org permits bot tag-writes on `New`/`Ready to Dev` items; check tag collisions for `[awaiting-scope-lock]`/`[scope-locked]`; decide PM notification mechanism (comment vs @mention/System.AssignedTo).
- [Phase 5]: Security-review the wider prod egress allowance (PRODUCTION_SMOKE_URL); decide smoke-suite authorship (target repo vs orchestrator-owned — changes worktree need).
- [Phase 6]: Decide runbook destination (`.claude/skills/<name>/RUNBOOK.md` vs top-level `runbooks/`); confirm Step 9 needs no new human verdict token (skills-PR merge is the gate).
- [Backlog]: L2/L4 hardcoded evidence-index defaults — wire to `ado/policy.ts:verifyBranchPolicies` post-v2.0 (Open Decision #2, leave-and-log).
- [Backlog]: STORE-01 — swap `StateStore` file backend → Postgres when multi-instance is needed (the `ponytail:` ceiling).

### Blockers/Concerns

- None blocking. MEDIUM-confidence assumptions flagged for phase-level validation (see Pending Todos): ADO tag-write permissions (Phase 3), prod smoke egress under security posture (Phase 5).
- Design constraint (not a blocker): single-machine persistence ceiling is load-bearing for the file-backed `StateStore` — recorded as `ponytail:` with STORE-01 deferred.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Research | Windows container vs execa process isolation tradeoff | Resolve in Phase 3 planning (v2 numbering) | 2026-09-07 |
| Research | AST-based multi-file patching approach | Resolve in Phase 3 planning (v2 numbering) | 2026-09-07 |
| Infra | Local dev webhook tunnel (cloudflared/ngrok) vs polling fallback | Resolved in 01-01 via poller helper | 2026-09-07 |
| Persistence | Multi-instance shared store (Postgres swap behind StateStore interface) | Deferred — STORE-01, `ponytail:` ceiling | 2026-09-16 |

## Session Continuity

Last session: 2026-09-18T06:30:00.000Z
Stopped at: Completed Phase 5 Plan 03 (05-03-PLAN.md)
Resume: Phase 5 complete; proceed to Phase 6 (Retro & L7 Output)
