# Feature Research — Milestone v2.0 (Golden Path v2 Delta)

**Domain:** Autonomous Agentic SDLC Platform (Azure DevOps native) — v2.0 model restructure
**Researched:** 2026-09-16
**Confidence:** HIGH (Azure-native patterns, SRE postmortem practice, DORA metrics verified against official docs; project model grounded in `.idea/v2.md`)
**Scope:** v2 delta only. v1.0 capability landscape: `.planning/milestones/v1.0-research/FEATURES.md`. Deferred backlog (`MULTI-*`, `GOV-*`) stays OUT of v2.0.

**Complexity key:** LOW (S) ≤ ~1 phase-plan · MEDIUM (M) = 1–2 plans, touches existing modules · HIGH (L) = new subsystem or multi-module surgery.

---

## The 5-Column Feature Map (v2.0)

Features mapped to the `.idea/v2.md` columns. **Delta** column: what changes vs v1.0.

| Column | Steps (actor) | Evidence | v2.0 features | Delta vs v1.0 |
|---|---|---|---|---|
| **1. REFINEMENT** | 1. Ticket & AC verify (⚡) · 2. Scope review & verify (👤 PM) | L1 | F-B PM scope-lock gate | v1 auto-transitions `New→Ready to Dev` on AI audit pass (`auditor/worker.ts` → `transitionToReadyToDev`). v2 inserts a **human verdict between audit-pass and Ready to Dev**. L1 artifact gains *scope boundary checklist + testability sign-off* (v2.md L1 row) |
| **2. EXECUTION** | 3. Loop: Plan-Code-Test (⚡) · 4. Dev validate & PR (👤 Dev) | L2, L3 | F-A taxonomy relabel only | No behavior change — v1 PLAN/IMPL/TEST/ACCEPT map 1:1 onto Steps 3–4 |
| **3. ACCEPTANCE** | 5. PR review & CI deploy (👤 TechLead/SA) · 6. QA staging verify (👤 QA) | L3, L4, L5 | F-A relabel | No behavior change — v1 MERGE + QA map onto Steps 5–6 |
| **4. RELEASE** | 7. Release approval + deploy (👤 QA/SA/Lead/PM) · 8. Smoke test & monitor (⚡) | L5, L6 | F-D prod smoke suite | v1 L6 = passive telemetry only (`deploy/telemetry.ts`). v2.md L6 artifact explicitly names **"automated smoke test logs"** — active checks join the telemetry window |
| **5. RETRO** | 9. Retro takeaways, docs, skill enhancement (⚡ & Team) | L7 | F-C L7 schema + F-E retro output | v1 LEARN emits only SKILL.md PR (`learn/generator.ts`). v2 adds retro takeaways doc + runbook update + trend metrics as **auditable L7 evidence** |
| *(cross-cutting)* | all | L1–L7 | F-A taxonomy restructure · F-C evidence index L1–L6 → L1–L7 | State matrix, comment badges, evidence-index stage labels (`deploy/evidence-index.ts`), docs realigned to columns/steps/actors |

---

## Feature Landscape

### Table Stakes (v2.0 is incomplete without these)

