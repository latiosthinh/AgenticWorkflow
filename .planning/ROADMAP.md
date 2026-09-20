# Roadmap: Agentic SDLC Workflow

## Milestones

- **v1.0 — Golden Path Baseline** — 8 phases, 23 plans, 31 requirements (shipped 2026-09-09, tag `v1.0`). Archived: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md).
- **v2.0 — Golden Path v2** — 7 phases, 19 plans, 19 requirements (shipped 2026-09-18, tag `v2.0`). 5 columns / 9 steps / L1–L7 evidence on file-backed `StateStore`. Archived: [milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md).
- **v2.1 — Audit Remediation & Hardening** — Phases 8–13 (current). Findings source: [research/AUDIT-v2.1.md](research/AUDIT-v2.1.md). Phase numbering continues from v2.0 (ended at Phase 7).

## v2.1 Overview

Remediation-only milestone — no new features, pipeline model unchanged (5 columns / 9 steps / L1–L7). Closes every finding of the 2026-09-19 full audit: the CRITICAL injection-to-secret-theft chain, the hollow agent core (opencode-only per user decision), reliability gaps, config traps, quality debt, and the E2E proof deficit. Binding user decisions (2026-09-19): **opencode-only agent core** (delete the built-in no-op path, fail-fast config), **commit-forward WIP** (first phase completes the dirty working tree with tests + gate-safe fallbacks, then commits), **zero fabricated evidence** (real runs or fail-closed `MissingEvidenceError`), and **no regression to the AUDIT-v2.1.md §Done-well protected invariants** (HMAC, `wx`-dedup, lane single-writer, sanitizing formatters, crash-atomic writes, fail-closed telemetry, circuit breakers, `withRetry`).

**Sequencing rationale (binding):**

1. **Phase 8 first** — dirty working tree (5 modified files + untracked `src/cli/`) blocks all other work; commit-forward decision.
2. **CRITICAL chain lands in Phase 9** — as early as dependencies allow. SEC-01/SEC-02 are bundled with CORE-01/CORE-02/CORE-03 because they rewrite the same file cluster (`src/execute/worker.ts`, `repair.ts`, `rework-worker.ts`, `src/mcp/`, `src/config/env.ts`) and SEC-02's allowlist target is "`src/mcp/tools/common.ts:52-54` **or its opencode-path successor**" — the location does not exist until CORE-01/CORE-03 resolve the built-in-path deletion and the MCP wire-or-delete question. Splitting them across phases guarantees conflicting edits.
3. **Phase-level chain is serial** because hub files are touched by multiple categories (`worker.ts`: CORE/SEC/REL; `config/env.ts`: CORE/SEC/REL/CFG; `router.ts`: CORE/REL/QAL; `qa/worker.ts`: CORE/REL; `scope/gate.ts`: SEC/REL/QAL; `pr-router.ts`: REL/QAL). File-level overlap noted in each **Depends on**.
4. **Plan-level parallelism** (`parallelization: true`) where file sets are disjoint — e.g. inside Phase 12, CFG items ∥ QAL structural refactors (env.ts edits before `.env.example` regeneration; `package.json` edits serialized).
5. **Phase 13 last** — E2E proof validates the fully hardened chain (opencode-only runner, honest evidence, bounded reliability) and must drive post-refactor router code.
6. **Every code-touching phase carries a no-regression criterion** against the existing 462-test suite and the §Done-well invariants.

## Phases

**Phase Numbering:**
- Integer phases (8, 9, …13): planned v2.1 milestone work, continuing v2.0 numbering
- Decimal phases (e.g. 9.1): urgent insertions via `/gsd-insert-phase` (none planned)

