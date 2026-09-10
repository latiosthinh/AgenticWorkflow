---
phase: 04-accept-human-validation-gate-rework-breaker
plan: 03
subsystem: accept
tags:
  - verdict-detection
  - rework-envelope
  - task-branch-resumption
  - circuit-breaker
  - router
  - integration-tests
dependency_graph:
  requires:
    - 04-01 (Acceptance packet formatter and Dev Done transition patch)
    - 04-02 (Shared rework circuit breaker and SQLite schema)
  provides:
    - Human verdict detector for approve, reject, and reset tokens (src/accept/verdict.ts)
    - Cumulative rework prompt envelope with LOC budget and review feedback (src/accept/envelope.ts)
    - Git worktree manager branch resumption via checkoutExistingBranch (src/sandbox/worktree.ts)
    - ADO work item helpers transitionToDevDoneWithPacket and escalateReworkToBlocked (src/ado/work-item.ts)
    - Rework worker pipeline processWorkItemRework (src/execute/rework-worker.ts)
    - Router integration for acceptance verdict, breaker, and rework (src/execute/router.ts)
  affects:
    - Phase 5 (PR Review gate rework loop reusing branch resumption and breaker)
tech_stack:
  added: []
  patterns:
    - State transition and comment-based verdict classification with token stripping
    - XML delimited cumulative rework prompt context with remaining LOC budget calculation
    - Ephemeral git worktree reuse with checkoutExistingBranch preserving task branch history
    - Guarded rework execution enforcing cumulative LOC ceiling (<250 LOC) and test immutability
    - Conventional commit fix(review): address acceptance feedback\n\nAB#<id>
key_files:
  created:
    - src/accept/verdict.ts
    - src/accept/envelope.ts
    - src/execute/rework-worker.ts
    - tests/verdict-detector.test.ts
    - tests/rework-integration.test.ts
  modified:
    - src/sandbox/worktree.ts
    - src/ado/work-item.ts
    - src/execute/router.ts
decisions:
  - "Detected human acceptance verdicts using both state transitions (Dev Done -> Ready for QA / In Dev) and explicit comment tokens ([approve-acceptance], [reject-acceptance], [reset-rework]) with loop shields and markers stripped from feedback"
  - "Preserved task branch history on rework turns via checkoutExistingBranch in createWorktree, bypassing branch deletion and reusing existing branch commits"
  - "Calculated base commit dynamically using git merge-base against base branch candidates (origin/main, master, etc.) to evaluate cumulative diff strictly across ticket changes"
  - "Integrated router event handling: approve tags [acceptance-approved], reject routes through circuit breaker (bounces <= 2 trigger rework, bounce 3 escalates to Blocked with [rework-escalated]), and [reset-rework] resets the counter"
metrics:
  duration: 6m
  completed_date: "2026-09-09"
  tasks: 2
  files: 8
---

# Phase 04 Plan 03: Human Acceptance Gate & Rework Pipeline Summary

Substantive achievement: Implemented human verdict detection for acceptance approval, rejection, and counter reset; built cumulative rework prompt envelopes with remaining LOC constraints; extended git worktree management to preserve task branch history during rework; implemented the complete end-to-end rework execution pipeline; and wired event routing with automated circuit breaker escalation.

## Key Changes

1. **Human Acceptance Verdict Detection (`ACCP-02`, `src/accept/verdict.ts`):**
   - Implemented `detectAcceptanceVerdict` classifying events into `approve`, `reject`, `reset_rework`, or `none`.
   - Recognizes approvals via state transitions from `Dev Done` to `Ready for QA` / `Approved` or via `[approve-acceptance]` comment token.
   - Recognizes rejections via state transitions from `Dev Done` to `In Dev`, `[awaiting-acceptance]` tag with `In Dev`, or `[reject-acceptance]` comment token.
   - Strips `[reject-acceptance]`, `<!-- [automated-agent] -->`, and HTML comments from human feedback.
   - Recognizes `[reset-rework]` token to clear circuit breaker bounce count.
   - Verified via unit tests in `tests/verdict-detector.test.ts`.

2. **Cumulative Rework Context Envelope (`ACCP-02`, `src/accept/envelope.ts`):**
   - Implemented `formatReworkPrompt` encapsulating `originalAcceptanceCriteria`, `priorGitDiff`, `reviewFeedback`, and `budget_constraints`.
   - Explicitly calculates remaining LOC budget (`Math.max(0, envelope.remainingLocBudget)`) against 250 LOC ceiling.
   - Enforces read-only baseline test constraints and mandates preserving valid AC.