| Feature | Why Expected | Complexity | v1.0 dependencies (code touchpoints) |
|---|---|---|---|
| **F-A. Taxonomy restructure — 5 columns / 9 steps / actor labels** | v2.0 *is* the restructure. Every comment badge, evidence-index row, state-matrix doc, and tag must speak the new taxonomy or the system lies about its own model. | MEDIUM (M) | `deploy/evidence-index.ts` (stage labels CONTRACT/REVIEW/… → step names), `ado/formatter.ts` (comment badges), `.planning/ROADMAP.md` state matrix, phase constants across `auditor/execute/accept/qa/deploy/learn`. **No new ADO states** — v1 audit decision "reuse existing ADO states" still holds; columns map onto existing states + tags. |
| **F-B. PM scope-lock gate (Step 2)** | v2.md marks Step 2 a governance hand-off (👤 Human Verdict Gate). Without it, REFINEMENT has no human check — v1's exact gap. | MEDIUM (M) | `auditor/worker.ts` (remove auto `transitionToReadyToDev`; post `[awaiting-scope-lock]` instead), new verdict parser mirroring `accept/verdict.ts` (token + state-transition dual detection), `ingress/routes.ts` (route comment/state events), `plan/watchdog.ts` pattern (24h ping), `db/schema.ts` (scope-lock record). |
| **F-C. L7 evidence schema + unified index L1–L7** | v2.md defines L7 as a first-class evidence level; DPLY-03's "Done with L1–L6 index" becomes L1–L7. A level defined but not persisted/attached is not evidence. | MEDIUM (M) | `deploy/evidence-index.ts` (`L1L6EvidenceSummary` → `L1L7…`, `l7Summary` column on `evidenceIndices`, L7 row in HTML table), `db/schema.ts` + Drizzle migration, `learn/worker.ts` (write L7 record post-retro). Index posted at Done (L1–L6), **appended/updated after Step 9** so Done doesn't block on retro. |
| **F-D. Prod smoke suite — health + critical-path checks (Step 8)** | v2.md L6 artifact names "automated smoke test logs" alongside telemetry. Telemetry-only is reactive: silent failures on unexercised paths, wrong-slot/stale-version swaps, and config breakage produce *no error rate* until users hit them. | MEDIUM (M) core | `deploy/worker.ts` (run smoke inside the 30-min window), new `deploy/smoke.ts`, `deploy/telemetry.ts` (reuse HTTP/fetch + timeout pattern), `qa/fingerprint.ts` (reuse 2-strike flake filtering), `config/env.ts` (smoke base URL, check manifest), DB `smokeRuns` table. |
| **F-E. Retro takeaways + runbook update + skill PR as one L7 bundle (Step 9)** | v2.md L7 = "logs retro takeaways, updates runbooks, and enhances agents' skills". v1 only does the third. SRE practice: a retro without recorded action items ≈ no retro. | MEDIUM (M) core, HIGH (L) full | `learn/harvester.ts` (already collects rework bounces, test/QA/telemetry — extend with verdict timeline + bounce reasons), `learn/generator.ts` (multi-artifact output; reuse prompt-injection defenses), `learn/publisher.ts` (PR flow — never direct commit, preserves LRN-02 guard), `skillsPrs` table pattern → new `retroRecords` table. |
| **F-A2. Governance hand-off audit trail (who handed off, when, verdict)** | v2.md "Key Governance Hand-offs" names three human gates (Steps 2/5/7). Auditable governance = verdict records with identity + timestamp. v1 records accept/QA/deploy verdicts in SQLite; Step 2's record is the new one. | LOW (S) on top of F-B | `db/schema.ts` (reuse `auditLogs`/`reworkCycles` pattern), `accept/verdict.ts` precedent for identity handling (non-bot human via INGEST-03 bot shield). |

### Differentiators (valuable, but v2.0 ships without some)

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **F-D2. Synthetic write transaction in smoke suite** | Health ping + version check proves the app *answers*; a create-read-delete synthetic proves the app *works* (DB, auth, dependencies). This is the "smoke vs just telemetry" line. | HIGH (L) | Needs per-service check config + data cleanup + idempotency. Defer behind core F-D; design the check manifest so write-checks slot in without rework. |
| **F-E2. DORA-aligned trend metrics per ticket + rolling aggregate** | Turns L7 from prose into measurement: change lead time (`New→Done`), rework rate (bounces/ticket), change fail signal (`[deploy-regressed]` count), failed-deployment recovery time. All source data already in SQLite. | LOW–MEDIUM (S–M) | DORA's 5 metrics verified (dora.dev, 2026). Compute per-ticket deltas at retro (cheap); rolling service-level aggregates later. **Guard:** DORA explicitly warns against metrics-as-targets (Goodhart) — report, never score. |
| **F-E3. Retro action items as ADO follow-up work items** | SRE: every postmortem action item needs owner + priority + **tracking bug**. Auto-filing tagged `[retro-action]` work items closes the loop mechanically. | MEDIUM (M) | v2.0 recommendation: list action items *in the retro doc with suggested owners* (table stakes); auto-creation deferred — spam risk, and a human filing keeps accountability honest. |
| **F-B2. Scope-drift detection at PR time** | PM locks scope at Step 2; diff vs locked scope boundary at Step 4/5 flags drift ("PR touches files/areas outside locked scope"). Strong governance story. | HIGH (L) | Needs scope→path mapping semantics the L1 checklist doesn't have yet. Future milestone. |
| **F-A3. Actor attribution (⚡/👤) on every evidence row + hand-off comment** | Makes the v2 actor model visible in ADO itself, not just docs. Cheap credibility win for the restructure. | LOW (S) | Fold into F-A formatter changes. |

