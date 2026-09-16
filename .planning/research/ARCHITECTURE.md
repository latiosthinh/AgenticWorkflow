# Architecture Research — Milestone v2.0 (Golden Path v2 Integration)

**Domain:** Agentic SDLC orchestration on Azure DevOps — **restructure of a shipped v1.0 codebase**, not greenfield
**Researched:** 2026-09-16
**Confidence:** HIGH (all integration points read directly from `src/`; migration mechanism verified in `src/db/index.ts`)

> **Framing:** v2.0 is an **extension**, not a rewrite. Every one of the five target capabilities lands on an existing, proven pattern already in the repo. The only genuinely new subsystems are the PM scope gate (Step 2), the prod smoke runner (Step 8), and the retro/runbook emitter (Step 9) — and each is a near-clone of an existing module (`accept/`, `qa/runner.ts`, `learn/`).

---

## (a) Mapping: v1.0 stage-directories → v2 columns / 9 steps

### The 8 v1.0 stages as they exist in source

v1.0's "8 stages" (CONTRACT, EXECUTE, CHECK, ACCEPT, MERGE, QA, DEPLOY, LEARN) are **not** 8 top-level directories. They are 8 responsibilities spread across 16 directories, some of which are cross-cutting infrastructure. This distinction drives the whole mapping.

| v1.0 stage | Source dir(s) that implement it | Cross-cutting dirs it depends on |
|---|---|---|
| CONTRACT | `src/auditor/` (worker, evaluator, prompt, schema) | `ingress/`, `ado/`, `db/` |
| EXECUTE | `src/plan/` (planner, checkpoint, watchdog, schema, formatter) + `src/execute/` (worker, router, coder, rework-worker, repair, diff-guard) | `mcp/`, `sandbox/`, `queue/` |
| CHECK | `src/test-runner/` (executor, parser, evidence, immutability) | `sandbox/` |
| ACCEPT | `src/accept/` (verdict, packet, envelope, breaker, urls) | `ado/`, `db/` |
| MERGE | `src/ingress/pr-router.ts` + `src/ado/git.ts` + `src/ado/policy.ts` + PR creation inlined in `src/execute/router.ts:155-173` | `ado/`, `accept/breaker.ts` |
| QA | `src/qa/` (worker, runner, breaker, fingerprint, formatter) | `sandbox/`, `test-runner/parser.ts`, `execute/rework-worker.ts` |
| DEPLOY | `src/deploy/` (worker, packet, telemetry, evidence-index, types) | `ado/`, `db/`, `learn/` |
| LEARN | `src/learn/` (worker, harvester, generator, publisher, prompt, types) | `ado/git.ts`, `db/` |

Pure infrastructure, no stage ownership: `src/index.ts`, `src/ingress/{routes,hmac,bot-shield,poller}.ts`, `src/ado/{client,work-item,threads,formatter}.ts`, `src/db/`, `src/queue/`, `src/mcp/`, `src/sandbox/`, `src/config/`, `src/utils/`.

### Target mapping to 5 columns / 9 steps

| v2 column | Step | Actor | Source that becomes this step | Disposition |
|---|---|---|---|---|
| **1. REFINEMENT** | 1. Ticket & AC verify | ⚡ AI | `src/auditor/` | **MODIFIED** — stays as `auditor/`; loses its auto-transition (`worker.ts:60-64`) |
| | 2. Scope review & verify | 👤 Human PM | *(does not exist)* | **NEW** — `src/scope/` |
| **2. EXECUTION** | 3. Loop: Plan-Code-Test | ⚡ AI | `src/plan/` + `src/execute/` + `src/test-runner/` + `src/sandbox/` + `src/mcp/` | **REGROUPED (logically only)** — CHECK folds *into* Step 3's loop. v1.0 modelled CHECK as a peer stage; v2 models it as the "Test" leg of one loop. No file moves required; only the taxonomy module and docs change. |
| | 4. Dev validate & PR | 👤 Human Dev | `src/accept/` + PR creation currently inlined in `src/execute/router.ts:129-183` | **MODIFIED** — `accept/` stays; recommend extracting the inline PR block into `src/accept/pr.ts` so Step 4 has a named home |
| **3. ACCEPTANCE** | 5. PR review & CI deploy | 👤 Human TechLead/SA | `src/ingress/pr-router.ts` + `src/ado/policy.ts` | **UNCHANGED** — already reads native branch-policy status for L2/L3/L4 |
| | 6. QA staging verify | 👤 Human QA | `src/qa/` | **UNCHANGED** |
| **4. RELEASE** | 7. Release approval + deploy | 👤 Human QA/SA/Lead/PM | `src/deploy/packet.ts` + `processDeploymentPreparation` (`src/deploy/worker.ts:37-83`) | **UNCHANGED** — native ADO Environment approval already owns L5 |
| | 8. Smoke test & monitor | ⚡ AI / Automation | `src/deploy/telemetry.ts` (monitor) + *(smoke does not exist)* | **MODIFIED + NEW** — `deploy/telemetry.ts` stays; add `src/deploy/smoke.ts`; rewire `processTelemetryEvaluation` |
| **5. RETRO** | 9. Retro takeaways, docs, skills | ⚡ AI Agent & Team | `src/learn/` | **MODIFIED + NEW** — `learn/` stays; add `learn/retro.ts` + `learn/runbook.ts`; extend `harvester.ts`, `generator.ts`, `worker.ts` |

### Explicit rename/regroup verdict

**Recommendation: do NOT rename the eight stage directories.** Rationale:

1. `auditor/`, `accept/`, `qa/`, `deploy/`, `learn/` are already single-responsibility and map 1:1 onto v2 steps. Renaming them (`auditor/` → `refine/`, `accept/` → `execution/`) touches every import in `src/` **and** all 32 test files in `tests/` for zero behavioural gain.
2. v2 "RESTRUCTURE" is a **model** restructure — state matrix, evidence index, actor assignment, governance hand-offs, docs. Those live in `.planning/ROADMAP.md`, `src/deploy/evidence-index.ts`, and a new taxonomy module. They do not require filesystem churn.
3. `plan/` + `execute/` + `test-runner/` collapsing into one "EXECUTION Step 3" directory would create a 15-file mega-directory and break the existing clean split between *reasoning* (plan), *mutation* (execute), and *verification* (test-runner).

**What actually changes on disk:** three new files/dirs (`src/scope/`, `src/deploy/smoke.ts`, `src/learn/retro.ts` + `src/learn/runbook.ts`), one new shared module (`src/pipeline/taxonomy.ts`), and edits inside existing files. That is the whole footprint.

---

## (b) NEW components

### B1. `src/pipeline/taxonomy.ts` — single source of truth for the v2 model

The v2 model (5 columns / 9 steps / actors / evidence levels) currently exists only in `.idea/v2.md` and `.planning/ROADMAP.md` prose. `src/execute/router.ts:122-219` hardcodes state strings in an if/else chain, and `src/deploy/evidence-index.ts` hardcodes "eight stages" / "six levels" in HTML copy. Both drift.

```typescript
// src/pipeline/taxonomy.ts
export type Column = 'REFINEMENT' | 'EXECUTION' | 'ACCEPTANCE' | 'RELEASE' | 'RETRO';
export type Actor = 'ai' | 'human_pm' | 'human_dev' | 'human_techlead' | 'human_qa' | 'human_release_board' | 'ai_and_team';
export type EvidenceLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7';

export interface StepDef {
  step: number;              // 1..9
  column: Column;
  actor: Actor;
  evidence: EvidenceLevel[];
  adoState: string;          // ADO board state this step lives on
  entryTags?: string[];      // tags that mark "this step is awaiting a human"
  exitTags?: string[];       // tags that mark "this step completed"
}

export const GOLDEN_PATH_V2: readonly StepDef[] = [ /* 9 entries */ ] as const;

export function stepForState(state: string, tags?: string): StepDef | undefined;
export function columnsForLevel(level: EvidenceLevel): Column[];
```

Consumers: `execute/router.ts` (replace inline state strings), `deploy/evidence-index.ts` (generate the HTML table rows from the array instead of 6 hardcoded `<tr>` blocks), and tests (assert the matrix matches `.planning/ROADMAP.md`).

### B2. `src/scope/` — PM scope-lock gate (Step 2)

Mirror `src/accept/` exactly. Four files:

| File | Responsibility | Clone of |
|---|---|---|
| `src/scope/verdict.ts` | Detect `[approve-scope]` / `[reject-scope]` / `[reset-scope]` tokens + `Ready to Dev`+`[awaiting-scope-lock]` state transitions | `src/accept/verdict.ts` (52 lines, string-token classifier) |
| `src/scope/packet.ts` | Build the scope-boundary checklist + testability sign-off HTML comment (L1 artifact per `.idea/v2.md` row L1) | `src/accept/packet.ts` |
| `src/scope/gate.ts` | `isScopeLocked(workItemId): boolean` — reads `scope_locks` table; the guard `execute/router.ts` calls before dispatching the coder | *(new, ~20 lines)* |
| `src/scope/watchdog.ts` | 24h reminder / 72h escalation for unanswered PM scope reviews | `src/plan/watchdog.ts:10-89` (near-verbatim; swap table + copy) |

**Why this fits the existing webhook + verdict-detection pattern exactly:**

- Ingress already filters bot echoes before the router sees anything (`src/ingress/routes.ts:142-162` → `isBotEcho` in `src/ingress/bot-shield.ts` checks `revisedById === ADO_BOT_ID` **or** history contains `[automated-agent]`). A PM's `[approve-scope]` comment is a human edit and passes through untouched. No ingress change needed.
- The router already calls a token-based verdict detector at the top of every work-item event (`src/execute/router.ts:73-78`). Adding a second detector call for scope is a two-line insertion into the same block, before the state switch.
- The rework breaker is already parameterised by gate: `evaluateCircuitBreaker(workItemId, sourceGate)` with `sourceGate: 'accept' | 'pr_review'` (`src/accept/breaker.ts:10-12`). Widening to `'accept' | 'pr_review' | 'scope'` gives the PM gate the same ≤2-bounce cap and the same `Blocked` escalation + `[reset-rework]` recovery path for free. **Note:** `db/schema.ts:90` declares `source_gate` as `text(..., { enum: ['accept','pr_review'] })` — this is a TypeScript-side enum over a SQLite `TEXT` column, so widening it is a **type-only change, no DDL**.

### B3. `src/deploy/smoke.ts` — automated prod smoke runner (Step 8)

**Why this fits the existing execa sandbox + telemetry pattern exactly:** every primitive it needs already exists.

| Smoke-runner need | Existing primitive to reuse | Location |
|---|---|---|
| Run a suite as a child process with timeout, signal cascade, env scrubbing, output truncation | `runCommand(file, args, { cwd, timeoutMs, env }, knownSecrets)` — execa, 120s default, SIGTERM then SIGKILL after 2s, `sanitizeEnv` whitelist, `scrubOutput` redaction, 50KB cap | `src/sandbox/runner.ts:84-127` |
| Probe a URL with timeout | `checkStagingHealth(url)` — `fetch` + `AbortController` 10s, returns `{healthy, status, error}` | `src/qa/runner.ts:36-68` |
| Parse a test-suite stdout into pass/fail counts | `parseVitestSummary`, `pruneTestDiagnostics` | `src/test-runner/parser.ts` |
| Distinguish real failure from transient flake before rolling back prod | `executeTwoStrikeQaFilter` — run 1, on failure run 2, compare fingerprints, `flaked` outcome clears | `src/qa/runner.ts:130-224` |
| Persist an evaluation row and evaluate against thresholds | `evaluateMetricsAgainstThresholds` + `db.insert(telemetryEvaluations)` | `src/deploy/telemetry.ts:114-176` |
| Secret list to scrub | `[env.ADO_PAT, env.OPENAI_API_KEY, env.ADO_WEBHOOK_SECRET]` | `src/qa/runner.ts:89` |

Shape:

```typescript
// src/deploy/smoke.ts
export interface SmokeRunResult {
  passed: boolean; outcome: 'passed' | 'failed' | 'flaked';
  totalChecks: number; passedChecks: number; failedChecks: number;
  durationMs: number; failures: string[]; commitSha: string; targetUrl: string;
}

export async function runProductionSmokeSuite(opts: {
  workItemId: number; commitSha: string;
  smokeCommand?: string;            // env.SMOKE_TEST_COMMAND
  prodUrl?: string;                 // env.PRODUCTION_SMOKE_URL
  mockRunner?: (runIndex: number) => Promise<QaRunResult>;  // same test-seam as qa/runner
}): Promise<SmokeRunResult>;

export function formatSmokeEvidenceComment(r: SmokeRunResult): string;   // L6, sanitize-html + [automated-agent]
export function formatSmokeFailureComment(r: SmokeRunResult, rollbackCommand: string): string;
```

Critical: the **two-strike flake filter must be reused**, not reimplemented. A single transient prod network blip rolling back a healthy release is the exact failure mode `qa/fingerprint.ts` was built to prevent.

### B4. `src/learn/retro.ts` + `src/learn/runbook.ts` — L7 output (Step 9)

| File | Responsibility | Clone of |
|---|---|---|
| `src/learn/retro.ts` | `generateRetroTakeaways(lifecycle)` → structured takeaways: what went well, what bounced and why, gate friction (scope-lock rejections, rework bounces, QA strikes, smoke flakes), action items | `src/learn/generator.ts:18-79` (same shape: infer → build markdown → return typed object) |
| `src/learn/runbook.ts` | `generateRunbookDelta(lifecycle, smoke, telemetry)` → operational runbook section: rollback command, smoke-check list, telemetry thresholds/baselines, known failure signatures | `src/deploy/packet.ts:44-56` (`buildRollbackProcedure`) + `src/learn/generator.ts` |

Both write into the **same PR branch** that `stageAndPublishSkillPr` already creates (`src/learn/publisher.ts:64-116`), which stages files under `path.join(repoRoot, '.claude', 'skills', name)` and opens a PR via `createOrGetPullRequest`. Add `RUNBOOK.md` alongside `SKILL.md` in that staging step and extend the PR description. **Human-merge-only governance is preserved automatically** — the existing prompt-injection defence (PROJECT.md "Learning via PR only") covers retro and runbook output with no new code.

### B5. New DB tables + one new column

```typescript
// src/db/schema.ts — ADDITIONS ONLY

export const scopeLocks = sqliteTable('scope_locks', {
  workItemId: integer('work_item_id').primaryKey(),
  revId: integer('rev_id').notNull(),
  status: text('status', { enum: ['pending', 'locked', 'rejected', 'expired', 'blocked'] })
    .notNull().default('pending'),
  scopeChecklist: text('scope_checklist').notNull(),   // L1 artifact: boundary checklist JSON/markdown
  testabilitySignOff: text('testability_sign_off'),    // L1 artifact
  pmFeedback: text('pm_feedback'),
  lockedBy: text('locked_by'),
  remindedAt: integer('reminded_at', { mode: 'timestamp' }),
  escalatedAt: integer('escalated_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [ index('idx_scope_locks_status').on(t.status) ]);

export const smokeRuns = sqliteTable('smoke_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workItemId: integer('work_item_id').notNull(),
  runIndex: integer('run_index').notNull().default(1),
  commitSha: text('commit_sha').notNull(),
  targetUrl: text('target_url').notNull(),
  status: text('status', { enum: ['passed', 'failed', 'flaked'] }).notNull(),
  totalChecks: integer('total_checks').notNull(),
  passedChecks: integer('passed_checks').notNull(),
  failedChecks: integer('failed_checks').notNull(),
  failures: text('failures'),                 // JSON.stringify(string[])
  durationMs: integer('duration_ms').notNull(),
  stdout: text('stdout'), stderr: text('stderr'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [ index('idx_smoke_runs_work_item').on(t.workItemId) ]);

export const retroRecords = sqliteTable('retro_records', {
  workItemId: integer('work_item_id').primaryKey(),
  takeaways: text('takeaways').notNull(),          // markdown
  actionItems: text('action_items'),               // JSON.stringify(string[])
  runbookDelta: text('runbook_delta'),             // markdown
  skillPrId: integer('skill_pr_id'),               // FK-by-value → skills_prs.pull_request_id
  gateFriction: text('gate_friction'),             // JSON: {scopeRejections, reworkBounces, qaStrikes, smokeFlakes}
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// evidenceIndices — ADD one nullable column (nullable so pre-v2 rows stay valid)
//   l7Summary: text('l7_summary')
```