3. **Git Worktree Branch Resumption (`ACCP-02`, `src/sandbox/worktree.ts`):**
   - Extended `createWorktree` with `CreateWorktreeOptions.checkoutExistingBranch`.
   - When `checkoutExistingBranch: true`, attaches worktree directly to the existing task branch using `git worktree add <path> <branch>` without deleting the branch via `branch -D`.
   - Preserves all pre-existing commits on the branch across rework cycles.

4. **ADO Work Item Helpers (`ACCP-02`, `ACCP-03`, `src/ado/work-item.ts`):**
   - Added `transitionToDevDoneWithPacket(workItemId, htmlComment)` updating work item to `Dev Done` with `[awaiting-acceptance]` tag and acceptance packet history.
   - Added `escalateReworkToBlocked(workItemId, bounceCount)` updating work item to `Blocked` with `[rework-escalated]` tag and escalation comment.

5. **Rework Execution Worker (`ACCP-02`, `src/execute/rework-worker.ts`):**
   - Implemented `processWorkItemRework(workItemId, revId, feedbackText, options)`:
     - Attaches worktree to existing task branch via `checkoutExistingBranch: true`.
     - Calculates prior cumulative diff against merge-base of base branch.
     - Builds cumulative rework envelope and formats prompt.
     - Runs bounded code edits and guards cumulative LOC diff (<250 LOC).
     - Validates test assertion immutability and package dependency changes.
     - Executes test runner and repair loop.
     - Commits changes using `fix(review): address acceptance feedback\n\nAB#<workItemId>`.
     - Records L3 test evidence in SQLite.
     - Formats new Acceptance Packet and transitions work item back to `Dev Done`.

6. **Router Integration (`ACCP-02`, `ACCP-03`, `src/execute/router.ts`):**
   - Evaluates verdict before state handling.
   - `reset_rework`: calls `resetCircuitBreaker`.
   - `approve`: updates tags to add `[acceptance-approved]` and remove `[awaiting-acceptance]`.
   - `reject`: evaluates `evaluateCircuitBreaker('accept')`. If allowed, triggers `processWorkItemRework`. If tripped (>2 bounces), calls `escalateReworkToBlocked`.

7. **Integration Test Suite (`tests/rework-integration.test.ts`):**
   - Test 1: Human approve updates tags to `[acceptance-approved]` and removes `[awaiting-acceptance]`.
   - Test 2: Rejection triggers rework worker, resumes branch, commits `fix(review)`, and re-transitions to `Dev Done`.
   - Test 3: 3rd rejection trips circuit breaker and escalates ticket to `Blocked` with `[rework-escalated]`.
   - Test 4: `[reset-rework]` resets counter and enables subsequent rework turns.
   - Test 5: Rejection exceeding cumulative LOC ceiling flags ticket `Blocked` with `diff-ceiling`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Base commit calculation using merge-base against base branch**
- **Found during:** Task 2 verification of Test 2
- **Issue:** In local repositories or test environments without an `origin/main` remote, resolving base commit via `HEAD~1` included previous commits from `master` into the cumulative diff calculation, falsely tripping the 250 LOC ceiling.
- **Fix:** Resolved base branch candidates (`origin/main`, `master`, `main`) and evaluated `git merge-base HEAD <baseRef>`, isolating the cumulative diff strictly to commits on the task branch.
- **Files modified:** `src/execute/rework-worker.ts`
- **Commit:** `36097fa`

## Self-Check: PASSED

- FOUND: `src/accept/verdict.ts`
- FOUND: `src/accept/envelope.ts`
- FOUND: `src/sandbox/worktree.ts`
- FOUND: `src/ado/work-item.ts`
- FOUND: `src/execute/rework-worker.ts`
- FOUND: `src/execute/router.ts`
- FOUND: `tests/verdict-detector.test.ts`
- FOUND: `tests/rework-integration.test.ts`
- FOUND commit `6029a09`: feat(04-03): implement verdict detection, cumulative rework envelope, and worktree branch resumption
- FOUND commit `36097fa`: feat(04-03): implement rework execution worker, ADO helpers, and router integration
