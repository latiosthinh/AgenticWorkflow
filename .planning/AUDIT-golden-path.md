# Audit: Golden Path Plan + Architecture
**Audited:** 2026-09-07
**Scope:** PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, research/*, architecture.svg, .idea/draft.md
**Verdict:** ⚠️ FIX BEFORE PLAN-PHASE — 3 blockers, 4 high, 5 medium

---

## BLOCKERS

### B1. PR-review rejection rework loop deleted
Old REV-01/02/03 (Dev Done → In Dev re-trigger with cumulative context, bounce cap) removed during Golden Path rewrite. New MRG-02 says "human renders PR merge verdict" — no reject path, no requirement, no phase success criterion. Image Step 6 has human verdict ◆; rejection must route somewhere.
**Fix:** Add MRG-04: PR review rejection moves ticket back to In Dev with cumulative rework envelope (AC + diff + comments), shares the max-2 breaker with ACCP-03.

### B2. QA stage silently vanished
Original draft step 5: "tester do the same loop as developer", states `Ready for QA` → QA fail → back to `In Dev`. Golden Path has no QA column; QA-01..04 requirements deleted, not even moved to v2. FEATURES.md research listed QA gate as differentiator; SUMMARY.md deferred *automated* QA but kept human QA.
**Fix (decision required):** Either (a) explicitly fold QA into ACCEPT (pre-merge human validation) + CI L3 re-run, log in Key Decisions + Out of Scope with reason; or (b) add QA column/state back. Do not leave silently dropped.

### B3. No authoritative ADO state matrix
Research FSM: `New → Ready to Dev → In Dev → Dev Done → Ready for QA → Ready to Deploy`. Golden Path ROADMAP Phase 4 invents an "Accept" state; `Dev Done` / `Ready for QA` fate undefined. Two state models now coexist across docs.
**Fix:** One transition matrix mapping 10 steps → ADO states, in PROJECT.md or ROADMAP.md. Prefer reusing existing board states (e.g., ACCEPT = `Dev Done` column semantics) over inventing columns.

---

## HIGH

### H1. Deploy scope contradiction
PROJECT.md Out of Scope (old): "v1 stops at Ready to Deploy". New DPLY-01/02: human-gated deploy + prod telemetry monitoring. Original user draft: workflow "done" at `Ready to Deploy`. Golden Path image: includes Deploy + Monitor columns.
**Fix:** Confirm scope expansion. If v1 deploys: keep DPLY, update Out of Scope wording (already partly done — verify consistent). If v1 stops at gate: DPLY-02 (monitoring) moves to v2.

### H2. Plan checkpoint (Q→human) blocks with no lifecycle design
PLAN-01/02: agent asks human questions mid-run. Undefined: does worker hold worktree/sandbox while waiting (hours)? What re-triggers on human answer (comment event? state?)? Timeout/escalation? Echo shield must not treat the human answer as a fresh ticket event.
**Fix:** Plan step persists questions to work item, releases sandbox, exits. Human comment re-triggers via webhook. Add 24h ping timeout. Specify in Phase 2 success criteria.

### H3. L6 telemetry source unspecified
DPLY-02 "monitors production telemetry" — no integration requirement (App Insights? Azure Monitor? which signals? what window?). Phase 6 criterion "telemetry stability over evaluation window" — window undefined. STACK.md has no telemetry client.
**Fix:** Add concrete source (Azure Monitor/App Insights API), define window + signals (error rate, latency p95), or mark L6 as v2.

### H4. LEARN auto-commits = self-modifying prompt vector
LRN-02 commits extracted skills that feed future agent runs. Compromised/hallucinated "learning" persists into every later run. No human review of skill writes.
**Fix:** Learning agent opens PR to skills repo; human merges. Never direct commit to main.

---

## MEDIUM

### M1. Research docs stale
SUMMARY/ARCHITECTURE still describe 6-phase flow, `Ready for QA`, QA agent. ARCHITECTURE.md contradicts STACK.md internally (shows Redis/BullMQ/SQS queue; STACK.md rejected Redis/BullMQ for SQLite+p-queue).
**Fix:** Add addendum to SUMMARY.md: "superseded by Golden Path 7-phase roadmap 2026-09-07"; note queue = SQLite WAL + p-queue.

### M2. ACCEPT evidence presentation undefined
ACCP-01 "preview/verification evidence attached" — how does human validate? Test report? Staging URL? Screenshots? No requirement defines the artifact.
**Fix:** Define acceptance packet: test run summary + diff stat + (optional) preview URL, posted to work item.

### M3. CI gates ownership ambiguous
MRG-03 phrased as if system runs CI. Azure DevOps branch policies do this natively (build validation, required reviewers, comment resolution).
**Fix (lazy):** Don't build CI orchestration. Require existing ADO pipeline + branch policy; system only reads gate status and blocks/allows merge. Rewrite MRG-03 as "system verifies branch-policy gate status (L2/L3/L4) before merge".

### M4. Deploy approval — use native ADO Environments
ADO Environments natively provide pre-deploy human approval gates (L5) and post-deployment checks (L6 hook).
**Fix (lazy):** DPLY-01 = configure/verify ADO Environment approval, not custom gate code.

### M5. Phase 5 criterion 4 conflicts with DPLY-01
"PR merge automatically triggers transition to deployment stage" vs "human deployment approval gate". Auto-transition to *approval queue* is fine; wording implies auto-deploy.
**Fix:** Reword: merge → ticket enters deploy-approval queue (human ◆ gate remains).

---

## LOW

- L1: SVG matches image (7 columns, 10 steps, L1–L6 cards, loops). Evidence card footer text position fine. No action.
- L2: Coverage math correct: 24 requirements, 24 mapped, 7 phases, STATE.md synced.
- L3: DISP-01 tag assignment timing (Step 1 contract vs Step 2 triage) — pin down in Phase 1/2 discussion.
- L4: Skills repo location undefined (same repo? separate?) — decide in Phase 7 discussion.
- L5: `.idea/draft.md` now duplicates Golden Path content — fine as source-of-truth sketch; PROJECT.md supersedes.

---

## Decisions needed before `/gsd-plan-phase 1`

1. **B2:** QA folded into ACCEPT+CI, or separate QA stage?
2. **H1:** v1 deploys (human-gated) or stops at Ready to Deploy?
3. **B3:** Final ADO state list for the board.
4. **M3/M4:** Adopt native ADO branch policies + Environments (recommended) vs custom gates?

Phase 1 (INGRESS + CONTRACT audit) is unaffected by all blockers — can plan now while decisions 1-3 pending, but B3 state matrix touches Phase 1 FSM work. Decide B3 first.

---

## Decisions Resolved (2026-09-07)

| # | Finding | Resolution | Applied in |
|---|---------|------------|------------|
| B1 | PR-review reject loop deleted | **MRG-04** added: reject → `In Dev` + cumulative envelope, shares ACCP-03 breaker | REQUIREMENTS, ROADMAP Phase 5 |
| B2 | QA stage vanished | **Restored** as Phase 6: QA-01..04, `Ready for QA`, 2-strike flake filter, bounce ≤2 | REQUIREMENTS, ROADMAP, PROJECT |
| B3 | Two state models | **Authoritative matrix** in ROADMAP.md; reuse existing states, ACCEPT = `Dev Done` | ROADMAP |
| H1 | Deploy scope contradiction | **Gated deploy + monitor in v1** (user decision); DPLY-01..03 with native Environments + Azure Monitor 30-min window | REQUIREMENTS, PROJECT |
| H2 | Q→human blocking lifecycle | **PLAN-02**: sandbox released while waiting, comment re-triggers, 24h ping, plan locked pre-edit | REQUIREMENTS, ROADMAP Phase 2 |
| H3 | L6 telemetry unspecified | **DPLY-02**: Azure Monitor / App Insights, 30-min window, error-rate + p95-latency checks | REQUIREMENTS |
| H4 | LEARN direct commits | **LRN-02**: PR to skills repo only, human merge required | REQUIREMENTS, PROJECT Out of Scope |
| M1 | Research stale | **Addendum** appended to SUMMARY.md; ROADMAP v2 wins on conflicts | research/SUMMARY.md |
| M2 | ACCEPT packet undefined | **ACCP-01**: test summary + diff stat + PR link + preview URL | REQUIREMENTS |
| M3 | CI ownership | **Native branch policies**; MRG-03 reads status only | REQUIREMENTS, PROJECT |
| M4 | Deploy approval | **Native ADO Environments**; DPLY-01 | REQUIREMENTS, PROJECT |
| M5 | Phase 5 auto-deploy wording | Merge → `Ready for QA` (MRG-05); deploy queue only after QA pass | ROADMAP |
| L3 | Tag timing | Pinned: human assigns tags at triage (`Ready to Dev` → `In Dev`), state matrix row 2 | ROADMAP |
| L4 | Skills repo location | Deferred item → resolve in Phase 8 planning | STATE.md |

**Status: ALL BLOCKERS RESOLVED — cleared for `/gsd-plan-phase 1`.**
