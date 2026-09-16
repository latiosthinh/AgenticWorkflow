# Stack Research — Milestone v2.0 Delta (Golden Path v2)

**Domain:** Autonomous SDLC orchestration on Azure DevOps (Node.js 24 + TypeScript, locked stack)
**Researched:** 2026-09-16
**Confidence:** HIGH — all claims verified against installed tree (`npm ls --depth=0`) and shipped v1.0 source; no training-data-only assertions

> **Scope:** v2.0 delta ONLY. The v1.0 stack (Fastify, better-sqlite3 + Drizzle, Vercel AI SDK, MCP, execa, simple-git, pino, zod) is shipped, installed, and unchanged. Historical rationale: `.planning/milestones/v1.0-research/STACK.md` — do not re-research.

## Verdict: ZERO New Dependencies

All five v2.0 capabilities are fully covered by the 17 installed runtime deps + 7 dev deps. Every capability has a shipped v1.0 code pattern to clone. Nothing in the v2 model (5 columns / 9 steps / L1–L7) requires a library that is not already in `package.json`. The only `package.json` change in v2.0 should be **new zod-validated env vars** (`src/config/env.ts`), not new packages.

## Capability → Existing-Library Map (the core answer)

| v2.0 Capability | Covering Libraries (installed version) | Shipped v1.0 Pattern to Clone | Exact Integration Point |
|---|---|---|---|
| **1. Taxonomy restructure** (8 stages → 5 cols / 9 steps, actors ⚡/👤) | TypeScript `7.0.2` only — pure refactor, zero deps | Static state-routing table | `src/execute/router.ts` (its `ponytail:` comment already flags "make dynamic via pluggable pipeline plugins in v2" — restructure the if/else chain into a column/step-keyed table here); state matrix + docs in `.planning/ROADMAP.md` |
| **2. L7 Continuous-Feedback evidence** | `drizzle-orm@0.45.2` (`sqliteTable`), `drizzle-kit@0.31.10` (dev, migration gen), `sanitize-html@2.17.7` | `telemetryEvaluations` table (`src/db/schema.ts:161`) + `compileL1L6EvidenceIndex` (`src/deploy/evidence-index.ts`) | `src/db/schema.ts`: add `retroRecords`/`l7Evidence` table + `l7Summary` TEXT column on `evidenceIndices` (additive `ALTER TABLE ADD COLUMN` — safe under WAL, no data migration). `src/deploy/evidence-index.ts`: extend summary interface + HTML table L1–L6 → L1–L7 |
| **3. PM scope-lock gate** (REFINEMENT Step 2, 👤 Human) | `azure-devops-node-api@17.0.0` (JSON Patch state/tag/comment), `fastify@5.12.3` + `fastify-raw-body@6.0.1` (HMAC webhook), `drizzle-orm@0.45.2` (gate table), `zod@4.5.4` | **Three shipped patterns compose:** (a) token verdict detection `src/accept/verdict.ts` (`[approve-acceptance]` → clone as `[approve-scope]`/`[reject-scope]`); (b) hold-state row `planCheckpoints` table (status enum + `remindedAt`/`escalatedAt`); (c) timeout watchdog `src/plan/watchdog.ts` (24h ping / 72h escalate) | `src/auditor/worker.ts:60` — on audit pass, **stop calling `transitionToReadyToDev`**; instead tag `[awaiting-scope-lock]` + post L1 packet with scope-boundary checklist, insert `scopeGates` row. PM verdict arrives via existing webhook/poller → router dispatches transition to `Ready to Dev` |
| **4. Prod smoke suite** (RELEASE Step 8, ⚡, L6) | **Native `fetch`** (Node 24, undici-based — HTTP probes), `execa@10.0.1` via `runCommand` (scripted suite subprocess, env-scrubbed), `drizzle-orm@0.45.2` (`smokeRuns` table), `zod@4.5.4` (env config), `p-queue@9.3.3` (throttle if parallel probes) | `checkStagingHealth` (`src/qa/runner.ts:36` — fetch + AbortController, exact HTTP-probe shape needed) and `runQaSuite`/`executeTwoStrikeQaFilter` (execa suite runner + flake filter) | New `src/deploy/smoke.ts` beside `telemetry.ts`; wire into `processTelemetryEvaluation` (`src/deploy/worker.ts:85`) — run smoke **before/alongside** the telemetry window, same fail-closed contract (no smoke evidence → no `Done` transition) |
| **5. Retro output** (RETRO Step 9, ⚡+👤, L7) | `ai@7.0.93` + `@ai-sdk/openai@4.0.60` (`generateObject` structured takeaways), `zod@4.5.4` (output schema), `marked@18.0.12` + `sanitize-html@2.17.7` (RETRO.md / runbook rendering → ADO comment), `simple-git@3.36.0` (publish PR), `drizzle-orm@0.45.2` (L7 rows) | Entire `src/learn/` pipeline: `harvester.ts` (collect lifecycle) → `generator.ts` (markdown emit) → `publisher.ts` (`stageAndPublishSkillPr`) → `skillsPrs` row → ADO comment. `src/auditor/evaluator.ts:1` for the `generateText` + `Output.object(zodSchema)` AI pattern | Extend `src/learn/`: harvester adds rework-bounce/QA-flake/telemetry-breach/smoke-result inputs; generator emits RETRO.md + runbook delta **in the same skills PR** (preserves the human-merge prompt-injection guard — Out of Scope: direct-commit skill updates); worker inserts L7 evidence row + links `skillsPrs` |

