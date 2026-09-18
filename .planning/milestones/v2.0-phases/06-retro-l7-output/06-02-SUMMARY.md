---
phase: 06-retro-l7-output
plan: 02
subsystem: learn
tags:
  - retro
  - l7
  - publisher
  - harvester
  - orchestrator
  - statestore
dependency_graph:
  requires:
    - "06-01"
  provides:
    - "dual-asset-publisher"
    - "l7-statestore-persistence"
    - "harvest-metrics"
  affects:
    - "06-03"
tech-stack:
  added: []
  patterns:
    - "single-PR dual-asset staging under .claude/skills/<name>/"
    - "fail-closed L7 record persistence in StateStore within lane lock"
    - "ephemeral branch staging for learned assets"
key-files:
  created:
    - tests/learn-publisher.test.ts
  modified:
    - src/learn/harvester.ts
    - src/learn/publisher.ts
    - src/learn/worker.ts
    - tests/learn-orchestrator.test.ts
    - .gitignore
decisions:
  - "Stage both SKILL.md and RUNBOOK.md under .claude/skills/<name>/ in a single PR to eliminate review churn"
  - "Omit RUNBOOK.md from PR staging when hasChanges is false, marking PR description with (no operational changes required)"
  - "Persist complete L7EvidenceState to draft.retroRecords and draft.l7Evidence within workItemQueueManager.runInLane prior to ADO notification comment"
metrics:
  duration: 4m
  completed_date: "2026-09-18"
---

# Phase 6 Plan 02: Harvester Enhancement, Dual-Asset Staging & L7 Persistence Summary

Enhanced ticket lifecycle data harvesting, implemented dual-asset (SKILL.md + RUNBOOK.md) single-PR publishing on ephemeral branches, and orchestrated continuous learning loop with L7 evidence persistence into file-backed StateStore.

## Key Changes

### 1. Harvester Metric Extraction (`src/learn/harvester.ts`)
- Extracted `smokeEvidence`, `scopeLock.iterationCount`, `qaRuns.length`, and `flakeCleared` from StateStore ticket state.
- Populated `smokePassed`, `smokeStatus`, `scopeRejections`, `qaStrikes`, and `smokeFlakes` onto `TicketLifecycleData`.

### 2. Dual-Asset Single-PR Publisher (`src/learn/publisher.ts`)
- Extended `stageAndPublishSkillPr` to accept optional `LearnedRunbook`.
- Staged both `SKILL.md` and `RUNBOOK.md` under `.claude/skills/<skill-name>/` when `runbook.hasChanges` is true.
- Omitted `RUNBOOK.md` and added `*(no operational changes required)*` note in PR description when runbook has no changes.
- Staged exclusively to ephemeral branch `skills/learn-ticket-<id>-<slug>` targeting `main` via `createOrGetPullRequest`.

### 3. Learning Feedback Loop Orchestrator (`src/learn/worker.ts`)
- Coordinated sequential execution of lifecycle harvesting, retro synthesis, runbook generation, skill generation, and dual-asset PR staging.
- Formatted `L7EvidenceState` containing retro takeaways, prioritized action items, PR URLs (`runbookDiffPrUrl` and `skillPrUrl`), gate friction counts, and DORA trend deltas.
- Persisted full L7 record to `draft.retroRecords` and `draft.l7Evidence` within `workItemQueueManager.runInLane` to prevent race conditions and ensure auditability (T-06-04 mitigation).
- Attached notification comment with loop shield to work item discussion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Config] Added `.claude/` to `.gitignore`**
- **Found during:** Task 2 commit preparation
- **Issue:** Local test executions without explicit `repoRoot` created local `.claude/skills/` directories, polluting git status as untracked files.
- **Fix:** Added `.claude/` to `.gitignore`.
- **Files modified:** `.gitignore`
- **Commit:** `69d27db`

## Self-Check: PASSED

- Found `src/learn/harvester.ts`: verified
- Found `src/learn/publisher.ts`: verified
- Found `src/learn/worker.ts`: verified
- Found `tests/learn-publisher.test.ts`: verified
- Found `tests/learn-orchestrator.test.ts`: verified
- Commit `510e47f`: verified (RED Task 1)
- Commit `9601545`: verified (GREEN Task 1)
- Commit `efd8137`: verified (RED Task 2)
- Commit `69d27db`: verified (GREEN Task 2)