`gateFriction` is what makes L7 *evidence* rather than prose: it is derived from `scope_locks`, `rework_cycles`, `qa_bounces`, and `smoke_runs` — all queryable, all already written by v1.0 code plus the two new tables.

### Migration strategy — **critical, non-obvious**

**There is no Drizzle Kit in this project.** Verified: no `drizzle.config.*` anywhere in the repo, no `migrations/` directory. `drizzle-orm` is used purely as a typed query builder. Schema is applied at process start by one raw `sqlite.exec(\`CREATE TABLE IF NOT EXISTS ...\`)` block in **`src/db/index.ts:22-184`**. `src/db/schema.ts` holds only the Drizzle table *definitions*.

Therefore the migration mechanism for v2.0 is:

1. **New tables** → append `CREATE TABLE IF NOT EXISTS scope_locks (...)`, `smoke_runs`, `retro_records` + their `CREATE INDEX IF NOT EXISTS` to the existing exec block in `src/db/index.ts`. Idempotent by construction. Safe on both fresh and existing `data/gateway.db`.
2. **New column on `evidence_indices`** → `ALTER TABLE evidence_indices ADD COLUMN l7_summary TEXT`. **SQLite has no `ADD COLUMN IF NOT EXISTS`**, so this needs a guard or it throws `duplicate column name` on every restart after the first:

```typescript
// src/db/index.ts — additive column guard (SQLite has no ADD COLUMN IF NOT EXISTS)
function columnExists(table: string, column: string): boolean {
  return (sqlite.pragma(`table_info(${table})`) as { name: string }[])
    .some((c) => c.name === column);
}
if (!columnExists('evidence_indices', 'l7_summary')) {
  sqlite.exec(`ALTER TABLE evidence_indices ADD COLUMN l7_summary TEXT`);
}
```

3. **`rework_cycles.source_gate` enum widening** → **no DDL**. It is a SQLite `TEXT` column; the `enum` in `db/schema.ts:90` is TypeScript-only. Just widen the union.
4. **Do NOT introduce drizzle-kit now.** Running two migration systems (raw exec DDL + generated SQL migrations) against one database file is strictly worse than either alone. If the team wants real migrations, that is a separate, deliberate milestone task — not a v2.0 dependency.
5. `l7_summary` must be **nullable** (unlike `l1_summary`…`l6_summary`, which are `NOT NULL`). Reason: the evidence index is compiled at the `Done` transition, which happens *before* retro runs (see data-flow D4). A `NOT NULL` L7 column would make the first compile impossible.

---

## (c) MODIFIED components

| # | File | Change | Size | Depends on |
|---|---|---|---|---|
| C1 | `src/db/schema.ts` | Add `scopeLocks`, `smokeRuns`, `retroRecords` tables; add `l7Summary` to `evidenceIndices`; widen `reworkCycles.sourceGate` enum to include `'scope'`; export `$inferSelect`/`$inferInsert` types for the 3 new tables | ~70 lines added | — |
| C2 | `src/db/index.ts` | Add 3 `CREATE TABLE IF NOT EXISTS` blocks + indexes to the exec string; add `columnExists()` helper + guarded `ALTER TABLE evidence_indices ADD COLUMN l7_summary` | ~45 lines added | C1 |
| C3 | `src/pipeline/taxonomy.ts` | **NEW** — 9-step model as data (see B1) | ~80 lines | — |
| C4 | `src/auditor/worker.ts` | **Stop auto-unlocking.** Line 60-64 currently: `if (result.passed) await transitionToReadyToDev(workItemId, htmlComment)`. v2: on pass, still transition to `Ready to Dev` (reuse existing state — no new board column), but **add tag `[awaiting-scope-lock]`**, write a `scope_locks` row `status='pending'` with the scope checklist, and post the combined L1-audit + scope-boundary comment. On fail, unchanged (stays `New` with questions). | ~30 lines changed | C1, C2, B2 |
| C5 | `src/ado/work-item.ts` | Add `buildReadyToDevAwaitingScopePatch(htmlComment, currentTags)` (sibling of `buildReadyToDevPatch:87-100`, adds the `[awaiting-scope-lock]` tag) and `transitionToReadyToDevAwaitingScope()`. Also `buildScopeLockedPatch()` / `transitionToScopeLocked()` mirroring `buildMergeReadyForQaPatch:219-241`. | ~45 lines added | — |
| C6 | `src/execute/router.ts` | Three edits: **(i)** call `detectScopeVerdict(...)` alongside `detectAcceptanceVerdict(...)` at lines 73-78 and handle `approve_scope` / `reject_scope` in the same verdict block (lines 80-121), reusing `evaluateCircuitBreaker(workItemId, 'scope')`; **(ii)** add a **scope-lock guard** before the `state === 'In Dev'` dispatch at line 124 — `if (!isScopeLocked(workItemId)) { mark skipped + warn; return; }`; **(iii)** optionally replace the state-string if/else chain (lines 122-219) with a lookup over `GOLDEN_PATH_V2`. | ~60 lines | C3, C4, B2 |
| C7 | `src/accept/breaker.ts` | Widen `sourceGate` param type to `'accept' \| 'pr_review' \| 'scope'` (line 12). Escalation copy at lines 98-101 says "Accept/PR Review gates" — make it name the actual `sourceGate`. | ~5 lines | C1 |
| C8 | `src/deploy/worker.ts` | Insert the smoke runner into `processTelemetryEvaluation` (lines 85-185). Order: **smoke first, then telemetry window** — smoke is seconds and fails fast, so a broken deploy does not burn the 30-minute observation window. Both must pass for `Done`. On smoke failure, reuse the *existing* breach path verbatim (lines 117-143: `[deploy-regressed]` tag, bounce to `In Dev`, `formatTelemetryAlertComment` shape). | ~50 lines | C1, C2, B3 |
| C9 | `src/deploy/evidence-index.ts` | Rename `L1L6EvidenceSummary` → `L1L7EvidenceSummary` and `compileL1L6EvidenceIndex` → `compileL1L7EvidenceIndex` (keep a deprecated re-export alias so `deploy/worker.ts:18-21` and tests keep compiling). Add `l7` to the interface; read it from `retroRecords` — **do not hardcode it** the way `l2` (lines 95-98) and `l4` (lines 106-109) are hardcoded today. Add `l7Summary` to both the `insert` and the `onConflictDoUpdate.set` (lines 125-148). In `formatEvidenceIndexComment`, add a 7th `<tr>` and fix the copy at line 159: "all eight stages" → "all nine steps across five columns", "all six levels" → "all seven levels". Generate the rows from `GOLDEN_PATH_V2` rather than hand-writing 7 blocks. | ~80 lines | C1, C2, C3, B5 |
| C10 | `src/learn/harvester.ts` | Extend `harvestTicketLifecycleData` (lines 12-63) to also read `scope_locks` (rejections, time-to-lock), `smoke_runs` (flakes, failures), and `auditLogs` (L1 reasons). Extend `TicketLifecycleData` in `src/learn/types.ts:1-15` accordingly. | ~35 lines | C1, C2 |
| C11 | `src/learn/worker.ts` | Extend `processLearningFeedbackLoop` (lines 19-77): after the skill is generated, also call `generateRetroTakeaways` + `generateRunbookDelta`, persist a `retro_records` row (L7), pass `RUNBOOK.md` through `stageAndPublishSkillPr`, then **re-invoke `compileL1L7EvidenceIndex(workItemId)`** to upsert the L7 column (the function already uses `onConflictDoUpdate`, so the second call is idempotent) and post the final L1–L7 index comment. | ~45 lines | C9, C10, B4 |
| C12 | `src/learn/publisher.ts` | `stageAndPublishSkillPr` (lines 64-116): accept an optional `runbookMarkdown`, write `RUNBOOK.md` next to `SKILL.md` (line 75), extend the PR description (lines 79-93). | ~20 lines | B4 |
| C13 | `src/config/env.ts` | Add `SMOKE_TEST_COMMAND`, `PRODUCTION_SMOKE_URL`, `SMOKE_TIMEOUT_MS`, and (if the PM gate gets a distinct SLA) `SCOPE_REMINDER_HOURS`. Follow the existing zod pattern (lines 4-26). | ~6 lines | — |
| C14 | `src/index.ts` | Start the scope watchdog next to the plan watchdog (line 61: `const watchdog = startPlanWatchdog()`); stop it in `gracefulShutdown` (line 74). | ~6 lines | B2 |
| C15 | `.planning/ROADMAP.md` | Replace the state matrix (lines 9-24) with the 5-column / 9-step / L1–L7 matrix from `.idea/v2.md`. **Note the existing table is already corrupted** — rows 11, 13-16 contain leaked `| 3/3 | Complete | 2026-09-08 |` phase-status fragments inside the state matrix. Fix while rewriting. | doc | C3 |

