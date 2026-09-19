# Requirements: Agentic SDLC Workflow — Milestone v2.1 (Audit Remediation & Hardening)

**Defined:** 2026-09-19
**Core Value:** Deterministic, evidence-backed delivery — every recorded evidence item must come from a real run; every gate must be authorization-checked; no untrusted content reaches a model or shell un-isolated.
**Findings source:** `.planning/research/AUDIT-v2.1.md` (audit IDs in parentheses trace each requirement to file:line evidence).

## v2.1 Requirements

### WIP Resolution (commit-forward gate — must land first)

- [x] **WIP-01**: Provider 9router body-rewrite (`stream:false`, prefix strip) has unit tests and logs rewrite failures explicitly — no silent `catch {}` (L9, `src/ai/provider.ts`)
- [x] **WIP-02**: Evaluator/planner LLM fallbacks record `fallbackUsed: true` + actual model in persisted evidence; audit log stops hardcoding `model: 'gpt-4o'` (M7, L9)
- [x] **WIP-03**: Planner LLM-failure fallback parks the ticket for human review (`hasAmbiguities: true` → Plan-Q&A checkpoint) instead of auto-proceeding a boilerplate plan (M7, L9)
- [x] **WIP-04**: Opencode plan-skip path records "plan delegated to opencode" in L2 evidence so the governance deviation is auditable on the work item (L9)
- [x] **WIP-05**: Entire uncommitted diff (5 files + `src/cli/` decision per QAL-03) committed with tests; working tree clean at phase end

### Security Hardening

- [ ] **SEC-01**: Ticket content (title/description/AC) is XML-escaped and tag-isolated with a SECURITY BOUNDARY directive in the opencode execution prompt and the planner prompt, matching the auditor pattern (C1, H1; `src/execute/worker.ts:84-91`, `src/plan/planner.ts:49-57`)
- [ ] **SEC-02**: Agent command execution is allowlisted (`run_test` accepts only vetted test commands) and agent file reads are jailed to the worktree; orchestrator `.env` is unreachable from any agent subprocess (C1; `src/mcp/tools/common.ts:52-54` or its opencode-path successor)
- [ ] **SEC-03**: Scope-lock and acceptance verdict tokens require the commenter to be in a configured approver allowlist; non-allowlisted tokens are rejected, logged, and answered with an ADO comment (H2; `src/scope/verdict.ts:37-46`, `src/accept/verdict.ts:25-27`)
- [ ] **SEC-04**: Every ADO comment the system posts goes through a sanitizing formatter and carries the `<!-- [automated-agent] -->` loop-shield marker — including the 10 inline comments in execute/rework workers (H3; `src/execute/worker.ts:96,159,172,187,219`, `src/execute/rework-worker.ts:146,169,211,226,242,276`)
- [ ] **SEC-05**: Git push failure in production fails the ticket (Blocked + dedup `failed` + alert comment); error-swallow exists only under `NODE_ENV=test` (H4; `src/execute/worker.ts:267-271`, `src/execute/repair.ts:71-75`)
- [ ] **SEC-06**: Remaining injection/escape gaps closed: `learn/prompt.ts` content XML-escaped, PR description formatter sanitized, scope-gate feedback + actor displayName sanitized (M11; `src/learn/prompt.ts:25-43`, `src/ado/formatter.ts:68-74`, `src/scope/gate.ts:260,289`)

### Honest Agent Core (opencode-only per Key Decision)

- [x] **CORE-01**: Built-in coding path deleted; `LOCAL_AGENT_TYPE=opencode` required — config validation fails fast at boot with actionable error when unset or `OPENCODE_BIN` unresolvable (H5; `src/config/env.ts:16`, `src/execute/worker.ts:82-109`, `src/execute/rework-worker.ts:128-161`)
- [x] **CORE-02**: Repair loop performs real edit-and-retry via the opencode runner with failure context, or records honestly that no repair occurred — never re-runs identical tests ≤5× while implying repairs (H6; `src/execute/repair.ts:51-57`)
- [x] **CORE-03**: MCP subsystem resolved: registry tools wired into the opencode invocation or `src/mcp/` + MCP deps deleted; no runtime-dead subsystem remains (H7; `src/execute/worker.ts:392-469`)
- [ ] **CORE-04**: Zero fabricated evidence: router step-4 `{totalTests:1,passed:1}` default, evidence-index L2/L4/errorRate/p95 constants, and QA `commitSha='main'` replaced with real values (worktree `git rev-parse HEAD`) or fail-closed `MissingEvidenceError` blocking the transition (H8; `src/execute/router.ts:208-214`, `src/deploy/evidence-index.ts:169-193`, `src/qa/worker.ts:65`)

### Reliability