## New Env Vars (zod `EnvSchema`, `src/config/env.ts`) — the only "additions"

| Var | Type | Capability |
|---|---|---|
| `SMOKE_TEST_COMMAND` | `z.string().default('npm run test:smoke')` | 4 — mirrors existing `QA_TEST_COMMAND` |
| `SMOKE_TARGET_URL` | `z.string().url()` (required when `NODE_ENV=production`) | 4 — closes the `ponytail:` hole flagged at `src/qa/runner.ts:41` |
| `SMOKE_TIMEOUT_MS` | `z.coerce.number().default(120_000)` | 4 — mirrors `QA_TIMEOUT_MS` |
| `SCOPE_GATE_REMIND_HOURS` / `SCOPE_GATE_ESCALATE_HOURS` | `z.coerce.number().default(24/72)` | 3 — mirrors watchdog constants |
| `RETRO_ENABLED` (optional kill-switch) | `z.coerce.boolean().default(true)` | 5 |

## What NOT to Add (explicit anti-list for roadmapper)

| Avoid | Why NOT needed | Use Instead (installed) |
|---|---|---|
| `axios` / `got` / `superagent` / bare `undici` | Native `fetch` on Node 24 is stable, undici-powered, already the codebase convention in 2 shipped places (`checkStagingHealth`, `queryAzureMonitorMetrics`) with AbortController timeouts | Native `fetch` + `AbortController` |
| `playwright` / `puppeteer` | v2.md Step 8 says "automated smoke test logs" — HTTP-level probes + scripted suite cover L6. Browser-journey E2E is a QA-column concern (Step 6, human 👤), explicitly not v2.0 scope; huge binary dep + sandbox complexity | `fetch` probes + `execa` running the repo's own smoke script |
| `p-retry` / `async-retry` / `exponential-backoff` | Smoke/fetch retry is a 5-line loop; adds a dep for one call site | Hand-rolled backoff loop (mark with `ponytail:` ceiling comment) |
| `node-cron` / `croner` / `agenda` | Smoke is **event-driven** (deploy webhook → worker), not scheduled. PM-gate pings reuse the existing watchdog poll pattern | `src/plan/watchdog.ts` pattern + existing `src/ingress/poller.ts` interval |
| `@ai-sdk/anthropic` | Listed in v1 research but **never installed** — v1.0 shipped on `@ai-sdk/openai` alone and 277 tests pass. Retro takeaway summarization is a cheap structured-output task; no model-routing requirement in v2.0 scope | `@ai-sdk/openai@4.0.60` (`generateObject` + zod), same as auditor |
| `bullmq` / `redis` / `temporal` | Rejected in v1, still rejected: smoke + scope-gate + retro jobs are rows in the same SQLite (WAL) lease/dedup tables | `dedupEvents` + lane queue (`src/queue/lane-manager.ts`) + `p-queue` |
| `markdown-it` / `remark` / `unified` | `marked@18.0.12` already renders ADO comments in 4 shipped files | `marked` + `sanitize-html` |
| New state-machine lib (`xstate`, `zod` statecharts, etc.) | Router is a 240-line static table; v2 restructure is a rename/reshape of that table, not a reason to adopt a framework | Plain TS discriminated unions keyed by column/step |
| `drizzle-zod` / schema-codegen extras | Env + AI-output validation already hand-rolled with `zod` in shipped patterns; consistency beats convenience here | `zod@4.5.4` directly |