### Anti-Features (do NOT build in v2.0)

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| **Auto-lock scope on PM timeout** | "PMs are slow; unblock the pipeline." | Destroys the gate's entire purpose — a human verdict that auto-approves is not a verdict. v1's Plan Checkpoint precedent: *ping*, never auto-answer. | 24h ping (reuse `plan/watchdog.ts` pattern), then escalate to team, ticket waits. |
| **Role-based ACL on verdict tokens (PM-only enforcement)** | "Only a PM should lock scope." | v1's accept/QA/deploy verdicts use one bar: non-bot human (INGEST-03). ADO state-change permissions already govern who *can* transition. Building an identity/role system is new infra for marginal gain. | Keep non-bot-human bar; document that `[lock-scope]` is a PM-ownership *convention*; ADO group permissions enforce the rest. |
| **New ADO workflow states for the 9 steps** | "Make the board match the diagram." | v1 audit already rejected new columns ("reuse existing ADO states — less migration friction"). 9 states = org process-template change, board migration, webhook routing churn. | Columns are a *taxonomy layer*: existing states + tags (`[awaiting-scope-lock]` fits the established `[awaiting-*]` convention). |
| **Browser-based full user-journey smoke tests (Playwright vs prod)** | "Real E2E confidence." | Flaky in prod, credential handling against live data, high maintenance. App Insights data: ~80% of naive failures disappear on retry — journeys amplify that noise. | HTTP-level health + critical-path checks with 2-strike retry (F-D). Journeys belong to QA staging (Step 6), not prod smoke. |
| **Auto-rollback on smoke failure** | "Smoke failed → undo the deploy." | That is canary/auto-remediation = **GOV-01, explicitly out of v2.0 scope**. Rollback decisions under prod incident need a human. | Smoke fail → alert + `[deploy-regressed]` bounce + notify owner (DPLY-02 behavior), human decides rollback via native ADO. |
| **Continuous App Insights availability tests as *the* smoke suite** | "Azure does it natively — zero code." | Availability tests are perpetual external monitors (min 5 locations, 5-min cadence); they don't run *the deploy-specific* check set against *this release* inside *this* window, and can't verify deployed SHA. Also: URL-ping tests retire **2026-09-30** — don't build on them. | Orchestrator-owned smoke runner at deploy time (F-D). Optionally *also* wire a Standard availability test for 24/7 monitoring — separate concern, not L6-for-this-ticket. |
| **Retro analytics dashboard / team leaderboards** | "Visualize the L7 trends." | Violates "ADO Boards is the only UI" (v1 anti-feature, still binding). DORA warns leaderboards → gaming (Goodhart). | Retro comment on the work item + rolling aggregates posted as a periodic summary work item, if ever needed. |
| **Direct-commit runbook/skill updates** | "Faster learning loop." | Prompt-injection persistence guard — v1 Out of Scope, unchanged in v2. | All L7 writes go through PR review (LRN-02 pattern extended to runbooks). |

---

## Deep Dives — the 4 Research Questions

### Q1. What does a good PM scope-lock gate look like?

**Industry pattern** (Scrum *Definition of Ready* + backlog-refinement sign-off + scope-baseline change control; MEDIUM confidence — DoR is common practice, not Scrum Guide-mandated): a named human confirms, *before execution spend*, that (1) scope boundary is explicit (in/out list), (2) AC are testable, (3) business value/priority is right, (4) size fits one bounded run (<250 LOC in this system). Approval **freezes the baseline** — later changes re-enter refinement.