- [ ] **REL-01**: Tag patches never Replace with a partial set — ADO tag-fetch failure aborts or retries the operation; transient errors cannot wipe ticket tags (M1; `src/scope/gate.ts:131-137,249-257,276-283`)
- [ ] **REL-02**: All LLM calls carry an abortSignal timeout (`LLM_TIMEOUT_MS`); ADO REST calls and `customStreamFetch` carry request timeouts (M2; `src/auditor/evaluator.ts:155-162`, `src/plan/planner.ts:60-78`, `src/ai/provider.ts:27-31`)
- [ ] **REL-03**: Dedup markers with status `failed` get a bounded redelivery/retry path (watchdog sweep or re-accept on redelivery) — a crashed run never permanently strands a ticket (M3; `src/state/store.ts:346-359`, `src/ingress/routes.ts:136-140`)
- [ ] **REL-04**: Poller WIQL filters to non-terminal states with a changed-date window and `$top`, and fetches through `withRetry` — bounded API load per tick (M4; `src/ingress/poller.ts:8,34-48`)
- [ ] **REL-05**: Skill-PR publishing runs in an isolated worktree or under a repo-wide lock — no branch switching in the shared `process.cwd()` repo outside serialization (M5; `src/learn/publisher.ts:96-122`)
- [ ] **REL-06**: QA worktree attach failure fails closed (Blocked + `[qa-harness-error]`) — never falls back to running the suite in the orchestrator's own repo (M6; `src/qa/worker.ts:76-77`)
- [ ] **REL-07**: Fire-and-forget lane jobs have terminal `.catch` handlers and `src/index.ts` installs a `process.on('unhandledRejection')` hook (M8; `src/ingress/routes.ts:83-101,146-155`, `src/ingress/poller.ts:58-66`)
- [ ] **REL-08**: PR event dedup key uses full sha256 hex — no 32-bit truncation collisions (M9; `src/ingress/routes.ts:64-65`)
- [ ] **REL-09**: `executeRepairLoop` passes `knownSecrets` to test runs consistently with QA/smoke paths (M10; `src/execute/worker.ts:209-214`, `src/execute/rework-worker.ts:266-271`)
- [ ] **REL-10**: StateStore writes fsync the temp file before rename; TTL purge sweeps `.bak.*`/`.tmp.*` orphans in the tickets dir, not just dedup markers (M12; `src/state/store.ts:39-85,408-432`)
- [ ] **REL-11**: Silent-degradation catches (router prev-rev lookup, pr-router details fetch, QA rework dispatch, dedup status collision) record the degradation in ticket state or evidence instead of logging only (L4)

### Config Hygiene

- [ ] **CFG-01**: `ENABLE_ADO_POLLING` parses explicit string booleans (`'true'`/`'1'` enable; everything else disables) — `z.coerce.boolean()` trap removed (M13; `src/config/env.ts:35`)
- [ ] **CFG-02**: `ADO_PROJECT` and `ADO_REPOSITORY_ID` are required with no silent defaults — boot fails with actionable error when missing (M13; `src/config/env.ts:19-20`)
- [ ] **CFG-03**: `.env.example` regenerated from `EnvSchema`: every current var documented, v1 leftovers (`DATABASE_PATH`) removed (M15)
- [ ] **CFG-04**: Any `mock*` option passed while `NODE_ENV=production` throws immediately — test seams cannot fabricate production evidence (M14; `src/deploy/worker.ts:33-47` and sibling option types)

### Code Quality

- [ ] **QAL-01**: `buildTagPatch` extracted to a shared `src/ado/patch.ts`; zero circular imports remain (verified by import-graph check or test) (L1)
- [ ] **QAL-02**: Two-strike flake filter and failure-line parser shared between `qa/runner.ts` and `deploy/smoke.ts`; `smoke.ts` split into focused modules; step-4 business logic extracted from `router.ts` switch case (L2)
- [ ] **QAL-03**: Dead code purge: `src/cli/ado.ts` wired as a tested bin script with v2 vocabulary or deleted; dead exports removed (`createCoderTools` if CORE-01 moots it, `compileL1L6EvidenceIndex` + alias-dependent tests, `transitionToReadyToDev`, `getStepsByColumn`, `getStepsByAdoState`, `registerPullRequestHandler`); unused deps dropped (`pino`, `@fastify/sensible`); dead `done→step9` route resolved; `state/test-harness.ts` excluded from `dist` (L3)
- [ ] **QAL-04**: Redundant manual lane-context checks removed (runInLane is reentrant); idle lanes evicted after drain — `clearLane` wired or lanes Map bounded (L5)
- [ ] **QAL-05**: Ingress hardening batch: pr-router regex sanitizer → sanitize-html; `accept/urls.ts` raw env reads → zod env; bot-shield requires marker AND bot author id; diff-guard package allowlist sourced from the implementation plan, not raw AC text; pr-router validates `AB#<id>` against branch-name correlation (L6)
- [ ] **QAL-06**: Lint tooling added (zero-config preference, e.g. oxlint) with npm script; typecheck pass includes `tests/` (L7)

