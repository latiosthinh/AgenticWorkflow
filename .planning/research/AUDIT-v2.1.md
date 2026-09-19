# Full Project Audit — 2026-09-19 (source for milestone v2.1)

**Scope:** idea/solution/implementation/features/codebase. Verified live: 462/462 tests pass, `tsc --noEmit` clean, 84 src files, 48 test files.
**Verdict:** orchestration/persistence/gating real and solid; AI core partially hollow; one CRITICAL security chain; uncommitted WIP degrades governance gates.

**User decisions locked (2026-09-19):**
- Milestone = v2.1 (fix/hardening, no new features).
- Agent core = **opencode-only**: delete built-in no-op path, make `LOCAL_AGENT_TYPE=opencode` required; MCP dead-wiring resolved (wire into opencode path or delete); evidence must reflect real runs.
- WIP = **commit-forward**: first phase adds tests + gate-safe fallbacks to the uncommitted diff (provider 9router hack, evaluator/planner LLM fallbacks, opencode plan-skip), then commits.
- Research skipped (findings already evidence-backed).

---

## CRITICAL

- **C1. Injection-to-secret-theft chain** — raw ticket text (title/description/AC) un-isolated into `runOpenCode` (`--auto`, autonomous host shell) (`src/execute/worker.ts:84-91`); `run_test` tool executes any binary, no allowlist (`src/mcp/tools/common.ts:52-54`); worktree under repo root → `cat ../../.env` yields ADO_PAT/API_KEY; exfil via curl/git push from same unrestricted process. `sanitizeEnv` covers env, not filesystem.
  **Fix:** XML-isolate + escape ticket content in opencode prompt (reuse `escapeXml` from `src/auditor/prompt.ts:7` + `<user_ticket_input>` pattern + SECURITY BOUNDARY directive); allowlist `run_test` commands (e.g. `npm test`/`npx vitest` argv patterns); move `.env` outside repo root OR deny agent file reads outside worktree (path-containment in run_test/read_file + opencode cwd jail).

## HIGH — Security

- **H1. Planner prompt injection** — raw `title/description/acceptanceCriteria` interpolated, no delimiters/escape (`src/plan/planner.ts:49-57`). Injection can force `hasAmbiguities:false`, bypassing human Plan-Q&A checkpoint. Fix: same isolation pattern as auditor.
- **H2. No actor authorization on verdict gates** — `[approve-scope]`/`[approve-acceptance]` comment tokens accepted from any ADO user (`src/scope/verdict.ts:37-46`, `src/accept/verdict.ts:25-27`); `revisedBy` recorded (`src/scope/gate.ts:224`) but never checked. Fix: allowlist env (`APPROVER_IDS` per gate or shared), reject + log non-allowlisted tokens.
- **H3. 10 unsanitized inline ADO comments** — raw subprocess output / package names / diagnostics posted to History without sanitize-html AND without `<!-- [automated-agent] -->` loop-shield marker (`src/execute/worker.ts:96,159,172,187,219`; `src/execute/rework-worker.ts:146,169,211,226,242,276`). Marker-less bot comments escape thread filters (`src/ado/threads.ts:55`). Fix: route through sanitizing formatter with marker.
- **H4. Push-failure swallowed unconditionally** — `src/execute/worker.ts:267-271` (comment claims test-env-only but not gated on NODE_ENV); also `src/execute/repair.ts:71-75`. Result: branch never on remote, L3 recorded, Dev Done, PR against nonexistent branch. Fix: gate on NODE_ENV=test only; production push failure → Blocked + dedup failed.

## HIGH — Hollow core (resolution: opencode-only per user decision)

