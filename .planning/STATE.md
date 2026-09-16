---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Golden Path v2
status: planning
stopped_at: Milestone v2.0 started — defining requirements
last_updated: "2026-09-16T00:00:00.000Z"
last_activity: 2026-09-16
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-09-16 — milestone v2.0)

**Core value:** Deterministic, evidence-backed delivery across the Golden Path v2 model (Refinement → Execution → Acceptance → Release → Retro; 9 steps) with **L1–L7** evidence, native ADO gates, and human verdicts.
**Current focus:** Milestone v2.0 — full restructure to the v2 model (5 columns / 9 steps / L1–L7).

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-09-16 — Milestone v2.0 started

Progress: [          ] 0% (defining requirements)

## Performance Metrics

**Velocity:**

- Total plans completed: 32
- Average duration: 5.3 min
- Total execution time: 1.91 hours

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

**Recent Trend:**

- Last 5 plans: 04-03 (6m), 05-01 (5m), 05-02 (4m), 05-03 (6m)
- Trend: Stable

*Updated after each plan completion*

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

### Pending Todos

None yet.

### Blockers/Concerns

- None. Milestone v2.0 kickoff — requirements definition in progress.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Research | Windows container vs execa process isolation tradeoff | Resolve in Phase 2 planning | 2026-09-07 |
| Research | AST-based multi-file patching approach | Resolve in Phase 3 planning | 2026-09-07 |
| Infra | Local dev webhook tunnel (cloudflared/ngrok) vs polling fallback | Resolved in 01-01 via poller helper | 2026-09-07 |

## Session Continuity

Last session: 2026-09-16
Stopped at: Milestone v2.0 (Golden Path v2) started — PROJECT.md + STATE.md updated
Resume file: Defining v2.0 requirements → roadmap (full restructure to 5 columns / 9 steps / L1–L7)

(End of file - total 170 lines)
