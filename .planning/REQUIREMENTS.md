# Requirements: Agentic SDLC Workflow — Milestone v2.0 (Golden Path v2)

**Defined:** 2026-09-16
**Milestone:** v2.0 — full restructure to the Golden Path v2 model (`.idea/v2.md`): 5 columns / 9 steps / L1–L7 evidence.
**Core Value:** Deterministic, evidence-backed delivery across Refinement → Execution → Acceptance → Release → Retro (9 steps), with **L1–L7** evidence, native ADO gates, explicit actor roles (⚡ AI / 👤 Human), and human verdict gates.

**Prior milestone:** v1.0 shipped 2026-09-09 (git tag `v1.0`) — 31 requirements across 8 stages (L1–L6), archived to `.planning/milestones/v1.0-*`. v2.0 builds on it; the stack is LOCKED (zero new dependencies — verified against `package.json`).

**Research basis:** `.planning/research/SUMMARY.md` (stack, features, architecture, pitfalls). Key architecture decision: model the 5-column/9-step taxonomy as **data** (`src/pipeline/taxonomy.ts`), do NOT rename v1.0 directories.

---

## v2.0 Requirements

### 1. TAX — Taxonomy Restructure (5 columns / 9 steps)

- [ ] **TAX-01**: System models the Golden Path v2 as a single data-driven source (`src/pipeline/taxonomy.ts`): each of the 9 steps mapped to its column (Refinement/Execution/Acceptance/Release/Retro), actor (⚡ AI / 👤 Human), evidence level (L1–L7), and ADO state — with no v1.0 directory renames (taxonomy is additive metadata over the existing 16 src dirs).
- [ ] **TAX-02**: The ADO state-transition router and the evidence-index stage labels are driven by the v2 taxonomy, and the authoritative state matrix in ROADMAP/docs reflects the 5 columns / 9 steps / L1–L7 model with governance hand-offs.
- [ ] **TAX-03**: The restructure is behavior-preserving for v1.0 paths — the existing test suite stays green (no regression to shipped CONTRACT→…→LEARN transitions); taxonomy adoption is verified by a mapping test covering all 9 steps.

### 2. SCOPE — Human PM Scope-Lock Gate (Refinement, Step 2)

- [ ] **SCOPE-01**: After the L1 contract audit passes, the system parks the ticket for human PM scope review (`New` state + `[awaiting-scope-lock]` tag — reusing existing ADO states, no new board column) and posts a scope-review packet (L1 audit summary + scope-boundary checklist + testability sign-off), instead of auto-transitioning to `Ready to Dev`.
- [ ] **SCOPE-02**: A human PM renders a scope verdict (👤) via comment tokens (`[approve-scope]` / `[reject-scope]` / `[reset-scope]`) detected on state/tag transitions (resilient to the `[automated-agent]` bot-echo shield, with watchdog/poller reconcile for missed verdicts); approve transitions the ticket to `Ready to Dev` and writes an L1 scope-lock evidence record; reject keeps it parked with feedback + a 24h reminder ping (escalate at 72h).
- [ ] **SCOPE-03**: The gate cannot be bypassed or deadlocked — a tag/row guard before the audit LLM call prevents re-audit re-running the transition on a parked ticket (idempotent across revisions), and scope rejections use a refinement counter SEPARATE from the shared rework breaker (never consumes the Accept/PR ≤2 budget).

### 3. EVID — L7 Continuous-Feedback Evidence + Index Extension (L1–L7)