**Rule for phase planners:** if a plan proposes `npm install <anything>` for v2.0, it must carry a hard written justification against this table — default is reject.

## Core Technologies (v2 delta roles — all already installed)

| Technology | Installed Version | v2.0 Role | Why It Covers the Delta |
|---|---|---|---|
| TypeScript | `7.0.2` | Taxonomy restructure (capability 1) | 5-col/9-step model = types + routing table refactor; compiler is the migration tool |
| drizzle-orm | `0.45.2` | L7 schema, `scopeGates`, `smokeRuns`, `retroRecords`, `evidenceIndices.l7Summary` | 4 new tables/columns, all cloned from shipped table patterns; additive SQLite migrations under WAL |
| drizzle-kit | `0.31.10` (dev) | Migration generation | `npx drizzle-kit generate` — existing workflow, no change |
| azure-devops-node-api | `17.0.0` | PM scope-lock transitions, smoke/L7 evidence comments | JSON Patch (`Operation.Replace` `/fields/System.State`, tags, `/fields/System.History`) — identical calls to v1.0 gates |
| ai + @ai-sdk/openai | `7.0.93` / `4.0.60` | Retro takeaway synthesis (capability 5) | `generateText` + `Output.object(zodSchema)` — exact `auditor/evaluator.ts` pattern |
| execa (via `runCommand`) | `10.0.1` | Scripted smoke-suite subprocess (capability 4) | `src/sandbox/runner.ts` already gives timeout, SIGTERM/SIGKILL cascade, env scrubbing, secret redaction, 50KB output cap — smoke runner inherits the whole security posture for free |
| Native fetch | Node 24 built-in | HTTP smoke probes (capability 4) | Two shipped precedents with AbortController timeouts; fail-closed on non-2xx |
| zod | `4.5.4` | New env vars, smoke-config parsing, retro output schema | Single validation lib across all 3 new surfaces |
| marked + sanitize-html | `18.0.12` / `2.17.7` | RETRO.md / runbook rendering, L7 ADO comment | Existing allowlist-tag comment pattern in `evidence-index.ts` / `telemetry.ts` |
| simple-git | `3.36.0` | Retro/runbook PR publishing | Extend `stageAndPublishSkillPr` to include extra files in the same branch/PR |
| fastify + fastify-raw-body | `5.12.3` / `6.0.1` | PM verdict ingress (comment/state-change webhooks) | HMAC-verified route + bot-shield + dedup already handle ADO comment events |
| p-queue | `9.3.3` | Throttle parallel smoke probes / retro jobs | Existing lane-manager convention |
| pino | `10.3.1` | Structured logs for new workers | Unchanged |

## Stack Patterns by Variant (decision rules for plans)

**Smoke = HTTP probes only (health, key endpoints, version endpoint):**
- Native `fetch` + `AbortController` (clone `checkStagingHealth`), persist to `smokeRuns`. No subprocess.

