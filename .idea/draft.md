# Agentic SDLC Workflow — Golden Path Standard

Based on: **The Proposed Standard — Ten Steps in Seven Columns & Six Evidence Levels (L1–L6)**

```
┌───────────────┬───────────────────────────────┬───────────────┬───────────────┬───────────────────────────────┬───────────────────────────────┬───────────────┐
│ 1. CONTRACT   │ 2. EXECUTE                    │ 3. CHECK      │ 4. ACCEPT     │ 5. MERGE                      │ 6. DEPLOY                     │ 7. LEARN      │
├───────────────┼───────────────┬───────────────┼───────────────┼───────────────┼───────────────┬───────────────┼───────────────┬───────────────┼───────────────┤
│ Step 1:       │ Step 2:       │ Step 3:       │ Step 4:       │ Step 5:       │ Step 6:       │ Step 7:       │ Step 8:       │ Step 9:       │ Step 10:      │
│ Ticket + AC   │ Plan          │ Implement     │ Test + verify │ Accept        │ PR review     │ CI gates      │ Deploy        │ Monitor       │ Learn         │
│ (human        │ (agent ·      │ (agent,       │ (agent runs)  │ (human        │ (human        │ (pipeline     │ (human        │ (prod         │ (skills fed   │
│  contract)    │  Q→human)     │  bounded)     │               │  validates)   │  merges)      │  re-runs it)  │  approves)    │  signals)     │  back)        │
│ [Human owns]  │ [Agent exec]  │ [Agent exec]  │ [Agent exec]  │ [Human owns]  │ [Human owns]  │ [Pipeline]    │ [Human owns]  │ [Pipeline]    │ [Agent exec]  │
│ [Human input◇]│ [Human input◇]│               │               │ [Verdict ◆]   │ [Verdict ◆]   │               │ [Verdict ◆]   │               │               │
└───────────────┴───────────────┴───────────────┴───────────────┴───────────────┴───────────────┴───────────────┴───────────────┴───────────────┴───────────────┘
```

## Six Evidence Levels (L1–L6)

| Level | Evidence Dimension | Primary Question | Mapped Golden Path Column | Evidence Artifact |
|---|---|---|---|---|
| **L1** | **Requirement** | Is "done" defined right? | **CONTRACT** | Audited Acceptance Criteria, Scope boundary checklist, testability sign-off |
| **L2** | **Code Quality** | Is the code sound? | **MERGE (CI scans)** | Linting clean, SonarQube/ESLint score, zero static analysis regressions, <250 LOC diff |
| **L3** | **Functional** | Does it behave as specified? | **CHECK (agent) & MERGE (CI)** | Local unit test pass trace, CI test suite green re-run, regression test matrix |
| **L4** | **Security** | Is it safe? | **MERGE (Scan gate)** | SAST scan passed, zero high/crit dependency CVEs, secret leak scan zero |
| **L5** | **Deploy Safety** | Can we ship and undo it? | **DEPLOY** | Staging migration verification, automated rollback dry-run, canary strategy verified |
| **L6** | **Prod Confidence** | Is it working for real users? | **DEPLOY (Monitor) & LEARN** | Real-time telemetry signals, zero error rate spikes, skills & learnings extracted |

## Interaction & Actor Roles

- **Human Owns**: Step 1 (Contract), Step 5 (Accept), Step 6 (PR Review), Step 8 (Deploy).
- **Human Input (◇)**: Step 1 (Ticket + AC authoring), Step 2 (Interactive Plan Q&A clarification).
- **Human Verdict (◆)**: Step 5 (Acceptance sign-off), Step 6 (PR Merge decision), Step 8 (Deploy approval).
- **Agent Executes**: Step 2 (Plan formulation), Step 3 (Bounded implementation), Step 4 (Test & verify), Step 10 (Skill extraction & feedback).
- **Pipeline Re-runs**: Step 7 (CI gate re-runs: tests, linter, security scans), Step 9 (Production signal monitoring).