- [ ] **EVID-01**: System persists L7 Continuous-Feedback evidence in a dedicated `retro_records` table: retro takeaways (with mandatory action items — owner + priority + tracking ref), runbook-diff PR link (or a recorded "no change" auditable negative), skill PR link, and DORA-aligned trend deltas sourced from existing v1.0 SQLite data.
- [ ] **EVID-02**: The unified evidence index extends L1–L6 → **L1–L7** — a nullable `evidence_indices.l7_summary` column added via a guarded-ALTER migration (with a v1-fixture upgrade test proving live DBs migrate, since there is no drizzle-kit runner and `CREATE TABLE IF NOT EXISTS` will not add columns) — and the formatted work-item index comment renders all seven levels.
- [ ] **EVID-03**: L7 is fail-closed — a ticket must NOT reach `Done` without a real L7 evidence row; missing/incomplete L7 throws and blocks the transition (mirrors the L6 telemetry fail-closed gate; no fabricated defaults copied from the L1–L6 index's `?? 1` / `|| '0.05%'` precedent).

### 4. SMOKE — Automated Production Smoke-Test Suite (Release, Step 8)

- [ ] **SMOKE-01**: On deployment (Release Step 8), the system runs an automated ⚡ production smoke suite BEFORE the telemetry window (fail-fast, don't burn 30 min on a dead deploy): health probe, deployed version/SHA verification (catches stale-slot swaps telemetry can't see), and critical-path read checks — via native `fetch` and/or sandboxed `execa` (read-only, credential-scrubbed, bounded timeout + egress).
- [ ] **SMOKE-02**: Smoke failures classify INFRA vs APP with a 2-strike flake filter (reusing the QA `fingerprint.ts` pattern) so a prod blip cannot trigger a false regression; a confirmed APP regression bounces the ticket to `In Dev` with `[deploy-regressed]` + reproduction diagnostics (no auto-rollback — GOV-01 deferred).
- [ ] **SMOKE-03**: Smoke results persist to a `smoke_runs` table and feed L6 Prod-Confidence evidence; release confidence requires smoke PASS **and** telemetry-window PASS.

### 5. RETRO — Retro Takeaways, Runbooks & Skill Enhancement (Retro, Step 9)

- [ ] **RETRO-01**: On release confidence (smoke + telemetry pass), the system runs the retro step BEFORE the `Done` transition (awaited, fail-closed per EVID-03): analyzes the ticket lifecycle (rework cycles, review comments, test/smoke fixes, telemetry) and produces retro takeaways with mandatory, tracked action items.
- [ ] **RETRO-02**: Retro emits runbook updates (a `RUNBOOK.md` diff) or a recorded "no change", plus skill enhancement (`SKILL.md`), submitted as a SINGLE PR to the skills repo (never direct-commit; human merge required) with prompt-injection defenses (XML source isolation, escaped frontmatter, meta-directive override denial) — reusing the existing `learn/` publisher path.
- [ ] **RETRO-03**: Retro artifacts (takeaways, runbook-diff PR link, skill PR link, trend deltas) persist as the L7 evidence row that gates `Done`; the ticket transitions to `Done` with the full L1–L7 evidence index and `[golden-path-complete]` tag, while the human PR merge stays async (skills/runbooks affect future runs only after merge, not the current ticket's Done).

---

## Future Requirements (deferred — NOT in v2.0)

### Differentiators (P2/P3, surfaced by research)
- **METRICS-01**: Rolling DORA aggregate dashboards (deferred — Goodhart's-law guard needs care).
- **SMOKE-04**: Synthetic write-transaction smoke checks (L, deferred — prod-mutation risk).
- **RETRO-04**: Auto-filed retro action work items (deferred — board-spam risk).
- **SCOPE-04**: Scope-drift detection at PR vs locked scope (L, deferred differentiator).

### Multi-Tracker & Advanced Governance (v1.0 backlog, still deferred)
- **MULTI-01**: GitHub Issues / Projects as alternative ticket source.
- **MULTI-02**: Jira Software Cloud webhooks and transitions.
- **GOV-01**: Automated canary traffic shifting with instant rollback on telemetry/smoke alerts.
- **GOV-02**: Multi-tenant cloud runner pool with per-team quotas.

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| New dependencies | Stack is locked; all 5 capabilities reuse installed libs (verified `npm ls`). |
| Renaming v1.0 source directories | Churn across 65 src files + 32 tests for zero behavior gain; taxonomy modeled as data instead. |
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
| TAX-01 | Phase 1 | Pending |
| TAX-02 | Phase 6 | Pending |
| TAX-03 | Phase 1 | Pending |
| SCOPE-01 | Phase 2 | Pending |
| SCOPE-02 | Phase 2 | Pending |
| SCOPE-03 | Phase 2 | Pending |
| EVID-01 | Phase 5 | Pending |
| EVID-02 | Phase 3 | Pending |
| EVID-03 | Phase 3 | Pending |
| SMOKE-01 | Phase 4 | Pending |
| SMOKE-02 | Phase 4 | Pending |
| SMOKE-03 | Phase 4 | Pending |
| RETRO-01 | Phase 5 | Pending |
| RETRO-02 | Phase 5 | Pending |
| RETRO-03 | Phase 5 | Pending |

**Coverage:**
- v2.0 requirements: 15 total (5 categories)
- Mapped to phases: 15/15 ✓ (roadmap created 2026-09-16 — each requirement in exactly one phase)
- Unmapped: 0
- Phase distribution: P1: 2 (TAX-01/03) · P2: 3 (SCOPE-*) · P3: 2 (EVID-02/03) · P4: 3 (SMOKE-*) · P5: 4 (RETRO-* + EVID-01) · P6: 1 (TAX-02)

---
*Requirements defined: 2026-09-16 for milestone v2.0 (Golden Path v2)*
*v1.0 requirements (31, complete) archived at `.planning/milestones/v1.0-REQUIREMENTS.md`*