**Untouched (verified):** `src/ingress/{routes,hmac,bot-shield,poller}.ts`, `src/ingress/pr-router.ts`, `src/ado/{client,git,policy,threads,formatter}.ts`, `src/qa/*`, `src/mcp/*`, `src/sandbox/*`, `src/queue/*`, `src/test-runner/*`, `src/plan/{planner,checkpoint,schema,formatter}.ts`, `src/execute/{worker,coder,repair,rework-worker,diff-guard}.ts`. Steps 5, 6, 7 need **zero code changes** — they already implement the v2 behaviour.

---

## Standard Architecture (post-v2)

### System Overview

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                        AZURE DEVOPS  (single source of truth)                   │
│   Boards (states+tags)   Repos (PR/branch policy)   Pipelines   Environments     │
└──────────┬────────────────────────▲──────────────────────▲──────────────────────┘
           │ Service Hooks (HMAC)   │ REST JSON-Patch      │ native L2/L3/L4/L5
           ▼                        │                      │
┌──────────────────────────────────────────────────────────────────────────────────┐
│  INGRESS  (unchanged)  routes.ts · hmac.ts · bot-shield.ts · poller.ts            │
│  dedup_events PK(workItemId,revId)  →  per-work-item p-queue lane                 │
└──────────────────────────────────┬─────────────────────────────────────────────────┘
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ROUTER  execute/router.ts   ← NEW src/pipeline/taxonomy.ts (9-step model)        │
│                                                                                   │
│  1 REFINEMENT   New ──auditor──► Ready to Dev +[awaiting-scope-lock]              │
│                 │                        │                                        │
│                 │              NEW scope/ ◄── 👤 PM [approve-scope]  (Step 2)      │
│                 │                        │        └─[reject-scope]→ breaker 'scope'│
│                 │                        ▼                                        │
│  2 EXECUTION    In Dev ── GUARD: isScopeLocked() ──► plan/ → execute/ →           │
│                 test-runner/ → sandbox/ → mcp/   (Step 3 loop)                    │
│                 Dev Done ──► accept/  👤 Dev verdict + PR  (Step 4)                │
│                                                                                   │
│  3 ACCEPTANCE   pr-router.ts + ado/policy.ts  👤 TechLead  (Step 5, unchanged)     │
│                 qa/  👤 QA  (Step 6, unchanged)                                   │
│                                                                                   │
│  4 RELEASE      deploy/packet.ts  👤 Environment approval  (Step 7, unchanged)     │
│                 deploy/smoke.ts ⚡ NEW  ─┐                                          │
│                 deploy/telemetry.ts ⚡  ─┴─ AND ──► Done + L1–L6 index  (Step 8)   │
│                                                                                   │
│  5 RETRO        learn/ ⚡  harvest(L1–L6+scope+smoke) → retro.ts + runbook.ts     │
│                 → retro_records (L7) → PR(SKILL.md+RUNBOOK.md)                    │
│                 → RE-COMPILE L1–L7 index  (Step 9)                                │
└──────────────────────────────────┬─────────────────────────────────────────────────┘
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  SQLite (WAL)  db/schema.ts                                                       │
│  existing: dedup_events audit_log plan_checkpoints l3_evidence rework_cycles       │
│            qa_runs qa_bounces qa_evidence deployment_records                       │
│            telemetry_evaluations evidence_indices skills_prs                       │
│  NEW:      scope_locks · smoke_runs · retro_records · evidence_indices.l7_summary  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|---|---|---|
| `pipeline/taxonomy.ts` **(new)** | Own the 5×9 model as data: step ↔ column ↔ actor ↔ evidence ↔ ADO state ↔ tags | Const array + lookup helpers; consumed by router, evidence-index, tests |
| `scope/` **(new)** | Step 2 PM scope-lock: detect verdict, persist lock, guard execution, remind/escalate on silence | Clone of `accept/` + `plan/watchdog.ts` |
| `deploy/smoke.ts` **(new)** | Step 8 active L6: run smoke suite against prod URL, two-strike flake filter, persist `smoke_runs` | Reuses `sandbox/runner.runCommand`, `qa/runner` primitives, `test-runner/parser` |
| `learn/retro.ts` + `runbook.ts` **(new)** | Step 9 L7: derive takeaways + action items + runbook delta from full lifecycle; emit as PR | Clone of `learn/generator.ts`; publishes via existing `learn/publisher.ts` |
| `execute/router.ts` **(mod)** | Dispatch by state; now also by scope verdict; now guards on scope lock | Existing if/else → taxonomy lookup |
| `deploy/worker.ts` **(mod)** | Sequence Step 7 → Step 8: prep (L5) → smoke (L6a) → telemetry (L6b) → Done → index | Existing; smoke inserted before telemetry |
| `deploy/evidence-index.ts` **(mod)** | Compile + render L1–L7; now called **twice** (at Done, and after retro) | Existing `onConflictDoUpdate` makes the second call idempotent |

---

## Recommended Project Structure (v2.0)

```
src/
├── index.ts                     # MOD: + startScopeWatchdog()
├── pipeline/                    # NEW DIR
│   └── taxonomy.ts              # 5 columns / 9 steps / actors / L1–L7 — single source of truth
├── scope/                       # NEW DIR — Step 2 (👤 PM gate); mirrors accept/
│   ├── verdict.ts               #   [approve-scope] / [reject-scope] / [reset-scope]
│   ├── packet.ts                #   scope-boundary checklist + testability sign-off (L1)
│   ├── gate.ts                  #   isScopeLocked(workItemId) — the execution guard
│   └── watchdog.ts              #   24h reminder / 72h escalation (clone of plan/watchdog.ts)
├── auditor/                     # MOD — Step 1; no longer auto-unlocks execution
├── plan/                        # unchanged — Step 3 (plan leg)
├── execute/                     # MOD router.ts — Step 3 + Step 4 dispatch, scope guard
├── test-runner/                 # unchanged — Step 3 (test leg); CHECK folded into Step 3
├── accept/                      # MOD breaker.ts only — Step 4; sourceGate union widened
├── mcp/                         # unchanged
├── sandbox/                     # unchanged — reused by smoke runner
├── qa/                          # unchanged — Step 6; runner primitives reused by smoke
├── deploy/                      # MOD — Steps 7 & 8
│   ├── packet.ts                #   unchanged (L5)
│   ├── smoke.ts                 #   NEW (L6 active)
│   ├── telemetry.ts             #   unchanged (L6 passive)
│   ├── evidence-index.ts        #   MOD L1–L6 → L1–L7
│   └── worker.ts                #   MOD sequencing
├── learn/                       # MOD — Step 9
│   ├── harvester.ts             #   MOD + scope/smoke/L1 sources
│   ├── generator.ts             #   unchanged (SKILL.md)
│   ├── retro.ts                 #   NEW (takeaways + action items)
│   ├── runbook.ts               #   NEW (RUNBOOK.md delta)
│   ├── publisher.ts             #   MOD stages RUNBOOK.md on same PR branch
│   ├── types.ts                 #   MOD TicketLifecycleData
│   └── worker.ts                #   MOD persists L7 + re-compiles index
├── ingress/                     # unchanged
├── ado/                         # MOD work-item.ts only (+3 patch builders)
├── db/                          # MOD schema.ts + index.ts
├── queue/                       # unchanged
├── config/                      # MOD env.ts (+4 vars)
└── utils/                       # unchanged
```

### Structure Rationale

