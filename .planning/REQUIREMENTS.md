# Requirements: Agentic SDLC Workflow — Milestone v2.0 (Golden Path v2)

**Defined:** 2026-09-16 (rev 2 — SQLite removal folded in)
**Milestone:** v2.0 — full restructure to the Golden Path v2 model (`.idea/v2.md`): 5 columns / 9 steps / L1–L7 evidence, **on a file-backed `StateStore` (no database)**.
**Core Value:** Deterministic, evidence-backed delivery across Refinement → Execution → Acceptance → Release → Retro (9 steps), with **L1–L7** evidence, native ADO gates, explicit actor roles (⚡ AI / 👤 Human), and human verdict gates.

**Prior milestone:** v1.0 shipped 2026-09-09 (git tag `v1.0`) — 31 requirements across 8 stages (L1–L6) on SQLite/Drizzle, archived to `.planning/milestones/v1.0-*`. v2.0 builds on it.

**Two locked architecture decisions (post-research):**
1. **Stack:** ZERO *new* dependencies. v2.0 also **removes** `better-sqlite3`, `drizzle-orm`, `drizzle-kit` — state moves to files.
2. **Persistence:** SQLite is **removed**. All orchestrator state lives in a **file-backed `StateStore`** (per-ticket markdown+frontmatter under `data/state/`), safe because the per-work-item lane (`concurrency:1`) serializes writes → single-writer per ticket; ingress dedup uses atomic `wx` create. Workers call a backend-agnostic interface. `ponytail:` ceiling — single orchestrator machine is load-bearing; multi-instance enterprise swaps the `StateStore` impl (e.g. Postgres).

**Research basis:** `.planning/research/SUMMARY.md` (+ its ⚠ DECISION OVERRIDE addendum, which supersedes all SQLite/table/DDL wording in the research). Taxonomy is modeled as **data** (`src/pipeline/taxonomy.ts`) — no v1.0 directory renames.

---

## v2.0 Requirements

### 0. STATE — File-backed StateStore (persistence foundation)

- [x] **STATE-01**: v1.0 SQLite/Drizzle persistence is replaced by a file-backed `StateStore` behind a backend-agnostic interface — per-ticket state collapses the 12 v1.0 tables into ONE markdown+frontmatter file (`data/state/tickets/<id>.md`); every worker reads/writes state ONLY via `StateStore` (no worker touches raw storage); `better-sqlite3`/`drizzle-orm`/`drizzle-kit` removed from `package.json`.
- [x] **STATE-02**: Ingress dedup is atomic and concurrency-safe without a DB — a create-if-absent per-rev marker (`fs.writeFileSync(path,'',{flag:'wx'})`; `EEXIST` ⇒ duplicate, drop) replaces the SQLite PK constraint, with a TTL sweep mirroring the v1.0 7-day purge. Concurrent duplicate `(workItemId,revId)` webhook deliveries produce ZERO duplicate agent dispatches.
- [x] **STATE-03**: The single-writer invariant holds — EVERY ticket-state mutation (workers, watchdog, poller) routes through the per-work-item lane (`concurrency:1`); writes are crash-atomic (temp-file + rename, with rm-then-rename on win32); the invariant is enforced by the `StateStore` API surface + a regression test (a stray direct write, or an off-lane mutation, fails the suite).
- [x] **STATE-04**: File-based operation reaches v1.0 behavioral parity + crash recovery — watchdog/poller scans (`readdir` + frontmatter parse) locate pending/aged items; ticket state files have an archive/TTL lifecycle preventing unbounded growth; the full v1.0 suite (277 tests) is ported from `:memory:` SQLite to per-test `mkdtemp` file dirs and stays green (no regression from the migration).

### 1. TAX — Taxonomy Restructure (5 columns / 9 steps)

- [x] **TAX-01**: System models the Golden Path v2 as a single data-driven source (`src/pipeline/taxonomy.ts`): each of the 9 steps mapped to its column (Refinement/Execution/Acceptance/Release/Retro), actor (⚡ AI / 👤 Human), evidence level (L1–L7), and ADO state — with no v1.0 directory renames (taxonomy is additive metadata over the existing src dirs).
- [ ] **TAX-02**: The ADO state-transition router and the evidence-index stage labels are driven by the v2 taxonomy, and the authoritative state matrix in ROADMAP/docs reflects the 5 columns / 9 steps / L1–L7 model with governance hand-offs.
- [x] **TAX-03**: Taxonomy adoption is behavior-preserving for v1.0 routing — a mapping test asserts all 9 steps resolve column/actor/evidence-level/ADO-state from the taxonomy source, and a v1-lifecycle replay test drives fixture revisions `New → … → Done` asserting identical handler dispatch to v1.0.

