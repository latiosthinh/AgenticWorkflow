---
phase: 05-merge-pr-lifecycle-native-ci-gate-verification
plan: 02
subsystem: merge
tags:
  - branch-policies
  - native-ci
  - merge-readiness
  - code-review
  - threads
  - bot-shield
dependency_graph:
  requires:
    - 05-01 (AdoClient GitApi/PolicyApi accessors, PR formatters, PR creation)
  provides:
    - Native ADO branch policy verification reader (src/ado/policy.ts)
    - Two-key merge readiness evaluator (src/ado/policy.ts)
    - Active PR review comment thread extractor (src/ado/threads.ts)
    - Branch policies and merge gates test suite (tests/branch-policies.test.ts)
  affects:
    - 05-03 (PR review rejection rework loop and Ready for QA transition)
tech_stack:
  added: []
  patterns:
    - Querying ADO Policy Evaluations API using CodeReview artifact scheme vstfs:///CodeReview/CodeReviewId/${projectId}/${pullRequestId}
    - Non-orchestrating CI gate verification classifying blocking policies into L2 (reviewers), L3 (build), and L4 (security)
    - Two-key merge protection enforcing [acceptance-approved] tag, reviewer vote >= 5 without negative votes, and green policies
    - Active PR thread comment extraction filtering resolved/closed threads, bot identities, and automated agent loop shield tags
key_files:
  created:
    - src/ado/policy.ts
    - src/ado/threads.ts
    - tests/branch-policies.test.ts
  modified: []
decisions:
  - "Used CodeReview artifact URI format vstfs:///CodeReview/CodeReviewId/${projectId}/${pullRequestId} to query ADO policy evaluations"
  - "Categorized branch policies by keyword classification into L2 (reviewers/quality), L3 (build), and L4 (status/security)"
  - "Enforced two-key merge protection requiring both [acceptance-approved] tag and reviewer vote >= 5 (with zero negative votes) alongside green policies"
  - "Filtered PR discussion threads to skip Fixed, Closed, ByDesign, and deleted threads, while stripping bot-authored comments and <!-- [automated-agent] --> markers"
metrics:
  duration: 4m
  completed_date: "2026-09-09"
  tasks: 2
  files: 3
---

# Phase 05 Plan 02: Native Azure DevOps Branch Policy Verification & Review Thread Extraction Summary

Substantive achievement: Implemented native Azure DevOps branch policy verification (`verifyBranchPolicies`) reading L2/L3/L4 status via CodeReview artifact URIs without hand-rolling CI orchestration; implemented two-key merge readiness evaluation (`evaluateMergeReadiness`) requiring both functional acceptance approval and reviewer consensus; implemented active review comment extraction (`extractActiveReviewComments`) with coordinate mapping and automated agent echo filtering.

## Key Changes

1. **Native Branch Policy Verification (`MRG-03`, `src/ado/policy.ts`):**
   - Implemented `verifyBranchPolicies(projectId, pullRequestId)`:
     - Formulated authoritative artifact URI: `vstfs:///CodeReview/CodeReviewId/${projectId}/${pullRequestId}`.
     - Queried `policyApi.getPolicyEvaluations` wrapped in `withRetry` for exponential backoff on 429 / 5xx responses.
     - Filtered out non-blocking evaluations and `NotApplicable` status evaluations.
     - Classified blocking evaluations into L2 (`reviewer`, `quality`), L3 (`build`), and L4 (`status`, `security`).
     - Tracked `pendingCount` (`Queued`, `Running`) and `failedCount` (`Rejected`, `Broken`).
     - Derived `allApproved: true` only when blocking evaluations exist and both pending and failed counts are zero.
     - Generated human-readable `summary` strings for status reporting.

2. **Two-Key Merge Readiness Gate (`MRG-02`, `src/ado/policy.ts`):**
   - Implemented `evaluateMergeReadiness(options)`:
     - Enforced functional acceptance gate: checked `[acceptance-approved]` tag on work item tags.
     - Enforced human review approval gate: required at least one reviewer vote with `vote >= 5` (approved or approved with suggestions) and zero negative votes (`vote < 0`).
     - Enforced policy gate: required `policyStatus.allApproved === true`.
     - Calculated `canMerge: boolean` and aggregated descriptive diagnostic rejection reasons when blocked.

3. **PR Review Thread Comment Extraction (`MRG-04`, `src/ado/threads.ts`):**
   - Implemented `extractActiveReviewComments(repositoryId, pullRequestId, projectId, botId)`:
     - Queried `gitApi.getThreads` wrapped in `withRetry`.
     - Filtered out threads marked `isDeleted`, `CommentThreadStatus.Fixed`, `CommentThreadStatus.Closed`, or `CommentThreadStatus.ByDesign`.
     - Extracted file path from `threadContext.filePath` (defaulting to `'General Comment'`).
     - Extracted line number from `rightFileStart.line` with fallback to `leftFileStart.line`.
     - Iterated through comments, filtering out deleted comments, comments from `botId`, and comments containing the loop shield `<!-- [automated-agent] -->`.
     - Returned structured `InlineReviewComment[]` array with file path, line number, author, and trimmed comment content.

4. **Unit & Integration Test Suite (`tests/branch-policies.test.ts`):**
   - Created 482-line comprehensive test suite covering all logic paths:
     - Verified `verifyBranchPolicies` when all blocking policies are approved (`allApproved: true`, L2/L3/L4 green).
     - Verified blocking on pending build policies (`Running`/`Queued`) with correct gate flags.
     - Verified blocking on failed security policies (`Rejected`/`Broken`).
     - Verified CodeReview artifact ID formulation (`vstfs:///CodeReview/CodeReviewId/${projectId}/${pullRequestId}`).
     - Verified ignoring non-blocking and `NotApplicable` evaluations.
     - Verified `evaluateMergeReadiness` allowing merge when all three criteria pass.
     - Verified blocking merge when `[acceptance-approved]` is missing.
     - Verified blocking merge when reviewer vote is missing or `< 5`.
     - Verified blocking merge when any reviewer rejects (`vote < 0`).
     - Verified blocking merge when branch policies are pending or failed.
     - Verified `extractActiveReviewComments` extracting coordinates, falling back to line/file defaults, and filtering resolved threads, bot identities, and loop shield echoes.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Mitigation Verification

- **T-05-05 (Elevation of Privilege):** `evaluateMergeReadiness` strictly requires the conjunction of `[acceptance-approved]` tag, reviewer approval (`vote >= 5` without rejections), and green branch policies before merge can proceed.
- **T-05-06 (Tampering):** `extractActiveReviewComments` filters comments by `botId` and strips any content with `<!-- [automated-agent] -->`, preventing prompt injection feedback loops and agent turn recursion.
- **T-05-07 (Information Disclosure):** `extractActiveReviewComments` ignores deleted threads and deleted comments, and provides structured file/line coordinates rather than raw unparsed payloads.
- **T-05-08 (Denial of Service):** All `policyApi` and `gitApi` invocations in `policy.ts` and `threads.ts` are wrapped in `withRetry` with exponential backoff and jitter.

## Self-Check: PASSED

- FOUND: `src/ado/policy.ts`
- FOUND: `src/ado/threads.ts`
- FOUND: `tests/branch-policies.test.ts`
- FOUND commit `f82fd5f`: feat(05-02): implement native branch policy verification and merge readiness
- FOUND commit `7bba2fd`: feat(05-02): implement PR thread comment extraction and branch policy test suite