- **`pipeline/`** is deliberately separate from `execute/` even though `router.ts` lives in `execute/`. The taxonomy is consumed by `execute/`, `deploy/`, and tests; putting it in `execute/` would make `deploy/` import from a sibling stage. Moving `router.ts` into `pipeline/` is optional and not worth the churn.
- **`scope/` is a top-level dir, not `auditor/scope-gate.ts`.** It owns a distinct actor (👤 PM vs ⚡ AI), a distinct DB table, a distinct watchdog, and a distinct breaker gate. It is structurally identical to `accept/`, which is also a top-level human-gate dir. Symmetry makes the codebase readable.
- **`deploy/smoke.ts` is a file, not a dir.** It is one runner + two formatters, reusing primitives from four existing modules. A `src/smoke/` dir with one file in it would be scaffolding for its own sake.
- **`learn/retro.ts` + `learn/runbook.ts` stay inside `learn/`.** Step 9 is one column with one worker; splitting it would fragment the L7 emit path across two dirs.

---

## Architectural Patterns

### Pattern 1: Tag-mediated human gate (no new ADO board state)

**What:** A human decision point is modelled as *existing ADO state* + *bot-managed tag* + *comment token*, never as a new board state.

**When to use:** Every 👤 gate. This is how v1.0 already does `[awaiting-acceptance]` (`accept/`), `[awaiting-input]` (`plan/checkpoint`), `[qa-verified]`/`[qa-failed]` (`qa/worker.ts:138,177`), `[deploying]`/`[deploy-regressed]` (`deploy/worker.ts:126,159`), `[rework-escalated]` (`accept/breaker.ts:94`).

**Trade-offs:** (+) Zero ADO process-template changes; branch policies and board views keep working; reversible. (−) Tags are stringly-typed and can be hand-edited by humans — mitigate by treating the SQLite row (`scope_locks.status`) as authoritative and the tag as advisory UI.

**Example (PM scope gate):**
```typescript
// src/scope/verdict.ts — mirrors src/accept/verdict.ts exactly
export type ScopeVerdict =
  | { type: 'approve_scope'; comment?: string }
  | { type: 'reject_scope'; feedback: string }
  | { type: 'reset_scope' }
  | { type: 'none' };

export function detectScopeVerdict(i: {
  currentState: string; previousState?: string; historyComment?: string; tags?: string;
}): ScopeVerdict {
  const c = i.historyComment || '';
  if (c.includes('[reset-scope]')) return { type: 'reset_scope' };
  if (c.includes('[approve-scope]') ||
      (i.tags?.includes('[awaiting-scope-lock]') && i.currentState === 'In Dev')) {
    return { type: 'approve_scope', comment: c || undefined };
  }
  if (c.includes('[reject-scope]')) {
    const feedback = c.replace(/\[reject-scope\]/g, '').replace(/<!--[\s\S]*?-->/g, '').trim();
    return { type: 'reject_scope',
             feedback: feedback || 'Scope rejected without comments. Refine AC boundary and resubmit.' };
  }
  return { type: 'none' };
}
```

### Pattern 2: Shared rework breaker, parameterised by gate

**What:** One `rework_cycles` row per work item, one ≤2 bounce cap, shared across all gates that can bounce work back to an agent. Escalate to `Blocked` + `[rework-escalated]`; recover via `[reset-rework]`.

**When to use:** Any automated bounce. Already shared by `accept` and `pr_review` (`src/accept/breaker.ts:12`); QA runs a *separate* breaker (`src/qa/breaker.ts`, `qa_bounces` table) because QA bounces have their own 2-strike flake semantics layered underneath.

**Trade-offs:** (+) Bounds LLM cost and review ping-pong globally, which is the stated PROJECT.md constraint. (−) A cap shared across gates means a ticket that burned 2 bounces at Accept has 0 left at PR review — this is *intended* (PROJECT.md: "Shared rework breaker ≤2 automated bounces per stage family").

**Scope-gate decision:** put PM scope rejections on the **shared** breaker with `sourceGate='scope'`, not a new table. A scope rejection that sends the ticket back for AC refinement is the same cost-control problem as an Accept rejection. Widening the union is a type-only change (see B2 note).

### Pattern 3: Evidence compile as idempotent upsert (now two-phase)

**What:** `compileL1L7EvidenceIndex(workItemId)` reads whatever evidence rows exist, fills gaps with defaults, and `INSERT … ON CONFLICT DO UPDATE`. Because it is an upsert, calling it more than once is safe.

**When to use:** v2.0 requires **two** calls, which is the single biggest behavioural change to the evidence model:

1. At the `Done` transition (`deploy/worker.ts:154`) — L1–L6 populated, `l7_summary = NULL`.
2. After retro completes (`learn/worker.ts`) — L7 populated, index re-upserted, final L1–L7 comment posted.

**Trade-offs:** (+) No new "index versioning" machinery; reuses the existing upsert. (−) The work item gets two evidence-index comments. Mitigate: post the full table only on the second call, and have the first call post a short "L1–L6 confirmed, retro pending" note. Or make the first call silent (persist only) and post once, at Step 9.

### Pattern 4: Fail-closed evidence

**What:** If evidence cannot be produced for real, throw — never fabricate. `deploy/worker.ts:103-111` explicitly refuses to transition to `Done` when telemetry evaluation fails; `deploy/telemetry.ts:32-37` throws when App Insights creds are missing outside `NODE_ENV=test`.

**When to use:** The smoke runner must obey this. `runProductionSmokeSuite` with no `PRODUCTION_SMOKE_URL` in production must **throw**, not silently pass. (`qa/runner.ts:41-45` currently defaults to `healthy: true` when the URL is absent, with a `ponytail:` comment naming that exact ceiling — do not copy that default into the prod smoke path.)

### Pattern 5: Test seam via injected runner

**What:** Every side-effecting executor takes an optional mock: `runQaSuite(worktreePath, cmd, runnerFn?)`, `executeTwoStrikeQaFilter({ mockRunner })`, `processQaVerification({ mockRunner })`, `processDeploymentWorkflow({ mockMetrics })`, `generateSkillFromLifecycle(lifecycle, { mockSkill })`, `stageAndPublishSkillPr({ mockPrCreator })`.

**When to use:** Always, for new components. `runProductionSmokeSuite` must accept `mockRunner`; `generateRetroTakeaways` must accept a `mockRetro`. This is why all 277 v1.0 tests run without network or LLM access, and it is the cheapest thing to get right the first time.

---

## Data Flow

### v2.0 end-to-end request flow

```
👤 PM/Dev/QA edits work item in ADO Boards
    ↓  Service Hook (workitem.updated | git.pullrequest.*)
ingress/routes.ts  → verifyHmac → isBotEcho(drop) → dedup_events INSERT (PK conflict = drop)
    ↓  reply 202 in <100ms
queue/lane-manager.ts  → per-work-item p-queue lane (serial, prevents duplicate dispatch)
    ↓
execute/router.ts
    ├─ detectAcceptanceVerdict()          [existing]
    ├─ detectScopeVerdict()               [NEW — Step 2]
    │     approve_scope → scope_locks.status='locked', tag [scope-locked], −[awaiting-scope-lock]
    │     reject_scope  → evaluateCircuitBreaker(id,'scope') → allowed? bounce+feedback : Blocked
    │     reset_scope   → resetCircuitBreaker(id)
    └─ state switch (taxonomy-driven)
          New            → auditor/worker.ts      → audit_log + scope_locks(pending)   [L1]
          Ready to Dev   → (no handler; waits for 👤 PM)                              [Step 2]
          In Dev         → GUARD isScopeLocked() → plan/ → execute/ → test-runner/     [L2,L3]
          Dev Done       → accept/ + PR create                                         [L2,L3]
          (PR merged)    → ingress/pr-router.ts → ado/policy.ts → Ready for QA         [L3,L4]
          Ready for QA   → qa/worker.ts → qa_evidence → Ready to Deploy                [L3,L5]
          Ready to Deploy→ deploy/worker.ts
                             ├ processDeploymentPreparation → deployment_records       [L5]
                             ├ runProductionSmokeSuite      → smoke_runs               [L6 active]
                             │     fail (2-strike confirmed) → In Dev +[deploy-regressed]
                             └ evaluateProductionTelemetry  → telemetry_evaluations     [L6 passive]
                                   breach → In Dev +[deploy-regressed]
                                   pass   → Done +[golden-path-complete]
                                            + compileL1L7EvidenceIndex (l7=NULL)
                                            + processLearningFeedbackLoop (async)
          Done           → learn/worker.ts                                              [L7]
                             ├ harvestTicketLifecycleData (L1–L6 + scope + smoke)
                             ├ generateSkillFromLifecycle      → SKILL.md
                             ├ generateRetroTakeaways          → retro_records
                             ├ generateRunbookDelta            → RUNBOOK.md
                             ├ stageAndPublishSkillPr          → PR (human merges) ◆
                             └ compileL1L7EvidenceIndex AGAIN  → l7_summary upserted
```