**Concrete design for Step 2, matching v1 conventions:**

- **Flow:** AI audit passes (CONTR-01 unchanged) → ticket stays in `New`, tags `[audit-passed]` + `[awaiting-scope-lock]`, agent posts L1 audit + a **scope boundary checklist** (in-scope files/areas, out-of-scope, testability notes) for the PM to confirm → PM renders verdict → `[lock-scope]`: system transitions to `Ready to Dev` (the transition CONTR-02 used to make automatically) · `[reject-scope]`: tags stripped, PM's comment becomes the re-audit envelope, ticket stays `New`.
- **Verdict tokens:** follow the established `[approve-acceptance]` / `[reject-acceptance]` / `[reset-rework]` family from `accept/verdict.ts` — dual-channel detection (comment token OR state transition). Suggested: `[lock-scope]`, `[reject-scope]`, `[reset-audit]`.
- **Evidence (extends L1):** scope-lock record = `{ workItemId, pmIdentity, lockedAt, verdict, comment, checklistSnapshot, auditId }` in SQLite; surfaced in evidence-index L1 row as "AI audit PASSED + PM scope LOCKED by X at T". This is exactly v2.md's L1 artifact trio: *audited AC, scope boundary checklist, testability sign-off*.
- **Bounce behavior:** reject does **not** count against the rework breaker (breaker bounds *automated* loops; a PM bounce is human triage). Re-audit after PM edits uses the cumulative-envelope pattern (MRG-04 precedent). 24h unanswered ping reuses PLAN-02's watchdog. No auto-approve, ever (anti-feature above).

### Q2. Smoke-test table stakes vs just telemetry?

v1's DPLY-02 (error-rate + p95 over 30 min) is **passive**: it can only see failures on paths real traffic exercises. Table stakes for an active post-deploy smoke suite, in priority order:

