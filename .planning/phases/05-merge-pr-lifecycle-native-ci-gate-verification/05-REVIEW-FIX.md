---
phase: 05-merge-pr-lifecycle-native-ci-gate-verification
fixed_at: 2026-09-09T11:08:00Z
review_path: .planning/phases/05-merge-pr-lifecycle-native-ci-gate-verification/05-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 05: Code Review Fix Report

**Fixed at:** 2026-09-09T11:08:00Z
**Source review:** .planning/phases/05-merge-pr-lifecycle-native-ci-gate-verification/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 10
- Fixed: 10
- Skipped: 0

## Fixed Issues

### WR-01: Branch Name Mismatch for Titles > 40 Chars in `router.ts` Breaks PR Creation

**Files modified:** `src/execute/router.ts`
**Commit:** 80eed3e
**Applied fix:** Imported and used `slugify()` from `src/utils/paths.ts` in `routeWorkItemEvent` when generating task branch names on `Dev Done` state transitions, ensuring consistent 40-character truncation and formatting matching `src/sandbox/worktree.ts`.

### WR-02: Fail-Open Defaulting of Branch Policy Gates on API Exceptions in `pr-router.ts`

**Files modified:** `src/ingress/pr-router.ts`, `tests/pr-merge.test.ts`
**Commit:** 5a3e9fb
**Applied fix:** Changed exception catch block in `verifyBranchPolicies` call to default all policy gate pass flags (`allApproved`, `l2ReviewersPassed`, `l3BuildPassed`, `l4SecurityPassed`) to `false` with diagnostic message instead of `true`, preventing false compliance assertions when policy verification API fails.

### WR-03: Bot Push Re-Triggers PR Review Rework and Exhausts Circuit Breaker

**Files modified:** `src/ingress/pr-router.ts`, `tests/pr-rework.test.ts`
**Commit:** 2334a90
**Applied fix:** Added checks in `git.pullrequest.updated` event handler to early exit if work item is already in `Blocked` state or if `lastMergeSourceCommit` author/committer ID matches `ADO_BOT_ID`, preventing automated rework loops from re-triggering on bot pushes.

### WR-04: `sanitizeComment` Destroys Generic Types and Code Snippets in Review Feedback

**Files modified:** `src/ingress/pr-router.ts`, `tests/pr-rework.test.ts`
**Commit:** c4e7659
**Applied fix:** Replaced `sanitizeHtml` with empty allowed tags by targeted regex stripping `<script>` and `<iframe>` executable tags and `<img>` tags while preserving generic type parameters (e.g. `Map<string, number>`) and JSX tags.

### WR-05: Missing `CommentThreadStatus.WontFix` and System Comment Filtering in `threads.ts`

**Files modified:** `src/ado/threads.ts`, `tests/branch-policies.test.ts`
**Commit:** 10b4224
**Applied fix:** Added `CommentThreadStatus.WontFix` to thread resolution filter and added `comment.commentType === CommentType.System` filter to ignore system telemetry comments.

### IN-01: Hardcoded `diffStat` and Unordered `l3Evidence` Lookup in `src/execute/router.ts:98, 118-121`

**Files modified:** `src/execute/router.ts`
**Commit:** 1adf23f
**Applied fix:** Added `orderBy(desc(l3Evidence.id))` to retrieve the latest execution evidence for `Dev Done` tickets and implemented `parseDiffStat` to extract LOC and files changed from `evidence.gitDiffStat` with sensible defaults.

### IN-02: Target Branch Defaults to Hardcoded `'main'` Without Env Fallback in `src/ado/git.ts:25`

**Files modified:** `src/config/env.ts`, `src/ado/git.ts`
**Commit:** 119e224
**Applied fix:** Added `ADO_DEFAULT_BRANCH` configuration parameter with `'main'` default in `src/config/env.ts` and referenced `env.ADO_DEFAULT_BRANCH` in `createOrGetPullRequest`.

### IN-03: Loose `Promise<any>` Return Type in `src/ado/work-item.ts:241`

**Files modified:** `src/ado/work-item.ts`
**Commit:** b04cb2f
**Applied fix:** Explicitly typed `transitionToReadyForQa` return type as `Promise<WorkItem>` importing `WorkItem` from `azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js`.

### IN-04: Numeric Magic Number `status: 1` in `src/ado/git.ts:33`

**Files modified:** `src/ado/git.ts`
**Commit:** 07cfa09
**Applied fix:** Imported `PullRequestStatus` enum and replaced numeric literal `1` with `PullRequestStatus.Active`.

### IN-05: Unfiltered Empty or Whitespace-Only Comments in `src/ado/threads.ts:57-63`

**Files modified:** `src/ado/threads.ts`, `tests/branch-policies.test.ts`
**Commit:** 1172062
**Applied fix:** Added check `!content ||` in `extractActiveReviewComments` to skip empty or whitespace-only review comments.

---

_Fixed: 2026-09-09T11:08:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