- **H5. Built-in agent codes nothing** — default `LOCAL_AGENT_TYPE='built-in'` (`src/config/env.ts:16`) runs guards, records L3, transitions Dev Done with zero edits (`src/execute/worker.ts:82-109`); `createCoderTools` never called in prod (`src/execute/coder.ts:39`); same hole in rework (`src/execute/rework-worker.ts:128-161`). **Delete built-in path; `opencode` required (fail-fast config validation).**
- **H6. Repair loop production stub** — `src/execute/repair.ts:51-57`: re-runs identical tests ≤5× with no edit between cycles. Fix: opencode path delegates repair to opencode re-run with failure context; delete or honestly no-op the built-in stub (no evidence recorded for repairs that didn't happen).
- **H7. MCP subsystem dead-wired** — session created, tools never passed to model, closed before pipeline (`src/execute/worker.ts:392-401,440,469`); all `src/mcp/*` runtime-dead. Fix: delete `src/mcp/` tree OR wire registry tools into opencode invocation; decide in phase planning (lazy default: delete, opencode has own tools).
- **H8. Fabricated evidence defaults** — router step-4 fabricates `{suite:'vitest',totalTests:1,passed:1}` when no L3 (`src/execute/router.ts:208-214`); evidence-index defaults L2/L4 constants, errorRate `'0.05%'`, p95 `145` (`src/deploy/evidence-index.ts:169-193`); QA hardcodes `commitSha='main'` (`src/qa/worker.ts:65`). Fix: fail-closed everywhere — missing evidence blocks transition (extend `MissingEvidenceError` pattern); real commit SHA via `git rev-parse HEAD` in worktree.

## MEDIUM — Reliability

- **M1. Tag-wipe on ADO fetch failure** — catch → `tags=''` → Replace patch erases all ticket tags on transient error (`src/scope/gate.ts:249-257`, also `:131-137,:276-283`). Fix: abort/retry on fetch failure; never Replace with partial tag set.
- **M2. No LLM/ADO timeouts** — `generateText` without abortSignal (`src/auditor/evaluator.ts:155-162`, `src/plan/planner.ts:60-78`); `customStreamFetch` no timeout (`src/ai/provider.ts:27-31`); ADO REST no request timeout. Fix: LLM_TIMEOUT_MS abortSignal; fetch wrapper timeout.
- **M3. Failed dedup never retried** — marker blocks redelivery even when status=failed (`src/state/store.ts:346-359`, `src/ingress/routes.ts:136-140`); crashed processing = lost ticket. Fix: requeue path — failed markers allow one redelivery retry (or watchdog sweep re-dispatches failed).
- **M4. Poller O(all items)/10s** — WIQL no state filter, no `$top`, per-item `getWorkItem` outside `withRetry` (`src/ingress/poller.ts:8,34-48`). Violates CLAUDE.md rate-limit constraint. Fix: WIQL state filter (non-terminal states) + `$top` + changed-date window + route through `withRetry`.
- **M5. Publisher shared-repo race** — skills PR staging checkout/branch-switch in `process.cwd()` outside lanes (`src/learn/publisher.ts:96-122`); concurrent retros race; crash leaves repo on skills branch. Fix: dedicated worktree or repo-wide lock/mutex for publisher.
- **M6. QA worktree fallback to cwd** — attach failure → silently tests orchestrator's own repo, results attributed to ticket (`src/qa/worker.ts:76-77`). Fix: fail-closed — Blocked + `[qa-harness-error]`, never cwd fallback.
- **M7. LLM fallback silently downgrades evidence** — evaluator keyword-rubric fallback + planner boilerplate fallback not recorded; audit log hardcodes `model:'gpt-4o'` (`src/auditor/worker.ts:84,116`). Fix: record `fallbackUsed:true` + actual model in evidence; planner fallback parks for human (`hasAmbiguities:true`) instead of auto-proceed.
- **M8. Unhandled-rejection window** — fire-and-forget `runInLane` post-202 (`src/ingress/routes.ts:83-101,146-155`, `src/ingress/poller.ts:58-66`); inner catch can throw (`store.ts:368-373`); no `process.on('unhandledRejection')`. Fix: `.catch()` terminal handlers + process-level hook in `src/index.ts`.
- **M9. PR dedup 32-bit collision** — key = first 32 bits of payload hash (`src/ingress/routes.ts:64-65`); distinct PR events can collide → silent drop. Fix: full sha256 hex.
- **M10. Repair loop skips knownSecrets scrubbing** — `executeRepairLoop` called without `knownSecrets` (`src/execute/worker.ts:209-214`, `src/execute/rework-worker.ts:266-271`) while QA/smoke pass them (`src/qa/runner.ts:90`, `src/deploy/smoke.ts:162-167`); `SENSITIVE_VALUE_PATTERN` misses unprefixed ADO PATs (`src/sandbox/runner.ts:7`). Fix: pass knownSecrets consistently.
- **M11. learn/prompt.ts content not XML-escaped** — `</learning_source_context>` in ticket text escapes containment (`src/learn/prompt.ts:25-43`); `escapeXml` exists but unused there. Also `src/ado/formatter.ts:68-74` PR description embeds raw title/AC (forged evidence text possible); `src/scope/gate.ts:289` raw `<p>${feedback}</p>`, `:260` raw actor displayName. Fix: escape/sanitize all four.
- **M12. win32 crash-atomic gaps** — no fsync before rename (power-loss empty file); `.bak.*` orphans in tickets dir, purge covers dedup dir only (`src/state/store.ts:39-85,408-432`). Fix: fsync fd before rename; extend purge to tickets `.bak.*`/`.tmp.*`.
- **M13. Config traps** — `ENABLE_ADO_POLLING: z.coerce.boolean()`: `=false` enables (`src/config/env.ts:35`); `ADO_PROJECT`/`ADO_REPOSITORY_ID` defaults `'default-project'`/`'default-repo'` silently misroute PRs (`:19-20`; poller guards, router doesn't `src/execute/router.ts:234-235`). Fix: explicit boolean parse (`'true'/'1'` only); make project/repo required (no defaults).
- **M14. Mock seams unguarded in prod** — 7 `mock*` option fields (`src/deploy/worker.ts:33-47` etc.); `mockSmokeResult` in production fabricates L6 evidence. Fix: throw if any `mock*` present when `NODE_ENV==='production'`.
- **M15. `.env.example` stale** — v1 `DATABASE_PATH` (`:3`), missing ~20 v2 vars (STATE_STORE_DIR, ADO_PROJECT, ADO_REPOSITORY_ID, ADO_DEFAULT_BRANCH, PREVIEW_URL_TEMPLATE, PR_URL_TEMPLATE, QA_TEST_COMMAND, STAGING_HEALTH_URL, QA_TIMEOUT_MS, PRODUCTION_SMOKE_URL, SMOKE_*, AZURE_APP_INSIGHTS_*, TELEMETRY_*, ENABLE_ADO_POLLING, ADO_POLLING_INTERVAL_MS, LOCAL_AGENT_TYPE, OPENCODE_BIN, OPENCODE_TIMEOUT_MS, API_ENDPOINT/API_KEY...). Fix: regenerate from EnvSchema.

## LOW / Quality

- **L1. Circular deps ×4 through `src/ado/work-item.ts` hub** (↔ `test-runner/evidence.ts:5`, `accept/packet.ts:3`, `accept/breaker.ts:3`, `scope/gate.ts:4`). Fix: extract `buildTagPatch` → shared `src/ado/patch.ts`.
- **L2. God-files** — `src/deploy/smoke.ts` 615 LOC/6 responsibilities; `src/execute/worker.ts` 507. Two-strike filter duplicated (`src/qa/runner.ts:133-231` vs `src/deploy/smoke.ts:379-615`); `parseSmokeFailures` re-implements `src/test-runner/parser.ts`. Fix: extract shared two-strike module + smoke parser reuse; split step-4 inline logic out of `router.ts:194-240`.
- **L3. Dead code** — `src/cli/ado.ts` (unwired, v1 state vocabulary `:86-91`, WIQL interpolation `:36`, untested); dead exports `createCoderTools`, `compileL1L6EvidenceIndex`+alias tests (`deploy-orchestrator.test.ts:161`), `transitionToReadyToDev` (`work-item.ts:179`), `getStepsByColumn`/`getStepsByAdoState` (`taxonomy.ts:216,220`), `registerPullRequestHandler` (`routes.ts:24`); deps `pino` (never imported), `@fastify/sensible` (registered `index.ts:28`, API unused); `done→step9` route always "no active handler" (`router.ts:152-257` vs `taxonomy.ts:204-206`); `src/state/test-harness.ts` ships into dist. Fix: delete-or-wire each; `cli/ado.ts` decision (wire as bin script with v2 vocabulary + tests, or delete); drop unused deps; remove test-harness from build (`tsconfig` exclude or move to tests/).
- **L4. Silent degradation catches** — `router.ts:78-80` (prev-rev lookup fail → token-only verdicts), `pr-router.ts:85-87` (details fail → rework at revId=1), `qa/worker.ts:206-208` (rework dispatch fail logged only), `store.ts:387-389` (dedup status collision swallowed). Fix: record degradation in state/evidence, retry or flag.
- **L5. Lane boilerplate ×10 redundant** — manual `laneContext.getStore()?.workItemId===id` checks though `runInLane` reentrant (`src/queue/lane-manager.ts:19-22`); `clearLane` zero prod callers → lanes Map unbounded (`lane-manager.ts:7,27`). Fix: drop redundant checks; evict idle lanes after drain.
- **L6. Misc** — `pr-router.ts:45-51` regex sanitizer → sanitize-html; `accept/urls.ts:4,12` raw `process.env` → zod env; `bot-shield.ts:12` marker DoS (any user typing `[automated-agent]` suppresses event) → require marker AND bot author id; `diff-guard.ts:93-104` AC-mentioned packages pre-authorized → require plan-listed packages; `pr-router.ts:17-22` PR-title `AB#(\d+)` steers rework target → validate branch-name correlation; `immutability.ts:76-78` `expect(` literal passes hasValidAssertions (post-hoc diff check is real gate — document ceiling); `index.ts:106` 0.0.0.0 no rate-limit on webhook (HMAC only gate) → optional `@fastify/rate-limit`; pino logger no `redact` paths (`index.ts:15-19`) + rest of codebase `console.*` unstructured → add redact config, keep console (lazy).
- **L7. No lint/format tooling; tests excluded from typecheck** (`tsconfig.json:14`); no coverage. Fix: add lint script (oxlint or eslint — zero-config preference), include tests in a typecheck pass.
- **L8. E2E mock-echo gaps** — `tests/e2e-v2-golden-path.test.ts` mocks execute (`:21-25`), PR (`:27-35`), QA (`:37-54`); asserts mock literals (`:256,:315`); no test chains real code-edit → real test-run → real PR through router. Fix: add integration test with real (small) opencode-scripted or fixture-runner chain; keep mocked e2e for routing.
- **L9. Uncommitted WIP issues** (commit-forward phase) — `src/ai/provider.ts` body-rewrite hack (`stream:false`, strip `9router/`) with silent `catch {}`; `evaluator.ts`/`planner.ts` fallbacks bypass Plan-Q&A gate on LLM outage, unrecorded (see M7); `worker.ts` opencode plan-skip kills Plan-Q&A checkpoint for that path (governance regression — decide: keep skip but record "plan delegated to opencode" in L2 evidence, or keep planner call); zero tests for all of it.

## Done well (do not regress)

Timing-safe HMAC fail-closed (`ingress/hmac.ts:17-26`); `wx`-atomic dedup + TTL purge; quadruple path-traversal guards (`store.ts:102-124`, `mcp/tools/common.ts:31-37`, `execute/coder.ts:10-34`, `learn/publisher.ts:76-81`); zero `shell:true`, argv arrays + `extendEnv:false` everywhere; env allowlist scrubbing (`sandbox/runner.ts:15-42`); auditor prompt isolation gold standard (`auditor/prompt.ts:49-50,64-68`); rework envelope XML (`accept/envelope.ts:19-49`); crash-atomic writes + orphan recovery; `OffLaneMutationError` single-writer enforcement; fail-closed prod telemetry/smoke; 13 sanitizing formatters; circuit breakers ≤2 all loops; `withRetry` 429/backoff; watchdog TOCTOU re-verify in-lane; 42 `ponytail:` ceiling comments; real-fs/git tests (27 files temp-dir, vi.mock only 4/48).

## Severity roll-up

| Sev | Count |
|---|---|
| CRITICAL | 1 (chain, 3 fix parts) |
| HIGH | 8 |
| MEDIUM | 15 |
| LOW | 9 groups (~25 items) |