### 2. SCOPE — Human PM Scope-Lock Gate (Refinement, Step 2)

- [x] **SCOPE-01**: After the L1 contract audit passes, the system parks the ticket for human PM scope review (`New` state + `[awaiting-scope-lock]` tag — reusing existing ADO states, no new board column), records a pending scope-lock in the ticket's `StateStore` record, and posts a scope-review packet (L1 audit summary + scope-boundary checklist + testability sign-off) — instead of auto-transitioning to `Ready to Dev`.
- [ ] **SCOPE-02**: A human PM renders a scope verdict (👤) detected primarily on state/tag transitions (resilient to the `[automated-agent]` bot-echo shield, with watchdog/poller reconcile for missed verdicts) and secondarily via comment tokens (`[approve-scope]`/`[reject-scope]`/`[reset-scope]`); approve transitions to `Ready to Dev` + writes an L1 scope-lock evidence record to `StateStore`; reject keeps it parked with feedback + a 24h reminder ping (escalate at 72h).
- [x] **SCOPE-03**: The gate cannot be bypassed or deadlocked — a tag/record guard before the audit LLM call prevents re-audit from re-running the transition on a parked ticket (idempotent across revisions), and scope rejections use a refinement counter SEPARATE from the shared rework breaker (never consumes the Accept/PR ≤2 budget).

### 3. EVID — L7 Continuous-Feedback Evidence + Index Extension (L1–L7)