### Key data-flow changes vs v1.0

**D1 — L1 now produces two artifacts, and no longer unlocks execution.**
v1.0: `auditor/worker.ts` writes `audit_log`, then `transitionToReadyToDev()` — the ticket is immediately eligible for `In Dev`. v2.0: it writes `audit_log` **and** `scope_locks(status='pending')`, transitions to `Ready to Dev` **with** `[awaiting-scope-lock]`, and the ticket is *ineligible* for execution until a human PM acts. This inserts the system's first **precondition gate** — every other v1.0 gate is a *state* gate (the router keys off `System.State`); the scope gate keys off a DB row + tag while the state stays `Ready to Dev`.

**D2 — New human token channel.**
`[approve-scope]` / `[reject-scope]` / `[reset-scope]` join `[approve-acceptance]` / `[reject-acceptance]` / `[reset-rework]`. Same detection mechanism (string tokens in `System.History`), same ingress path, same bot-shield, same breaker. No new transport.

**D3 — L6 becomes a conjunction of two independent signals.**
v1.0: L6 = telemetry window only (passive). v2.0: L6 = `smoke_passed AND NOT telemetry_breached` (active + passive). Sequencing matters: run smoke **first** (seconds, fail-fast) so a broken deploy never consumes the 30-minute telemetry window. Both failures take the *same* existing bounce path (`In Dev` + `[deploy-regressed]`), so no new recovery logic.

**D4 — The evidence index becomes two-phase instead of terminal-once.**
v1.0: `compileL1L6EvidenceIndex` is called exactly once, at `Done`, and is the last write to the work item. v2.0: L7 is produced *after* `Done` (Step 9 is a distinct column), so the index must be compiled at `Done` with `l7=NULL` and re-upserted after retro. This is why `l7_summary` must be nullable and why the existing `onConflictDoUpdate` is load-bearing.

**D5 — Retro harvests a strictly larger input set.**
`harvestTicketLifecycleData` currently reads `rework_cycles`, `l3_evidence`, `qa_evidence`, `telemetry_evaluations` + work-item history (`learn/harvester.ts:17-46`). v2.0 adds `scope_locks` (was scope contested? how long to lock?), `smoke_runs` (did prod smoke flake? which checks failed?), and `audit_log.reasons` (what L1 ambiguity was flagged?). This is what turns L7 from prose into **evidence**: `gateFriction = { scopeRejections, reworkBounces, qaStrikes, smokeFlakes }` is fully derived from queryable rows.

**D6 — The skills PR becomes the Retro PR.**
`stageAndPublishSkillPr` currently stages one file (`SKILL.md`) at `repoRoot/.claude/skills/<name>/` (`learn/publisher.ts:73-75`). v2.0 stages `SKILL.md` + `RUNBOOK.md` on the same branch and one PR. Human-merge-only governance is unchanged, so the prompt-injection persistence defence carries over with no new code.

### State Management

Unchanged mechanism: ADO Boards is authoritative for lifecycle state; SQLite is authoritative for orchestrator bookkeeping (dedup, evidence, breakers, locks); tags are the advisory bridge between them. The one new rule: **`scope_locks.status` is authoritative over the `[scope-locked]` tag.** If a human hand-removes the tag, the guard still consults the DB row.

---

## Scaling Considerations

| Scale | Architecture adjustments |
|---|---|
| Single team, ≤20 concurrent work items (**v2.0 target**) | No change. One Fastify process, one SQLite WAL file, in-process `p-queue` lanes. This is the stated PROJECT.md scope ("single-team runner first"). |
| Multiple teams, ~100 concurrent work items | Lane contention, not DB contention, is the limit. Smoke + retro add two more serial stages to each lane → longer occupancy. Fix: keep retro **async fire-and-forget** (as `deploy/worker.ts:180-182` already does with `.catch`), and move smoke off the lane onto a timer once the deploy is confirmed. SQLite WAL handles concurrent readers fine; writers serialise but the write volume here is trivial. |
| Org-wide, 1000+ work items | Replace the in-process lane manager with a real durable queue, shard SQLite per team or move to Postgres (Drizzle makes this a config change), and split the Fastify gateway from the workers. Explicitly **out of v2.0 scope** (PROJECT.md: multi-tenant runner pool is future backlog). |

### Scaling priorities

1. **First bottleneck: lane occupancy time.** Step 8 adds a smoke suite (seconds–minutes) and Step 9 adds an LLM retro generation (tens of seconds) to each ticket's serial lane. Mitigation is free — retro is already dispatched off-lane; keep it that way and do not `await` it in the deploy path.
2. **Second bottleneck: `evidence_indices` double-write.** Two upserts per work item instead of one. Negligible at target scale; only matters if the index compile becomes expensive (it is currently 5 indexed single-row SELECTs).
3. **Third: PM scope gate as a throughput valve.** This is a *deliberate* human bottleneck, not a defect — but an unanswered scope review now stalls a ticket indefinitely where v1.0 would have proceeded. The scope watchdog (24h remind / 72h escalate to `Blocked`) is therefore **mandatory**, not optional, and is the direct clone of `plan/watchdog.ts`.

---

## Anti-Patterns

### Anti-Pattern 1: Renaming the eight stage directories

**What people do:** "Restructure to 5 columns" → `git mv auditor refine`, `git mv accept execution`, `git mv test-runner execution/test`, etc.
**Why it's wrong:** Touches every import in `src/` and all 32 files in `tests/`, produces a 500-line diff with zero behavioural change, destroys `git blame` across the whole codebase, and guarantees merge conflicts with any in-flight branch. The v2 model is a *taxonomy* change; the directories already have clean single responsibilities that map onto v2 steps.
**Do this instead:** Add `src/pipeline/taxonomy.ts` as the model's single source of truth, add the three genuinely-new modules (`scope/`, `deploy/smoke.ts`, `learn/retro.ts`+`runbook.ts`), and realign `ROADMAP.md` + the evidence-index copy. Total footprint: ~4 new files, ~12 modified.

### Anti-Pattern 2: Creating a new ADO board state for scope review

**What people do:** Add a `Scope Review` state to the ADO process template so the PM gate has its own board column.
**Why it's wrong:** Requires org-level process-template admin rights; invalidates existing board views, WIQL queries, and any branch policy or dashboard keyed on state names; makes rollback of v2.0 painful. PROJECT.md already records the opposite decision for v1.0: *"Reuse existing ADO states — ACCEPT lives on `Dev Done`; no new board columns; less migration friction."*
**Do this instead:** `Ready to Dev` + `[awaiting-scope-lock]` tag + `scope_locks` row. Identical to how `[awaiting-acceptance]` and `[awaiting-input]` already work.

### Anti-Pattern 3: Introducing drizzle-kit mid-project for the L7 column

**What people do:** See "new tables + new column", reach for `drizzle-kit generate`, create `drizzle/0000_*.sql`.
**Why it's wrong:** The project has **no drizzle-kit and no migrations directory** — schema is applied by a raw `sqlite.exec("CREATE TABLE IF NOT EXISTS …")` block in `src/db/index.ts:22-184`. Adding a second migration system means two sources of truth for one database file, and the generated migrations will not match the existing hand-written DDL.
**Do this instead:** Extend the existing exec block (idempotent `CREATE TABLE IF NOT EXISTS`) plus a 6-line `columnExists()` pragma guard for the one `ALTER TABLE ADD COLUMN`. See the Migration strategy section under (b).

### Anti-Pattern 4: Hardcoding L7 the way L2 and L4 are hardcoded today

**What people do:** Follow the local precedent in `evidence-index.ts` and write `l7: { retroComplete: true, takeaways: 'Retro captured' }`.
**Why it's wrong:** `evidence-index.ts:95-98` and `:106-109` already fabricate `l2.reviewPassed = true` and `l4.securityPassed = true` unconditionally — those are v1.0 debt, defensible only because native ADO branch policies genuinely enforce them out-of-band. L7 has **no** external enforcer. A hardcoded L7 makes the entire "L1–L7 auditable evidence" claim false at its newest and most-featured level.
**Do this instead:** Read L7 from `retro_records`; when the row is absent (index compiled at `Done`, before retro), emit `l7_summary = NULL` and render the row as `[PENDING — retro in progress]`.