- [x] **Phase 8: WIP Resolution** - Complete the uncommitted diff (provider 9router rewrite, LLM fallbacks, opencode plan-skip) with tests + gate-safe fallbacks; commit; working tree clean (completed 2026-09-19)
- [ ] **Phase 9: Opencode-Only Honest Core** - Delete the built-in no-op coding path, require opencode (fail-fast), close the CRITICAL injection-to-secret-theft chain, resolve MCP, make repair real-or-honest
- [x] **Phase 10: Security & Evidence Hardening** - Actor-authorized verdicts, sanitized + loop-shielded comments everywhere, push-failure honesty, remaining escape gaps, zero fabricated evidence (completed 2026-09-19)
- [ ] **Phase 11: Reliability Hardening** - Tag-wipe guard, LLM/ADO timeouts, failed-dedup retry, bounded poller, publisher isolation, QA fail-closed, rejection handling, fsync + orphan sweep, degradation flags
- [ ] **Phase 12: Config Hygiene & Quality Debt** - Boolean/required-env traps fixed, `.env.example` regenerated, prod mock guards, circular-dep extract, god-file splits, dead code purge, lane cleanup, ingress hardening, lint + tests typecheck
- [ ] **Phase 13: E2E Proof** - Real-chain integration test through the router (opencode fixture → real tests → real branch/push → PR); mock-echo assertions removed

## Phase Details

### Phase 8: WIP Resolution
**Goal**: The dirty working tree (provider 9router body-rewrite, evaluator/planner LLM fallbacks, opencode plan-skip) is completed under phase discipline — tested, governance-safe (fallbacks recorded in evidence; planner fallback parks for human instead of bypassing the Plan-Q&A gate), and committed — so every later phase builds on a clean tree
**Depends on**: Nothing (first phase of v2.1 — commit-forward decision; dirty tree blocks all other work)
**Requirements**: WIP-01, WIP-02, WIP-03, WIP-04, WIP-05
**Success Criteria** (what must be TRUE):
  1. Unit tests cover the 9router provider body-rewrite (`stream:false`, prefix strip) including its failure branch — rewrite failures are logged explicitly, with no silent `catch {}` in `src/ai/provider.ts`
  2. When an evaluator/planner LLM fallback fires, persisted evidence records `fallbackUsed: true` plus the actual model used, and no audit-log entry hardcodes `model: 'gpt-4o'`
  3. A planner LLM failure parks the ticket at the Plan-Q&A checkpoint (`hasAmbiguities: true`) for human review — no boilerplate plan auto-proceeds through the gate
  4. The opencode plan-skip path writes a "plan delegated to opencode" record into L2 evidence, visible on the work item as an auditable governance deviation
  5. `git status` is clean at phase end (all 5 modified files committed; `src/cli/` resolved by an explicit wire-or-delete decision recorded for QAL-03) and the full suite — the existing 462 tests plus new WIP tests — passes green with no §Done-well regression
**Plans**: 2 plans (serial — 08-02 consumes the AuditOutcome/PlannerOutcome types 08-01 produces)
- [x] 08-01-PLAN.md — Fallback mechanics: rewriteRouterBody extraction + failure logging (WIP-01), planner park-on-LLM-failure (WIP-03), evaluator/planner fallbackUsed+model returns (WIP-02 producer half)
- [x] 08-02-PLAN.md — Evidence persistence: L1/L2 fallback records + hardcoded-model removal (WIP-02), opencode plan-skip governance record (WIP-04), cli-as-is commit + clean tree + full-suite gate (WIP-05)