- [ ] **EVID-01**: System persists L7 Continuous-Feedback evidence in the ticket's `StateStore` record (retro section): retro takeaways (with mandatory action items — owner + priority + tracking ref), runbook-diff PR link (or a recorded "no change" auditable negative), skill PR link, and DORA-aligned trend deltas sourced from existing lifecycle state.
- [ ] **EVID-02**: The unified evidence record + index extend L1–L6 → **L1–L7** (an additive `l7` field on the ticket state file — no schema migration, since state is file-backed) and the formatted work-item index comment renders all seven levels.
- [ ] **EVID-03**: L7 is fail-closed — a ticket must NOT reach `Done` without a real persisted L7 record; missing/incomplete L7 throws and blocks the transition (mirrors the L6 telemetry fail-closed gate; no fabricated defaults copied from the v1.0 index's `?? 1` / `|| '0.05%'` precedent).

### 4. SMOKE — Automated Production Smoke-Test Suite (Release, Step 8)

- [ ] **SMOKE-01**: On deployment (Release Step 8), the system runs an automated ⚡ production smoke suite BEFORE the telemetry window (fail-fast, don't burn 30 min on a dead deploy): health probe, deployed version/SHA verification (catches stale-slot swaps telemetry can't see), and critical-path read checks — via native `fetch` and/or sandboxed `execa` (read-only, credential-scrubbed, bounded timeout + egress).
- [ ] **SMOKE-02**: Smoke failures classify INFRA vs APP with a 2-strike flake filter (reusing the QA fingerprint pattern) so a prod blip cannot trigger a false regression; a confirmed APP regression bounces the ticket to `In Dev` with `[deploy-regressed]` + reproduction diagnostics (no auto-rollback — GOV-01 deferred).
- [ ] **SMOKE-03**: Smoke results persist to the ticket's `StateStore` record (smoke section) and feed L6 Prod-Confidence evidence; release confidence requires smoke PASS **and** telemetry-window PASS.

### 5. RETRO — Retro Takeaways, Runbooks & Skill Enhancement (Retro, Step 9)

- [ ] **RETRO-01**: On release confidence (smoke + telemetry pass), the system runs the retro step BEFORE the `Done` transition (awaited, fail-closed per EVID-03): analyzes the ticket lifecycle (rework cycles, review comments, test/smoke fixes, telemetry) and produces retro takeaways with mandatory, tracked action items.
- [ ] **RETRO-02**: Retro emits runbook updates (a `RUNBOOK.md` diff) or a recorded "no change", plus skill enhancement (`SKILL.md`), submitted as a SINGLE PR to the skills repo (never direct-commit; human merge required) with prompt-injection defenses (XML source isolation, escaped frontmatter, meta-directive override denial) — reusing the existing `learn/` publisher path.
- [ ] **RETRO-03**: Retro artifacts (takeaways, runbook-diff PR link, skill PR link, trend deltas) persist as the L7 record (in the ticket's `StateStore` file) that gates `Done`; the ticket transitions to `Done` with the full L1–L7 evidence index and `[golden-path-complete]` tag, while the human PR merge stays async (skills/runbooks affect future runs only after merge, not the current ticket's Done).

---

## Future Requirements (deferred — NOT in v2.0)

### Differentiators (P2/P3, surfaced by research)
- **METRICS-01**: Rolling DORA aggregate dashboards (deferred — Goodhart's-law guard needs care; cross-ticket scan cost on files).
- **SMOKE-04**: Synthetic write-transaction smoke checks (L, deferred — prod-mutation risk).
- **RETRO-04**: Auto-filed retro action work items (deferred — board-spam risk).
- **SCOPE-04**: Scope-drift detection at PR vs locked scope (L, deferred differentiator).

### Enterprise persistence & governance (deferred)
- **STORE-01**: Multi-instance / multi-machine orchestrator — swap the `StateStore` file backend for a shared network store (Postgres) behind the same interface (the `ponytail:` ceiling on the v2.0 file-backed design).
- **MULTI-01**: GitHub Issues / Projects as alternative ticket source.
- **MULTI-02**: Jira Software Cloud webhooks and transitions.
- **GOV-01**: Automated canary traffic shifting with instant rollback on telemetry/smoke alerts.
- **GOV-02**: Multi-tenant cloud runner pool with per-team quotas.

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| New dependencies | Stack locked; v2.0 *removes* `better-sqlite3`/`drizzle-orm`/`drizzle-kit` and adds none (files via `node:fs`). |
| A database (SQLite/Drizzle) | Removed in v2.0 — state is file-backed behind `StateStore`; owner decision (orchestrator = agent layer over checkpoint-markdown). |
| Cross-instance shared state | Deferred (STORE-01); single-orchestrator-machine is load-bearing for the file-backed design. |
| Renaming v1.0 source directories | Churn for zero behavior gain; taxonomy modeled as data instead. |
| New ADO board states/columns | Reuse existing states + tags (`[awaiting-scope-lock]`); no board migration friction. |
| Custom Web Dashboard | ADO Boards is the single pane of glass. |
| Custom CI gate orchestration | Native ADO branch policies enforce L2/L3/L4; system reads status only. |
| Custom deploy approval UI | Native ADO Environments approval gates enforce L5. |
| Unattended production deployments | Human Environment approval (👤) is mandatory. |
| Auto-rollback on smoke/telemetry failure | GOV-01 deferred; v2.0 bounces to `In Dev` for human decision. |
| Direct-commit skill/runbook updates | Learning + retro writes go through PR review (prompt-injection persistence guard). |
| Unbounded autonomous loops | Hard breakers at plan, implement, accept, review, QA, scope. |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| STATE-01 | Phase 1 | Complete |
| STATE-02 | Phase 1 | Complete |
| STATE-03 | Phase 1 | Complete |
| STATE-04 | Phase 1 | Complete |
| TAX-01 | Phase 2 | Complete |
| TAX-02 | Phase 7 | Pending |
| TAX-03 | Phase 2 | Complete |
| SCOPE-01 | Phase 3 | Complete |
| SCOPE-02 | Phase 3 | Pending |
| SCOPE-03 | Phase 3 | Complete |
| EVID-01 | Phase 6 | Pending |
| EVID-02 | Phase 4 | Pending |
| EVID-03 | Phase 4 | Pending |
| SMOKE-01 | Phase 5 | Pending |
| SMOKE-02 | Phase 5 | Pending |
| SMOKE-03 | Phase 5 | Pending |
| RETRO-01 | Phase 6 | Pending |
| RETRO-02 | Phase 6 | Pending |
| RETRO-03 | Phase 6 | Pending |

**Coverage:**
- v2.0 requirements: 19 total (6 categories: STATE, TAX, SCOPE, EVID, SMOKE, RETRO)
- Mapped to phases: 19 (each to exactly one phase — no orphans, no double-maps)
- Unmapped: 0

---
*Requirements defined: 2026-09-16 for milestone v2.0 (Golden Path v2), rev 2 — file-backed StateStore replaces SQLite*
*v1.0 requirements (31, complete) archived at `.planning/milestones/v1.0-REQUIREMENTS.md`*