### Anti-Pattern 5: Running smoke and telemetry in parallel

**What people do:** `await Promise.all([runProductionSmokeSuite(...), evaluateProductionTelemetry(...)])` because both are L6.
**Why it's wrong:** The telemetry window is 30 minutes (`TELEMETRY_WINDOW_MINUTES`, `env.ts:23`). If the deploy is fundamentally broken, the smoke suite knows in ~30 seconds — but a parallel dispatch has already committed the ticket to the full window, delaying the `[deploy-regressed]` bounce and the rollback by half an hour.
**Do this instead:** Sequential — smoke first, fail fast, telemetry only if smoke passes (or flakes clear on the two-strike rerun).

### Anti-Pattern 6: Letting the smoke runner default to "healthy" when unconfigured

**What people do:** Copy `qa/runner.ts:41-45`, which returns `{ healthy: true }` when `STAGING_HEALTH_URL` is absent.
**Why it's wrong:** That default is acceptable for a *staging pre-flight* (it only logs a warning and QA still runs its suite). For a **production** L6 gate it silently fabricates the exact evidence the gate exists to produce. `deploy/telemetry.ts:32-37` already establishes the correct precedent: throw when creds are missing outside `NODE_ENV=test`.
**Do this instead:** Throw when `PRODUCTION_SMOKE_URL` is unset and `NODE_ENV !== 'test'`. Fail closed, per Pattern 4.

### Anti-Pattern 7: Dispatching the coder before the scope lock is checked

**What people do:** Put the scope check inside `execute/worker.ts` (deep in the agent loop) rather than in the router.
**Why it's wrong:** By then a git worktree has been provisioned (`sandbox/worktree.ts`), MCP servers mounted, and an LLM call budget committed. The whole point of Step 2 is to not spend any of that on unscoped work. It also leaves the `dedup_events` row in an ambiguous state.
**Do this instead:** Guard in `execute/router.ts` immediately before the `state === 'In Dev'` dispatch (line 124), mark the `dedup_events` row `skipped` with a clear reason, and return. Same shape as the existing "no active handler" branch at lines 206-218.

---

## Integration Points

### External Services

| Service | Integration pattern | v2.0 notes |
|---|---|---|
| ADO Boards REST (`azure-devops-node-api`) | JSON-Patch via `adoClient.updateWorkItem(id, patch)`; patch builders in `ado/work-item.ts` | 3 new patch builders for scope (C5). No new endpoints. |
| ADO Service Hooks | HMAC-verified POST to `/api/ado/webhook` (`ingress/routes.ts:31-38`) | **No change.** PM verdicts ride the existing `workitem.updated` event. |
| ADO Repos / PRs | `ado/git.ts:createOrGetPullRequest` | Reused for the Retro PR (`SKILL.md` + `RUNBOOK.md`). No change. |
| ADO branch policies | `ado/policy.ts:verifyBranchPolicies` → L2/L3/L4 read-only | Step 5 unchanged. |
| ADO Environments | Native approval gate → L5 | Step 7 unchanged. |
| Azure Monitor / App Insights | `fetch` to `api.applicationinsights.io/v1/apps/{id}/metrics/...` (`deploy/telemetry.ts:50-72`) | Step 8 passive half. Unchanged; smoke runs *before* it. |
| Production app (smoke target) | **NEW** — `fetch` probes (reuse `checkStagingHealth` shape) + optional `runCommand` suite via `sandbox/runner.ts` | Needs `PRODUCTION_SMOKE_URL`, `SMOKE_TEST_COMMAND`, `SMOKE_TIMEOUT_MS` in `env.ts`. Egress: the smoke runner must reach prod, which is a wider egress allowance than the code sandbox — call this out in the security review. |
| LLM providers (OpenAI / Anthropic via Vercel AI SDK) | `auditor/evaluator.ts`, `plan/planner.ts`, `execute/coder.ts`, `learn/prompt.ts` | Retro generation adds one more LLM call per ticket. Budget it; it is post-`Done` and off-lane, so latency is not user-visible. |

### Internal Boundaries

| Boundary | Communication | Considerations |
|---|---|---|
| `ingress/routes.ts` ↔ `execute/router.ts` | `registerWorkItemHandler()` injection (`index.ts:28`), per-work-item p-queue lane | Unchanged. All Step 2 logic lives behind the router — ingress stays dumb and fast. |
| `auditor/worker.ts` ↔ `scope/` | Direct call: auditor writes `scope_locks(pending)` + `[awaiting-scope-lock]` | Auditor must NOT wait for the verdict. Write-and-return; the PM's next webhook re-enters through the router. Same non-blocking discipline as `plan/checkpoint.ts` (`Q→human` releases the sandbox). |
| `scope/gate.ts` ↔ `execute/router.ts` | Synchronous `isScopeLocked(workItemId)` DB read | Must be the **first** thing in the `In Dev` branch, before worktree provisioning. |
| `scope/` ↔ `accept/breaker.ts` | `evaluateCircuitBreaker(id, 'scope')` | Type-only widening; shared ≤2 cap; shared `[reset-rework]` recovery. |
| `deploy/worker.ts` ↔ `deploy/smoke.ts` | Direct `await`, sequential before telemetry | Smoke failure reuses the existing breach bounce path verbatim — no new recovery branch. |
| `deploy/smoke.ts` ↔ `sandbox/runner.ts` | `runCommand(file, args, {cwd, timeoutMs, env}, knownSecrets)` | Pass `[env.ADO_PAT, env.OPENAI_API_KEY, env.ADO_WEBHOOK_SECRET]` exactly as `qa/runner.ts:89` does. Gets env sanitisation, output scrubbing, 50KB truncation, SIGTERM/SIGKILL cascade for free. |
| `deploy/smoke.ts` ↔ `qa/runner.ts` | Reuse `executeTwoStrikeQaFilter` semantics (or extract a shared `twoStrike()` helper) | **Decision point for plan-phase:** reuse `qa/runner.ts` directly (couples deploy→qa) vs extract the two-strike logic into a shared module (cleaner, bigger diff). Recommend extraction only if the third consumer appears; for now, calling `qa/runner.ts` is acceptable and the smaller diff. |
| `deploy/evidence-index.ts` ↔ `learn/worker.ts` | Second `compileL1L7EvidenceIndex()` call after retro | Idempotent via `onConflictDoUpdate`. This is the new back-edge in the graph — v1.0's flow was strictly linear to `Done`. |
| `learn/harvester.ts` ↔ `db/schema.ts` | Reads 4 existing + 3 new tables | Harvester becomes the widest reader in the codebase. Keep it read-only and side-effect free. |
| `pipeline/taxonomy.ts` ↔ everything | Imported const array + pure lookups | Must have **zero** runtime dependencies (no DB, no ADO, no env) so `deploy/`, `execute/`, and tests can all import it without cycles. |

---

## (e) Dependency-aware BUILD ORDER

Ordering constraints that drive this sequence:
- **Taxonomy before per-step gates** — the scope gate, smoke gate, and retro all need to know which step/column/level they belong to, and the router needs the state map before it can guard on scope.
- **Schema before every writer** — nothing can persist `scope_locks`, `smoke_runs`, or `retro_records` before C1+C2 land.
- **L7 schema before L7 index before L7 output** — `retro_records` (Phase 2) → `compileL1L7EvidenceIndex` (Phase 4) → `learn/retro.ts` emit (Phase 6).
- **Smoke before retro** — retro harvests `smoke_runs`; building retro first means a stubbed or missing input.
- **Docs last** — the ROADMAP matrix and evidence-index copy must describe the *built* system, not the intended one.

