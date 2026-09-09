---
phase: 05-merge-pr-lifecycle-native-ci-gate-verification
plan: 03
subsystem: merge
tags:
  - pr-rework
  - circuit-breaker
  - pr-merge
  - ready-for-qa
  - fastify-ingress
dependency_graph:
  requires:
    - 05-01 (PR creation, link relations, formatters)
    - 05-02 (Branch policy verification, review thread extraction)
    - 04-02 (Shared rework circuit breaker)
  provides:
    - PR review rejection rework loop on existing task branches (src/ingress/pr-router.ts)
    - Shared circuit breaker escalation to Blocked across Accept and PR Review gates (src/ingress/pr-router.ts)
    - Automated work item transition to Ready for QA upon PR merge with Merge Summary (src/ado/work-item.ts, src/ingress/pr-router.ts)
    - PR webhook ingress routing with HMAC verification and deduplication (src/ingress/routes.ts)
    - Automatic PR creation on Dev Done state entry (src/execute/router.ts)
    - Test suites for PR rework and merge lifecycle (tests/pr-rework.test.ts, tests/pr-merge.test.ts)
  affects:
    - Phase 6 (QA Stage: Ready for QA work items with [pr-merged] tags)
tech_stack:
  added: []
  patterns:
    - Shared max-2 rework circuit breaker spanning across Accept and PR Review gates
    - In-place task branch rework without reopening duplicate PRs
    - Secure feedback wrapping in <pr_review_feedback> XML boundaries with HTML/script sanitization
    - Atomic SQLite deduplication for git.pullrequest.* service hook deliveries
    - Automated transition to Ready for QA with [pr-merged] tag and policy verification summary
key_files:
  created:
    - src/ingress/pr-router.ts
    - tests/pr-rework.test.ts
    - tests/pr-merge.test.ts
  modified:
    - src/ado/work-item.ts
    - src/ingress/routes.ts
    - src/execute/router.ts
    - src/config/env.ts
decisions:
  - "Integrated shared rework circuit breaker (sourceGate: 'pr_review') capping combined rejections across accept and PR review at 2"
  - "Sanitized reviewer feedback by stripping script/HTML tags and wrapping comments in <pr_review_feedback> XML tags to mitigate prompt injection"
  - "Deduplicated git.pullrequest.* events in SQLite dedup_events table and serialized background processing per work item lane"
  - "Triggered PR creation automatically when tickets enter Dev Done, querying active PRs before creation to guarantee idempotency"
  - "Transitioned merged PRs to Ready for QA with [pr-merged] tag while removing [awaiting-acceptance] and posting a sanitized [Merge Summary] HTML comment"
metrics:
  duration: 6m
  completed_date: "2026-09-09"
  tasks: 2
  files: 7
---

# Phase 05 Plan 03: PR Review Rework Orchestration & Ready for QA Merge Lifecycle Summary

Substantive achievement: Implemented the PR review rejection rework loop bounded by the shared max-2 circuit breaker across Accept and PR Review gates, automated PR creation upon Dev Done state entry, transitioned merged PRs to Ready for QA with full branch policy verification evidence, and wired Fastify ingress routing for `git.pullrequest.*` service hooks.

## Key Changes

1. **Ready for QA Work Item Transitions (`MRG-05`, `src/ado/work-item.ts`):**
   - Implemented `buildMergeReadyForQaPatch(htmlComment, currentTags)`:
     - Replaces `System.State` with `'Ready for QA'`.
     - Adds `[pr-merged]` tag and removes `[awaiting-acceptance]` tag.
     - Attaches sanitized HTML merge summary comment to `System.History`.
   - Implemented `transitionToReadyForQa(workItemId, htmlComment)`:
     - Fetches work item details and applies the Ready for QA patch via `adoClient.updateWorkItem`.

2. **Automated PR Creation on Dev Done (`MRG-01`, `src/execute/router.ts`):**
   - Added `workItem.state === 'Dev Done'` handling in `routeWorkItemEvent`:
     - Queries local L3 evidence for test suite and duration metrics.
     - Formats PR description via `formatPrDescription`.
     - Invokes `createOrGetPullRequest` targeting `task/ticket-{id}-{slug}` branch idempotently.
     - Marks deduplicated event completed in SQLite.

3. **PR Service Hook Router & Rework Loop (`MRG-04`, `MRG-05`, `src/ingress/pr-router.ts`):**
   - Implemented `handlePullRequestEvent(payload, options)`:
     - Extracts `workItemId` from PR title `AB#<id>` or `workItemRefs`.
     - **PR Review Rejection (`git.pullrequest.updated`):**
       - Detects negative reviewer votes (`vote < 0`, e.g. -5 waiting for author or -10 rejected).
       - Evaluates shared circuit breaker (`evaluateCircuitBreaker(workItemId, 'pr_review')`).
       - If breaker trips (>2 bounces): escalates ticket to `Blocked` with `[rework-escalated]`.
       - If allowed: extracts active review comments from PR threads, filters out bot comments and loop shield markers, strips dangerous HTML/script tags (`T-05-10`), formats into `<pr_review_feedback>` XML envelope, and invokes `processWorkItemRework` on the existing task branch.
     - **PR Merged (`git.pullrequest.merged`):**
       - Extracts merge commit SHA from `lastMergeCommit` or `completionOptions.mergeCommitId`.
       - Evaluates branch policy gate status via `verifyBranchPolicies`.
       - Formats merge summary comment via `formatMergeSummaryComment`.
       - Calls `transitionToReadyForQa` to move the ticket into Phase 6 (`Ready for QA`).

4. **Fastify Webhook Ingress Route Extension (`T-05-09`, `T-05-12`, `src/ingress/routes.ts`):**
   - Extended `/api/ado/webhook` route to accept `git.pullrequest.created`, `git.pullrequest.updated`, and `git.pullrequest.merged`.
   - Validates HMAC SHA-256 signatures with constant-time equality check (`T-05-09`).
   - Deduplicates PR events atomically using payload hash in SQLite `dedup_events` (`T-05-12`).
   - Dispatches background PR processing into dedicated concurrency=1 per-ticket lane queues.

5. **Test Suites (`tests/pr-rework.test.ts`, `tests/pr-merge.test.ts`):**
   - `tests/pr-rework.test.ts` (287 lines, 7 tests): Tests reviewer rejection detection, shared circuit breaker progression across gates, escalation to Blocked, prompt injection HTML stripping, and thread comment filtering.
   - `tests/pr-merge.test.ts` (285 lines, 8 tests): Tests Ready for QA patch generation, `transitionToReadyForQa`, `git.pullrequest.merged` event handling with branch policy verification, Fastify webhook ingestion, and deduplication.

## Deviations from Plan

None - plan executed exactly as specified.

## Verification Results

- Automated test execution:
  - `npx vitest run tests/pr-rework.test.ts tests/pr-merge.test.ts`: Passed (15/15 tests across 2 suites in 2.19s).
  - `npx vitest run`: Passed (220/220 tests across 23 suites in 36.36s).
  - `npx tsc --noEmit`: Clean compilation with zero errors.

## Self-Check: PASSED

- FOUND: src/ado/work-item.ts
- FOUND: src/ingress/pr-router.ts
- FOUND: src/ingress/routes.ts
- FOUND: src/execute/router.ts
- FOUND: tests/pr-rework.test.ts
- FOUND: tests/pr-merge.test.ts
- FOUND: commit 580e7e4
- FOUND: commit e7ec150