### E2E Proof

- [ ] **E2E-01**: Real-chain integration test exists: ticket event → opencode runner (scripted fixture binary acceptable) → real test execution → real branch + push → PR creation, driven through the router — no mock-echo assertions on the chain (L8)
- [ ] **E2E-02**: `e2e-v2-golden-path.test.ts` retains routing/verdict coverage but its mock-literal assertions (`passedCount===12` echo) are replaced with provenance-checked values or the file is explicitly scoped/documented as routing-only (L8)

## Future Requirements (deferred, tracked)

### Scale & Isolation

- **STORE-01**: Swap file-backed StateStore → Postgres behind the same interface for multi-instance deployment (`ponytail:` ceiling)
- **SBOX-01**: Container-isolated (Docker) agent execution with dropped capabilities + egress filtering — replaces worktree file-jail as the hard boundary
- **PERF-01**: `@fastify/rate-limit` on webhook route (HMAC currently sole gate; public via cloudflared tunnel)
- **QUAL-01**: Test coverage reporting + threshold in CI

## Out of Scope

| Feature | Reason |
|---------|--------|
| New pipeline features/columns/steps | v2.1 is remediation-only; model stays 5 cols / 9 steps / L1–L7 |
| Built-in (non-opencode) coding agent | User decision 2026-09-19: opencode-only; delete, don't implement |
| Container sandboxing | Deferred to SBOX-01; file jail + command allowlist is the v2.1 boundary |
| Postgres/multi-instance store | Deferred to STORE-01 (`ponytail:` ceiling unchanged) |
| Webhook rate limiting | Deferred to PERF-01; HMAC + dedup remain the gate |
| Rewriting passing sanitizers/formatters | Audit §Done-well is a protected invariant — fix gaps only |
| Jira/GitHub integrations, custom CI, deploy UI | Unchanged from v2.0 Out of Scope |

## Traceability

Every v2.1 requirement maps to exactly one phase (roadmap created 2026-09-19; v2.1 phases numbered 8–13, continuing v2.0).

| Requirement | Phase | Status |
|-------------|-------|--------|
| WIP-01 | Phase 8 | Complete |
| WIP-02 | Phase 8 | Complete |
| WIP-03 | Phase 8 | Complete |
| WIP-04 | Phase 8 | Complete |
| WIP-05 | Phase 8 | Complete |
| SEC-01 | Phase 9 | Pending |
| SEC-02 | Phase 9 | Pending |
| SEC-03 | Phase 10 | Pending |
| SEC-04 | Phase 10 | Pending |
| SEC-05 | Phase 10 | Pending |
| SEC-06 | Phase 10 | Pending |
| CORE-01 | Phase 9 | Complete |
| CORE-02 | Phase 9 | Complete |
| CORE-03 | Phase 9 | Complete |
| CORE-04 | Phase 10 | Pending |
| REL-01 | Phase 11 | Pending |
| REL-02 | Phase 11 | Pending |
| REL-03 | Phase 11 | Pending |
| REL-04 | Phase 11 | Pending |
| REL-05 | Phase 11 | Pending |
| REL-06 | Phase 11 | Pending |
| REL-07 | Phase 11 | Pending |
| REL-08 | Phase 11 | Pending |
| REL-09 | Phase 10 | Pending |
| REL-10 | Phase 11 | Pending |
| REL-11 | Phase 11 | Pending |
| CFG-01 | Phase 12 | Pending |
| CFG-02 | Phase 12 | Pending |
| CFG-03 | Phase 12 | Pending |
| CFG-04 | Phase 12 | Pending |
| QAL-01 | Phase 12 | Pending |
| QAL-02 | Phase 12 | Pending |
| QAL-03 | Phase 12 | Pending |
| QAL-04 | Phase 12 | Pending |
| QAL-05 | Phase 12 | Pending |
| QAL-06 | Phase 12 | Pending |
| E2E-01 | Phase 13 | Pending |
| E2E-02 | Phase 13 | Pending |

**Coverage:**
- v2.1 requirements: 38 total (count corrected at roadmap creation — earlier "32" was stale; actual REQ-ID enumeration: WIP 5 + SEC 6 + CORE 4 + REL 11 + CFG 4 + QAL 6 + E2E 2 = 38)
- Mapped to phases: 38 ✓
- Unmapped: 0 ✓

**Phase distribution:** Phase 8 (5) · Phase 9 (5) · Phase 10 (6) · Phase 11 (10) · Phase 12 (10) · Phase 13 (2)

---
*Requirements defined: 2026-09-19 from full-project audit (`.planning/research/AUDIT-v2.1.md`)*
*Last updated: 2026-09-19 — traceability populated at v2.1 roadmap creation (38/38 mapped to Phases 8–13)*