| Phase | Title | Contents | Depends on | Parallelisable with |
|---|---|---|---|---|
| **1** | **Taxonomy & state-map foundation** | `src/pipeline/taxonomy.ts` (C3); rewrite `.planning/ROADMAP.md` state matrix (C15); refactor `execute/router.ts` state switch to read from the taxonomy (C6-iii, behaviour-preserving); tests asserting the 9-step matrix | — | — (must be first) |
| **2** | **Schema & migration deltas** | `db/schema.ts` additions (C1); `db/index.ts` DDL + `columnExists()` ALTER guard (C2); `config/env.ts` new vars (C13); widen `rework_cycles.source_gate` union | 1 | — |
| **3** | **PM scope-lock gate (Step 2)** | `src/scope/{verdict,packet,gate,watchdog}.ts` (B2); `ado/work-item.ts` patch builders (C5); `auditor/worker.ts` stop-auto-unlock (C4); `accept/breaker.ts` union widening (C7); router scope verdict + `In Dev` guard (C6-i, C6-ii); `index.ts` scope watchdog (C14) | 1, 2 | 4, 5 |
| **4** | **L7 evidence index extension** | `deploy/evidence-index.ts` L1–L6 → L1–L7 (C9); generate rows from taxonomy; nullable `l7_summary` handling; two-phase upsert contract; keep deprecated `compileL1L6EvidenceIndex` alias | 1, 2 | 3, 5 |
| **5** | **Prod smoke runner (Step 8)** | `src/deploy/smoke.ts` (B3) reusing `sandbox/runner.runCommand` + `qa/runner` primitives + two-strike filter; `deploy/worker.ts` sequencing smoke→telemetry (C8); fail-closed on missing `PRODUCTION_SMOKE_URL`; L6 smoke evidence comment | 1, 2 | 3, 4 |
| **6** | **Retro takeaways + runbook (Step 9) → L7** | `learn/retro.ts` + `learn/runbook.ts` (B4); `learn/harvester.ts` + `learn/types.ts` extension (C10); `learn/publisher.ts` RUNBOOK.md staging (C12); `learn/worker.ts` persist `retro_records` + re-compile index (C11) | 2, 4, 5 | — |
| **7** | **Docs, evidence copy & matrix realignment** | `formatEvidenceIndexComment` copy ("nine steps / five columns / seven levels"); PROJECT.md + REQUIREMENTS.md alignment; end-to-end test walking one ticket `New` → `Done` → L7; assert L1–L7 all non-null after retro | 1–6 | — |

**Critical path:** 1 → 2 → 4 → 6 → 7. Phases 3 and 5 hang off phase 2 and can run concurrently with 4 and each other, which is where the schedule compression lives.

**Suggested wave plan for the roadmapper:**
- **Wave A (serial):** Phase 1, then Phase 2.
- **Wave B (3-way parallel):** Phase 3 (scope gate) · Phase 4 (L7 index) · Phase 5 (smoke runner).
- **Wave C (serial):** Phase 6 (retro) — needs both 4 and 5.
- **Wave D (serial):** Phase 7 (docs + end-to-end proof).

---

## Confidence Assessment

| Area | Confidence | Basis |
|---|---|---|
| 8 → 5 directory mapping | **HIGH** | Full `src/` tree enumerated (65 files); every stage-to-dir binding read in source |
| New components (scope, smoke, retro, L7 tables) | **HIGH** | Each is a structural clone of a module read in full (`accept/`, `qa/runner.ts`, `plan/watchdog.ts`, `learn/generator.ts`) |
| Modified components + line-level targets | **HIGH** | All 12 modified files read; line numbers cited from the actual current source |
| Migration strategy | **HIGH** | Verified absence of `drizzle.config.*` and `migrations/`; verified the `sqlite.exec` DDL block at `db/index.ts:22-184`; SQLite `ALTER TABLE ADD COLUMN` limitation is documented behaviour |
| Build order / dependencies | **HIGH** | Derived from actual import graph + data production/consumption order |
| PM gate fits webhook + verdict + breaker pattern | **HIGH** | `ingress/routes.ts` bot-shield/dedup path, `accept/verdict.ts` token classifier, and `accept/breaker.ts` `sourceGate` parameterisation all read directly |
| Smoke runner fits execa sandbox + telemetry pattern | **HIGH** | `sandbox/runner.ts:84-127`, `qa/runner.ts:36-224`, `deploy/telemetry.ts:114-176` all read directly |
| ADO org permits the tag-based scope gate without process-template changes | **MEDIUM** | No ADO instance available to verify. Strong in-repo precedent (5 existing tag-mediated gates), but org policy could restrict tag writes or require a real state. **Flag for phase-3 research/validation.** |
| Prod smoke egress allowance acceptable under the security posture | **MEDIUM** | The sandbox is designed for restricted egress (`sandbox/runner.ts` env whitelist). A prod smoke runner needs outbound reach to `PRODUCTION_SMOKE_URL`. Architecturally sound, but a security-review item. **Flag for phase-5 research.** |
| Two-phase evidence-index compile is acceptable UX (two comments on the work item) | **LOW** | Design choice, not a technical constraint. Mitigation offered in Pattern 3. **Flag for phase-4 discussion with the user.** |

---

## Gaps / open questions for phase-level research

1. **ADO process-template permissions** — can the bot write arbitrary tags to `Ready to Dev` work items in the target org, and are there existing tags that would collide with `[awaiting-scope-lock]` / `[scope-locked]`? Verify in Phase 3.
2. **Where does the PM get notified?** The scope packet is posted as a work-item comment. Is that sufficient, or does Step 2 need an @mention / assignment change (`System.AssignedTo`) to actually reach a PM? ADO REST supports both; the repo currently uses neither for notifications. Decide in Phase 3.
3. **Smoke suite authorship** — `SMOKE_TEST_COMMAND` implies a checked-in suite. Does it live in the target repo (agent-authored, versioned with the code) or in the orchestrator (centrally maintained)? The former fits the existing worktree model; the latter fits the "prod credentials never enter the code sandbox" security posture. Decide in Phase 5 — this materially changes whether the smoke runner needs a worktree at all.
4. **Runbook destination** — `RUNBOOK.md` staged into `.claude/skills/<name>/` alongside `SKILL.md`, or into a top-level `runbooks/` tree? Affects `learn/publisher.ts:73-75` only. Decide in Phase 6.
5. **Does Step 9 need a human gate?** `.idea/v2.md:40` assigns Step 9 to "AI Agent **& Team**", and `:51` lists it under *Automation / Pipeline Trigger* (not *Human Verdict Gate*). Read strictly: no new human verdict at Step 9 — the existing skills-PR human merge ◆ is the gate. Confirm before Phase 6, since adding a retro verdict would require a fourth token channel.
6. **L2/L4 hardcoding debt** — `evidence-index.ts:95-98,106-109` fabricate L2 and L4. Out of v2.0 scope as written, but Phase 4 touches those exact lines. Decide explicitly whether to leave them or wire them to `ado/policy.ts:verifyBranchPolicies` (which already returns `l2ReviewersPassed`, `l3BuildPassed`, `l4SecurityPassed` and is currently only consumed by `ingress/pr-router.ts:153`).

---

## Sources

**Primary (read directly, HIGH confidence):**
- `.idea/v2.md` — authoritative 5-column / 9-step / L1–L7 model, actor roles, governance hand-offs
- `.planning/PROJECT.md` — "Current Milestone: v2.0", target features, constraints, key decisions
- `.planning/ROADMAP.md:7-24` — v1.0 authoritative ADO state matrix (note: table is corrupted with leaked phase-status fragments; see C15)
- `.planning/milestones/v1.0-research/ARCHITECTURE.md` — v1.0 component boundaries, FSM matrix, isolation model
- `src/` (65 files) — specifically: `db/schema.ts`, `db/index.ts:22-184`, `execute/router.ts:55-239`, `auditor/worker.ts:60-64`, `accept/verdict.ts`, `accept/breaker.ts:10-12`, `ingress/routes.ts:31-194`, `ingress/bot-shield.ts`, `ingress/pr-router.ts`, `ado/work-item.ts:87-100,219-241`, `deploy/worker.ts:37-213`, `deploy/telemetry.ts:24-176`, `deploy/evidence-index.ts:13-241`, `deploy/packet.ts`, `qa/worker.ts`, `qa/runner.ts:36-224`, `sandbox/runner.ts:84-127`, `test-runner/executor.ts`, `learn/{worker,harvester,generator,publisher,types}.ts`, `plan/watchdog.ts:10-111`, `config/env.ts`, `index.ts`

**Secondary (documented behaviour, HIGH confidence):**
- SQLite `ALTER TABLE ADD COLUMN` — no `IF NOT EXISTS` support; `PRAGMA table_info(x)` is the standard existence check
- SQLite WAL concurrency — one writer, many readers (matches PROJECT.md queue/persistence decision)

---
*Architecture research for: Agentic SDLC Workflow — milestone v2.0 (Golden Path v2 restructure)*
*Researched: 2026-09-16*