**Smoke = repo-owned scripted suite (`npm run test:smoke` / Playwright-inside-the-target-repo):**
- `runCommand(binary, args, { cwd, timeoutMs }, knownSecrets)` from `src/sandbox/runner.ts` — never `child_process.exec`, never string-interpolated shell (v1 anti-pattern #3 still applies: ADO ticket text must not reach a shell string).

**PM gate verdict source:**
- Prefer the shipped comment-token convention (`[approve-scope]` / `[reject-scope]`, cloned from `accept/verdict.ts`) — zero ADO admin config. State-transition-only detection (e.g. custom `Scope Locked` state) requires ADO process customization per project; support it as a secondary condition, not the primary. The `verdict.ts` `ponytail:` note ("structured webhook payload parser in v2") is optional polish, not a blocker.

**L7 evidence write path:**
- Retro row inserted by `learn/worker.ts` at PR-publish time (status `pending_review`), upgraded to `merged` when the skills PR merges (existing `skillsPrs.status` flow) — L7 "evidence" is only *final* after human merge, preserving the prompt-injection persistence guard.

**Evidence index extension:**
- Rename `compileL1L6EvidenceIndex` → `compileEvidenceIndex` (L1–L7) in one commit with the schema migration; `l7Summary` nullable-tolerant (default "retro pending") so in-flight v1 tickets at cutover don't crash the index compile.

## Version Compatibility (verified via `npm ls --depth=0`, 2026-09-16)

| Package A | Compatible With | Notes |
|---|---|---|
| `drizzle-orm@0.45.2` | `better-sqlite3@13.0.3`, `drizzle-kit@0.31.10` | Shipped combo; additive migrations (`ADD COLUMN`, `CREATE TABLE`) safe under WAL, no rebuild |
| `ai@7.0.93` | `@ai-sdk/openai@4.0.60`, `zod@4.5.4` | `Output.object()` structured output verified in shipped `auditor/evaluator.ts` |
| `execa@10.0.1` | Node 24 (host `v24.0.2`) | ESM-only; project is `"type": "module"` — consistent |
| `vitest@5.0.0` | `tsx@4.23.13`, TypeScript `7.0.2` | 277 v1 tests green on this combo; new workers follow existing test conventions |
| `marked@18.0.12` | `sanitize-html@2.17.7` | marked→HTML→sanitize pipeline shipped in 4 files |
| Node 24 native `fetch` | — | Stable (undici); AbortController timeout pattern shipped twice |

No new packages → no new compatibility surface. Do not opportunistically bump majors mid-milestone.

## Installation

```bash
# v2.0 requires NO npm install. Verify tree instead:
npm ls --depth=0
# New tables/migrations only:
npx drizzle-kit generate   # after editing src/db/schema.ts
```

## Alternatives Considered (for the one genuinely arguable call)

| Recommended | Alternative | When Alternative Wins |
|---|---|---|
| Native `fetch` for smoke probes | `undici` direct (Agent, pooling, `request()`) | Only if smoke needs connection-pool tuning, HTTP/2, or per-request proxying at scale — a 5-probe suite does not. Revisit if smoke grows to 100s of endpoints |
| Comment-token PM verdict | Custom ADO state (`Scope Locked`) + state-transition detection | Orgs that already customized their ADO process and want board-column visibility of the gate; support as secondary condition |
| `@ai-sdk/openai` for retro synthesis | Deterministic template-only retro (no LLM), like `evaluateDoDDeterministically` fallback | If retro takeaways prove low-value/noisy, drop the LLM call and keep template output — the `ponytail:` offline-baseline convention already exists in 4 modules |
| SQLite lease tables for smoke/retro jobs | `p-queue` in-memory only | Never for these paths — crash-resilience requirement (v1 decision) means persisted rows first, queue second |

## Sources

- Installed tree: `npm ls --depth=0` on host, 2026-09-16 (HIGH — direct verification; versions listed above are actuals, not ranges)
- v1.0 shipped patterns: `src/auditor/worker.ts`, `src/accept/verdict.ts`, `src/deploy/worker.ts`, `src/deploy/telemetry.ts`, `src/deploy/evidence-index.ts`, `src/qa/runner.ts`, `src/sandbox/runner.ts`, `src/plan/watchdog.ts`, `src/learn/*`, `src/db/schema.ts`, `src/config/env.ts`, `src/execute/router.ts` (HIGH — read in full this session)
- v2 model: `.idea/v2.md` + `.planning/PROJECT.md` "Current Milestone: v2.0" (HIGH — authoritative)
- v1.0 stack research (context only): `.planning/milestones/v1.0-research/STACK.md` (HIGH)
- Node fetch/AbortController stability on Node 24: two shipped production call sites in this repo + Node 24 release status (HIGH)

---
*Stack research for: Agentic SDLC Workflow — milestone v2.0 delta (5 columns / 9 steps / L1–L7)*
*Researched: 2026-09-16 — verdict: zero new dependencies*