### Phase 9: Opencode-Only Honest Core
**Goal**: The agent core codes for real or not at all — built-in no-op path deleted, `LOCAL_AGENT_TYPE=opencode` required with fail-fast boot validation, MCP subsystem wired-or-deleted, repair loop real-or-honest — and the CRITICAL injection-to-secret-theft chain (C1) is closed: ticket content XML-isolated in opencode/planner prompts, agent commands allowlisted, agent file reads jailed to the worktree, orchestrator `.env` unreachable
**Depends on**: Phase 8 — file overlap: `src/execute/worker.ts` (plan-skip edit lands in 8, built-in-path deletion here), `src/plan/planner.ts` (fallback in 8, prompt isolation here), `src/ai/provider.ts` territory. Phase 8's commit must exist before this rewrite starts
**Requirements**: SEC-01, SEC-02, CORE-01, CORE-02, CORE-03
**Success Criteria** (what must be TRUE):
  1. Boot fails fast with an actionable config error when `LOCAL_AGENT_TYPE` is unset or not `opencode`, or `OPENCODE_BIN` is unresolvable — and no built-in coding path exists in `src/execute/` (no route can record L3/Dev Done with zero edits)
  2. A hostile-fixture prompt test proves ticket title/description/AC arrive XML-escaped and tag-isolated with a SECURITY BOUNDARY directive in both the opencode execution prompt and the planner prompt (auditor `escapeXml` + `<user_ticket_input>` pattern)
  3. A subprocess test proves agent command execution accepts only allowlisted test commands and agent file reads outside the worktree — including the orchestrator `.env` — are denied (path containment + opencode cwd jail)
  4. Every repair cycle either performs a real edit-and-retry through the opencode runner with failure context, or the evidence honestly records that no repair occurred — no path re-runs identical tests ≤5× while implying repairs
  5. No runtime-dead MCP subsystem remains (registry tools wired into the opencode invocation, or `src/mcp/` + MCP deps deleted) and the full suite is green — tests of the deleted built-in path removed alongside it, §Done-well invariants (HMAC, `wx`-dedup, lane single-writer, sanitizing formatters, crash-atomic writes) untouched
**Plans**: 3 plans
Plans:
- [x] 09-01-PLAN.md — Delete built-in path + MCP subsystem; require opencode at boot (CORE-01, CORE-03)
- [ ] 09-02-PLAN.md — XML-isolate ticket content in prompts + command allowlist (SEC-01, SEC-02)
- [x] 09-03-PLAN.md — Rewrite repair loop with real opencode re-invocation (CORE-02)