1. **Health endpoint probe** — `GET /health`-style, expected status + content match. (App Service's own warm-up convention: `WEBSITE_SWAP_WARMUP_PING_PATH` e.g. `/statuscheck` — the ecosystem assumes this endpoint exists.)
2. **Deployed-version verification** — response header/build-info SHA == the SHA L5 says was deployed. Catches stale-slot swaps and failed rollouts that *look* healthy. Nothing in telemetry catches this.
3. **Critical-path read checks** — 2–5 endpoint probes covering the service's core reads, with content match.
4. **Retry/flake control** — declare failure only after 2–3 consecutive strikes (App Insights: ~80% of single failures are transient; v1 QA already has the 2-strike fingerprint machinery in `qa/fingerprint.ts` — reuse).
5. **Scheduling** — first run after a short stabilization delay, then repeated inside the existing 30-min window (ADO post-deployment gates model: *delay before evaluation → re-evaluation interval → timeout*; mirror those three knobs).
6. **Failure path** — alert + `[deploy-regressed]` bounce + owner notification, same as a telemetry breach; **no auto-rollback** (human decision; GOV-01 deferred).
7. **Evidence (L6)** — per-run record: checks executed, pass/fail each, retries, durations, run timestamps → "automated smoke test logs" per v2.md L6.

**Beyond table stakes (defer):** synthetic *write* transaction with cleanup (F-D2), AI-derived checks from the ticket's AC, multi-region execution. **Not a substitute:** perpetual App Insights availability tests — complementary 24/7 monitoring, but they can't verify *this* release inside *this* window (and URL-ping variants retire 2026-09-30).

### Q3. What is "L7 continuous-feedback evidence" as an auditable artifact?

Per v2.md: *"Logs retro takeaways, updates runbooks, and enhances agents' skills."* Auditable = structured, persisted, attached to the work item, machine-readable (SRE workbook: mature postmortem cultures add machine-readable metadata for downstream analytics). Four artifacts:

| Artifact | Content | Audit property |
|---|---|---|
| **Retro takeaways doc** | SRE-template sections: summary · what went well / poorly / where we got lucky · **action items with owner + priority + tracking reference** · blameless language (enforced in generator prompt, alongside existing injection defenses). Auto-populated from harvested lifecycle data — the SRE pattern is tooling pre-fills, humans review. | Persisted JSON + posted as work-item comment; "a postmortem without subsequent action is indistinguishable from no postmortem" → action items are mandatory structure, not optional prose |
| **Runbook update** | PR link to runbook diff (deploy/rollback/on-call steps touched by this ticket's surprises) — **or an explicit recorded "no runbook change needed"** | Auditable negative: silence ≠ skip. PR-only, never direct commit (LRN-02 guard) |
| **Skill PR link** | Existing v1 artifact (`skillsPrs` table: PR URL, status, human merge) | Unchanged; now referenced *from* the L7 record |
| **Trend metrics** | Per-ticket deltas: cycle time `New→Done`, rework bounce count + sources, QA flake cleared?, telemetry breach?, smoke result, deploy-regressed? — i.e., DORA-aligned signals computed from data v1 *already stores* | Structured numbers, not narrative; enables rolling aggregates later without re-mining comments |

**Persistence:** `l7Summary` on `evidenceIndices` + dedicated `retroRecords` table; L1–L7 index comment updated after Step 9 (post-at Done, per F-C note).

### Q4. Industry patterns for auto-generating runbooks/retro docs from a completed ticket lifecycle?

The verified pattern chain (Google SRE Workbook ch. 10 — HIGH confidence):

1. **Harvest structured data automatically** — Google's tooling pushes incident metadata (timeline, roles, severity, detection mechanism) into the postmortem template. v1's `learn/harvester.ts` already does the equivalent (rework cycles, L3/QA/telemetry records); extend with the verdict/state timeline.
2. **Draft against a fixed template** — standard sections make retros comparable and parseable; LLM synthesis into fixed schema is this project's `learn/generator.ts` pattern with injection defenses.
3. **Action items: owner + priority + tracking bug, preventative not just mitigative** — "improve X" is called out as a failure mode; items need verifiable end states. Changing automated systems beats changing human behavior.
4. **Human review gate before anything propagates** — PR merge (v1 LRN-02) is the review gate; runbook + skill changes never self-apply.
5. **Promptness** — publish while fresh (<1 week for incidents; here: immediately at Step 9, which is stronger).
6. **Blamelessness is enforceable** — factual language, no finger-pointing; generator prompt constraint + review.
7. **Feed forward** — SRE closes the loop via action-item tracking + shared learning; v2's loop is retro → skill PR merge → future EXECUTE runs (already wired in v1) + retro → runbook → future Step 7/8 humans.

Runbook-specific: mature practice treats runbooks as *living, versioned, reviewed* docs — the diff-PR model (propose change, human merges) is exactly right and already the project's security stance.

---

## Feature Dependencies

```
F-A Taxonomy restructure (columns/steps/actors/labels)
    ├──blocks──> F-B  (gate must speak v2 taxonomy: tags, badges, evidence labels)
    ├──blocks──> F-C  (index rows/labels are column/step-named)
    ├──blocks──> F-D  (L6 evidence row = "Step 8 Smoke & Monitor")
    └──blocks──> F-E  (RETRO column naming, L7 label)

F-B PM scope-lock gate
    ├──requires──> v1 auditor pipeline (CONTR-01 audit stays; CONTR-02 transition moves behind the verdict)
    ├──requires──> v1 verdict-parser pattern (accept/verdict.ts) + bot shield (INGEST-03)
    └──reuses────> v1 watchdog (PLAN-02 24h ping pattern)

F-D Prod smoke suite
    ├──requires──> v1 deploy worker + telemetry window (runs inside DPLY-02's 30-min window)
    ├──reuses────> v1 QA flake fingerprint (qa/fingerprint.ts, 2-strike)
    └──feeds─────> F-C (smoke logs land in L6; L6 feeds the L1–L7 index)

F-E Retro bundle
    ├──requires──> v1 learn module (harvester/generator/publisher — extend, don't replace)
    ├──requires──> F-C L7 schema (retroRecords + l7Summary must exist to persist into)
    └──enhances──> F-D2/F-E2 (smoke results + trend deltas are retro inputs)

F-C L7 schema + index extension
    └──requires──> db/schema.ts migration (all v1 evidence tables untouched; additive only)
```

### Dependency Notes

- **F-A blocks everything linguistically, not functionally:** the gates/runners could be built against v1 names and renamed, but comment badges, evidence rows, and docs would churn twice. Restructure lands first or its vocabulary is frozen up-front.
- **F-B changes one shipped behavior:** CONTR-02's automatic `New→Ready to Dev` becomes verdict-gated. This is the only v1 requirement v2.0 *modifies* (all others are preserved/extended) — requirements-definer should mark it explicitly (supersede-vs-amend).
- **F-C before F-E:** schema is cheap and additive; generator needs somewhere to write. But F-C's index row only gets real content once F-E ships — sequence C→E, or land C's schema with E's phase.
- **F-D is independent of F-B/F-E:** only couples to v1 deploy worker. Parallelizable.
- **Zero new ADO states** across all features (anti-feature above) — keeps the migration surface at tags + SQLite + code.

---

## MVP Definition (v2.0)

### Launch With (v2.0 = all five target features, at table-stakes depth)

- [ ] **F-A** Taxonomy restructure — the milestone's reason to exist; state matrix + formatters + docs speak 5 columns / 9 steps / actors
- [ ] **F-B** PM scope-lock gate — verdict tokens, scope checklist evidence, reject-bounce, 24h ping
- [ ] **F-C** L7 schema + unified L1–L7 evidence index (posted at Done, appended post-retro)
- [ ] **F-D** Smoke core: health probe + version verification + critical-path reads, 2-strike retry, in-window schedule, L6 logs, `[deploy-regressed]` failure path
- [ ] **F-E** Retro bundle core: SRE-structured takeaways (with action items) + runbook-diff PR or recorded "no change" + skill PR (existing) — all persisted as L7, human-merged

### Add After Validation (v2.x)

- [ ] **F-E2** DORA trend metrics — once ≥10 tickets have run the full v2 path (meaningful aggregates); per-ticket deltas can ship with F-E since data is free
- [ ] **F-D2** Synthetic write transaction — once the check-manifest format has proven out on reads
- [ ] **F-A2/F-A3** Hand-off audit trail + actor attribution polish — after taxonomy settles

### Future Consideration (v3 / deferred backlog)

- [ ] **F-E3** Auto-filed retro action work items — spam/accountability risk; needs team trust in retro quality first
- [ ] **F-B2** Scope-drift detection at PR time — needs scope→path semantics
- [ ] Rolling org-level DORA reporting — Goodhart guardrails needed; ADO-Boards-only-UI constrains presentation
- [ ] `GOV-01` canary/auto-rollback, `GOV-02` multi-tenant runners, `MULTI-*` trackers — explicitly out of v2.0 per PROJECT.md

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| F-A Taxonomy restructure | HIGH (defines the milestone) | MEDIUM | P1 |
| F-B PM scope-lock gate | HIGH (closes v1's governance gap) | MEDIUM | P1 |
| F-C L7 schema + index L1–L7 | HIGH (evidence model integrity) | MEDIUM | P1 |
| F-D Smoke core suite | HIGH (v2.md names smoke logs in L6) | MEDIUM | P1 |
| F-E Retro bundle core | HIGH (L7 content source) | MEDIUM | P1 |
| F-E2 DORA trend metrics | MEDIUM | LOW–MEDIUM | P2 |
| F-A2/F-A3 Hand-off trail + actor badges | MEDIUM | LOW | P2 |
| F-D2 Synthetic write transaction | MEDIUM | HIGH | P2/P3 |
| F-E3 Auto-filed action items | LOW–MEDIUM | MEDIUM | P3 |
| F-B2 Scope-drift detection | MEDIUM | HIGH | P3 |

**Priority key:** P1 = required for v2.0 milestone completion · P2 = add when P1 validated · P3 = future milestone.

---

## Industry Practice Analysis (template's "competitor" section, adapted)

| Capability | Google SRE (workbook ch. 10) | Azure DevOps / App Insights (native) | DORA (2026) | Agentic peers (Devin/Factory, v1 research) | **Our v2.0 approach** |
|---|---|---|---|---|---|
| Human pre-execution scope gate | Engagement model: SLO/scope agreed before work | ADO approvals & gates: pre-deployment conditions, human-before-gate ordering | — (assumes small batches) | None — agents self-scope from the ticket | **F-B: PM `[lock-scope]` verdict on `New` + scope checklist as L1 evidence** (differentiator vs agentic peers) |
| Post-deploy verification | Canarying (ch. 16) — out of scope here | Post-deployment gates: delay → re-evaluate → timeout; Invoke REST API / Query Azure Monitor; App Insights Standard tests (URL ping retires 2026-09-30); slot warm-up ping `/statuscheck` | Failed deployment recovery time presumes detection | Minimal — stop at PR/merge | **F-D: orchestrator-owned smoke runner inside the DPLY-02 window, gate-style timing knobs, 2-strike retry** |
| Learning artifacts | Postmortem: fixed template, blameless, action items w/ owner+priority+tracking bug, machine-readable metadata, prompt publication | Work-item tracking for action items (Query work items gate exists) | Metrics as *guide*, never target (Goodhart warning explicit) | Skills/memory updates, opaque | **F-E+F-C: SRE-templated retro + runbook-diff PR + skill PR + DORA deltas, persisted as auditable L7** |
| Evidence model | Postmortem repo w/ metadata for analysis | Gate/approval logs | 5 delivery metrics | — | **Unified L1–L7 index comment on the work item; ADO Boards stays the only UI** |

---

## Sources

| Source | Confidence | Used for |
|---|---|---|
| `.idea/v2.md` (authoritative v2 model: 5 cols / 9 steps / L1–L7 table / governance hand-offs) | HIGH (project source) | All feature grounding; L1/L6/L7 artifact definitions |
| `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, v1 code (`auditor/worker.ts`, `accept/verdict.ts`, `deploy/telemetry.ts`, `deploy/evidence-index.ts`, `learn/harvester.ts`, `learn/worker.ts`) | HIGH (verified in repo) | v1.0 dependency touchpoints; conventions (tags, verdict tokens, breaker, PR-only learning) |
| Google SRE Workbook ch. 10 — Postmortem Culture (sre.google/workbook/postmortem-culture) | HIGH (official, fetched 2026-09-16) | Retro template structure, action-item discipline, blamelessness, promptness, machine-readable metadata, tooling pre-fill pattern |
| Azure Monitor — App Insights availability tests (learn.microsoft.com/azure/azure-monitor/app/availability-overview, updated 2026-08-21) | HIGH (official, fetched) | Standard tests, 3-retry rule (~80% transient), alert thresholds, URL-ping retirement 2026-09-30, content match |
| Azure Pipelines — Deployment gates concepts (learn.microsoft.com/azure/devops/pipelines/release/approvals/gates, updated 2026-05) | HIGH (official, fetched) | Post-deployment gate model: delay before evaluation, re-evaluation interval, timeout; gate-before-approval ordering |
| Azure App Service — Deployment slots (learn.microsoft.com/azure/app-service/deploy-staging-slots, updated 2025-11) | HIGH (official, fetched) | Warm-up ping path convention (`/statuscheck`), swap-with-preview validation, instant swap-back rollback |
| DORA — software delivery performance metrics (dora.dev/guides/dora-metrics-four-keys, updated 2026-01-05) | HIGH (official, fetched) | 5 metrics incl. change fail rate + deployment rework rate; Goodhart/metrics-as-goal pitfall |
| Scrum Definition of Ready / backlog refinement sign-off | MEDIUM (established practice; scrum.org fetch returned empty — not doc-verified this session) | PM scope-gate pattern framing |
| v1.0 research (`.planning/milestones/v1.0-research/FEATURES.md`) | HIGH (project source) | Peer-product context (Devin/Factory/OpenHands), preserved anti-features |

---
*Feature research for: Agentic SDLC Workflow — milestone v2.0 (Golden Path v2 restructure)*
*Researched: 2026-09-16*