### Phase 10: Security & Evidence Hardening
**Goal**: All remaining security findings closed — verdict tokens actor-authorized, all 10 inline ADO comments sanitized + loop-shielded, push failures honest, remaining XML-escape/sanitize gaps sealed — and zero fabricated evidence anywhere: router step-4 defaults, evidence-index L2/L4/errorRate/p95 constants, and QA `commitSha='main'` replaced with real values or fail-closed `MissingEvidenceError`
**Depends on**: Phase 9 — file overlap: `src/execute/worker.ts` + `rework-worker.ts` (SEC-04 comment sites shift/vanish with the built-in-path deletion — fix survivors only), `src/execute/repair.ts` (SEC-05 + REL-09 after CORE-02's real-or-honest rewrite). SEC-02's allowlist outcome in Phase 9 defines the run-test path REL-09 scrubs
**Requirements**: SEC-03, SEC-04, SEC-05, SEC-06, CORE-04, REL-09
**Success Criteria** (what must be TRUE):
  1. Verdict tokens (`[approve-scope]`, `[approve-acceptance]`, reject/reset variants) from commenters outside the configured approver allowlist are rejected, logged, and answered with an ADO comment — allowlisted approver verdicts process exactly as before
  2. A comment-inventory test proves every ADO comment the system posts — including all inline comments in execute/rework workers — passes the sanitizing formatter and carries the `<!-- [automated-agent] -->` loop-shield marker (zero raw posts remain)
  3. A production git push failure results in Blocked + dedup `failed` + alert comment; the error-swallow path executes only under `NODE_ENV=test` (env-gating proven by test)
  4. Containment tests prove `learn/prompt.ts` content is XML-escaped (a `</learning_source_context>` payload cannot escape), the PR description formatter is sanitized, and scope-gate feedback + actor displayName are sanitized
  5. No code path can emit fabricated evidence — router `{totalTests:1,passed:1}`, evidence-index L2/L4/errorRate/p95 constants, `commitSha='main'` — replaced by real values (worktree `git rev-parse HEAD`) or fail-closed `MissingEvidenceError` blocking the transition; `executeRepairLoop` passes `knownSecrets` consistently with QA/smoke; full suite green with no §Done-well regression
**Plans**: 3 plans
Plans:
- [x] 10-01-PLAN.md — Approver allowlist for verdict tokens (SEC-03) + XML escaping & HTML sanitization (SEC-06)
- [x] 10-02-PLAN.md — 100% comment sanitization & loop-shielding in workers (SEC-04) + production push failure honesty (SEC-05)
- [x] 10-03-PLAN.md — Zero fabricated evidence in router, QA, evidence index (CORE-04) + knownSecrets in repair loop (REL-09)

### Phase 11: Reliability Hardening
**Goal**: Transient failures and hazards can no longer corrupt tickets, hang the orchestrator, strand work, or fabricate attribution — tag-wipe guard, LLM/ADO timeouts, failed-dedup retry, bounded poller load, publisher isolation, QA fail-closed, rejection handling, sha256 dedup keys, win32 fsync + orphan sweep, and silent degradations made visible in state/evidence
**Depends on**: Phase 10 — file overlap: `src/qa/worker.ts` (CORE-04 edits `:65` commitSha; REL-06 edits `:76-77` attach fallback; REL-11 edits `:206-208` rework-dispatch catch), `src/execute/router.ts` (CORE-04 edits step-4 fabrication; REL-11 edits `:78-80` prev-rev catch), `src/scope/gate.ts` (SEC-06 edits `:260,289` sanitization; REL-01 edits tag-patch paths `:131-137,249-257,276-283`), `src/config/env.ts` (SEC-03 adds `APPROVER_IDS`; REL-02 adds `LLM_TIMEOUT_MS`), `src/state/store.ts` (untouched since Phase 8)
**Requirements**: REL-01, REL-02, REL-03, REL-04, REL-05, REL-06, REL-07, REL-08, REL-10, REL-11
**Success Criteria** (what must be TRUE):
  1. A fault-injection test proves an ADO tag-fetch failure aborts or retries the operation — no Replace patch can ever wipe ticket tags with a partial set
  2. A hung-call test proves every LLM call aborts within `LLM_TIMEOUT_MS` (abortSignal) and ADO REST / `customStreamFetch` requests time out — no unbounded waits remain
  3. A crashed run never loses a ticket: `failed` dedup markers get a bounded redelivery/retry path, PR-event dedup keys use full sha256 hex (no 32-bit collisions), every fire-and-forget lane job has a terminal `.catch`, and `src/index.ts` installs a `process.on('unhandledRejection')` hook
  4. Each poller tick issues bounded WIQL — non-terminal state filter + changed-date window + `$top` — and fetches through `withRetry` (API-load bound verified by test)
  5. Hazard paths fail closed and degradation is visible: skill-PR publishing runs in an isolated worktree or under a repo-wide lock (no branch switching in shared `process.cwd()`); QA worktree attach failure → Blocked + `[qa-harness-error]` (never cwd fallback); StateStore fsyncs the temp file before rename and TTL purge sweeps tickets-dir `.bak.*`/`.tmp.*` orphans; every silent-degradation catch (router prev-rev, pr-router details, QA rework dispatch, dedup status collision) records a flag in ticket state/evidence. Full suite green — crash-atomic writes, `wx`-dedup, lane single-writer invariants intact
**Plans**: TBD

### Phase 12: Config Hygiene & Quality Debt
**Goal**: Config can no longer silently misroute or fabricate — boolean trap removed, `ADO_PROJECT`/`ADO_REPOSITORY_ID` required, `.env.example` regenerated from `EnvSchema`, prod mock seams throw — and structural debt paid: circular deps extracted, two-strike/parser duplication shared, smoke.ts split, dead code/deps purged, lane boilerplate cleaned, ingress hardened, lint + tests in typecheck
**Depends on**: Phase 11 — file overlap: `src/config/env.ts` (REL-02 adds `LLM_TIMEOUT_MS` before CFG-01/02 reshape the schema and CFG-03 regenerates `.env.example` from the final shape), `src/execute/router.ts` (REL-11 degradation flags before QAL-02 extracts step-4 logic and QAL-03 resolves the dead `done→step9` route), `src/execute/pr-router.ts` (REL-11 catch-record before QAL-05 sanitizer/correlation rewrites), `src/ingress/routes.ts` + `src/index.ts` (REL-03/07/08 handlers before QAL-03 removes `registerPullRequestHandler` and unregisters `@fastify/sensible`), `src/deploy/evidence-index.ts` (CORE-04 before QAL-03 drops the `compileL1L6EvidenceIndex` alias). QAL-03's `createCoderTools` removal depends on Phase 9's CORE-01 outcome
**Requirements**: CFG-01, CFG-02, CFG-03, CFG-04, QAL-01, QAL-02, QAL-03, QAL-04, QAL-05, QAL-06
**Success Criteria** (what must be TRUE):
  1. `ENABLE_ADO_POLLING='false'` (any value other than `'true'`/`'1'`) disables polling — the `z.coerce.boolean()` trap is gone — and a boot without `ADO_PROJECT`/`ADO_REPOSITORY_ID` fails with an actionable error, no silent `'default-project'`/`'default-repo'` misrouting
  2. `.env.example` is regenerated from `EnvSchema` (every current var documented; v1 leftovers like `DATABASE_PATH` removed) and passing any `mock*` option while `NODE_ENV=production` throws immediately — test seams cannot fabricate production evidence
  3. An import-graph check proves zero circular imports with `buildTagPatch` extracted to shared `src/ado/patch.ts`; the two-strike flake filter and failure-line parser exist as one shared module consumed by both `qa/runner.ts` and the split smoke modules; `smoke.ts` is split into focused modules; step-4 business logic lives outside the `router.ts` switch
  4. Dead-code purge verified: `src/cli/ado.ts` wired as a tested bin script (v2 vocabulary) or deleted; dead exports (`createCoderTools`, `compileL1L6EvidenceIndex` + alias-dependent tests, `transitionToReadyToDev`, `getStepsByColumn`, `getStepsByAdoState`, `registerPullRequestHandler`) removed; `pino` + `@fastify/sensible` uninstalled; dead `done→step9` route resolved; `state/test-harness.ts` excluded from `dist`; redundant manual lane-context checks removed and idle lanes evicted after drain (bounded lanes Map)
  5. Ingress hardening landed (pr-router regex sanitizer → sanitize-html; `accept/urls.ts` raw env reads → zod env; bot-shield requires marker AND bot author id; diff-guard package allowlist sourced from the implementation plan, not raw AC text; pr-router validates `AB#<id>` against branch-name correlation), a lint npm script runs clean, typecheck covers `tests/`, and the full suite is green with no §Done-well regression
**Plans**: TBD

### Phase 13: E2E Proof
**Goal**: The hardened chain is proven end-to-end by a real integration test — ticket event → opencode runner (scripted fixture binary) → real test execution → real branch + push → PR creation, driven through the router — with all mock-echo assertions removed or explicitly scoped
**Depends on**: Phase 12 — the E2E drives post-refactor code: QAL-02's extracted router step-4 logic and split smoke modules, Phase 9's opencode-only runner, Phase 10's honest evidence (the test asserts provenance-checked values, not mock literals), Phase 11's fail-closed paths
**Requirements**: E2E-01, E2E-02
**Success Criteria** (what must be TRUE):
  1. A real-chain integration test passes: ticket event → opencode runner (scripted fixture binary acceptable) → real test execution → real branch + push → PR creation, driven through the router — with zero mock-echo assertions on the chain
  2. `e2e-v2-golden-path.test.ts` retains its routing/verdict coverage, and its mock-literal assertions (`passedCount===12` echo) are replaced with provenance-checked values or the file is explicitly scoped/documented as routing-only
  3. The full suite passes green end-to-end, the `state-matrix-sync` drift guard passes against the Authoritative ADO State Matrix in this roadmap, and §Done-well invariants are verified intact across the hardened chain
**Plans**: TBD

## Authoritative ADO State Matrix (Golden Path v2 — 5 columns / 9 steps / L1–L7)

The 9 v2 steps map ONTO existing ADO states (states are the wire contract — nothing renamed):

| Column | Step | Actor | ADO State | Key Tags | Evidence | Gate / Hand-off |
|---|---|---|---|---|---|---|
| 1. REFINEMENT | 1. Ticket & AC verify | ⚡ AI | `New` | pass: +`[audit-passed]` +`[awaiting-scope-lock]` | **L1** | L1 audit record + pending scope-lock section in the ticket's `StateStore` file + scope-review packet posted; NO auto-transition |
| 1. REFINEMENT | 2. Scope review & verify | 👤 PM | `New` (parked) → approve: `Ready to Dev` | −`[awaiting-scope-lock]` +`[scope-locked]`; reject: stays parked | **L1** (scope-lock record) | **Human verdict gate** — state/tag transition (primary, shield-safe) + `[approve-scope]`/`[reject-scope]`/`[reset-scope]` comment tokens (secondary); `StateStore` scope-lock status is authoritative over the tag; watchdog 24h remind / 72h escalate; poller reconcile |
| 2. EXECUTION | 3. Loop: Plan-Code-Test | ⚡ AI | `In Dev` | `[awaiting-input]` during plan Q&A | **L2, L3** | Guard: `isScopeLocked()` (reads `StateStore`) checked in router BEFORE worktree provisioning; bounded loop (<250 LOC, self-repair ≤5) |
| 2. EXECUTION | 4. Dev validate & PR | 👤 Dev | `Dev Done` | `[awaiting-acceptance]` → `[acceptance-approved]` | **L2, L3** | **Human verdict gate** — accept/reject; reject → `In Dev` via shared breaker ≤2 |
| 3. ACCEPTANCE | 5. PR review & CI deploy | 👤 TechLead/SA | `Dev Done` → merge → `Ready for QA` | `[pr-merged]` | **L3, L4** | Native branch policies (L2/L3/L4) + human PR approval; review-reject shares breaker ≤2 |
| 3. ACCEPTANCE | 6. QA staging verify | 👤 QA | `Ready for QA` → pass: `Ready to Deploy` | `[qa-verified]` / `[qa-failed]` | **L3, L5** | QA breaker ≤2 + 2-strike flake filter; fail → `In Dev` |
| 4. RELEASE | 7. Release approval + deploy | 👤 QA/SA/Lead/PM | `Ready to Deploy` | `[deploying]` | **L5** | **Human verdict gate** — native ADO Environment approval (mandatory, unattended deploy forbidden) |
| 4. RELEASE | 8. Smoke test & monitor | ⚡ Automation | `Ready to Deploy` (post-deploy) | APP fail (2-strike): `[deploy-regressed]` → `In Dev`; harness fail: `[smoke-harness-error]` | **L6** | Smoke BEFORE telemetry window (fail-fast); L6 = smoke PASS AND telemetry PASS (runs persisted to the ticket's `StateStore` smoke section); INFRA-vs-APP classification; no auto-rollback |
| 5. RETRO | 9. Retro takeaways, docs, skill enhancement | ⚡ AI & Team | pre-`Done` (awaited, fail-closed) → `Done` | `[golden-path-complete]`; fail: `[retro-failed]` | **L7** | **Fail-closed** — no real persisted L7 record in the ticket's `StateStore` file → no `Done`; single skills PR (`SKILL.md` + `RUNBOOK.md`), human merge async (does NOT gate Done) |

## Progress

**Execution Order:**
Phases execute in numeric order: 8 → 9 → 10 → 11 → 12 → 13 (serial at phase level — hub files `worker.ts`, `env.ts`, `router.ts`, `store.ts`, `qa/worker.ts` are touched across categories; plan-level waves inside phases where file sets are disjoint).

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 8. WIP Resolution | v2.1 | 2/2 | Complete   | 2026-09-19 |
| 9. Opencode-Only Honest Core | v2.1 | 0/3 | Not started | - |
| 10. Security & Evidence Hardening | v2.1 | 3/3 | Complete   | 2026-09-19 |
| 11. Reliability Hardening | v2.1 | 0/TBD | Not started | - |
| 12. Config Hygiene & Quality Debt | v2.1 | 0/TBD | Not started | - |
| 13. E2E Proof | v2.1 | 0/TBD | Not started | - |
