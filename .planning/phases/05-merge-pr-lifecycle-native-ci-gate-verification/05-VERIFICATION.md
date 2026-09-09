---
phase: 05-merge-pr-lifecycle-native-ci-gate-verification
verified: 2026-09-09T11:15:00Z
status: human_needed
score: 15/15 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Visual inspection of PR description and ArtifactLink in ADO Repos/Boards"
    expected: "Pull Request opened targeting main with AB#<id> title prefix, markdown L1 scope/immutability checklist, L3 pre-PR test summary table, and bidirectional ArtifactLink registered on work item."
    why_human: "Verifying Azure DevOps Repos markdown rendering, discussion UI badges, and work item Links tab display requires live Azure DevOps browser inspection."
  - test: "End-to-end webhook delivery on live PR vote and PR merge"
    expected: "Reviewer vote rejection (-5 or -10) moves ticket back to In Dev, triggers rework on existing task branch, and pushes commits to existing PR. PR completion/merge triggers webhook, verifies branch policies, transitions ticket to Ready for QA, and posts Merge Summary HTML comment."
    why_human: "Requires active ADO organization service hooks delivering real webhook payloads to Fastify ingress endpoint over HTTPS."
---

# Phase 5: MERGE — PR Lifecycle & Native CI Gate Verification Report

**Phase Goal:** PR review orchestration with native branch-policy enforcement (L2/L3/L4) and merge transition.
**Verified:** 2026-09-09T11:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | Agent creates Azure Repos PR targeting main with `AB#<id>` in title and L1/L3 evidence summary in description | ✓ VERIFIED | Implemented in `src/ado/git.ts` (`createOrGetPullRequest`) and `src/ado/formatter.ts` (`formatPrDescription`), verified in `tests/pr-lifecycle.test.ts`. |
| 2   | PR creation registers bidirectional `ArtifactLink` relationship on the work item | ✓ VERIFIED | `createOrGetPullRequest` updates work item with `ArtifactLink` JSON patch (`vstfs:///Git/PullRequestId/...`), verified in `tests/pr-lifecycle.test.ts`. |
| 3   | Existing active PR on task branch is detected and returned without opening duplicate PR | ✓ VERIFIED | `gitApi.getPullRequests` checks for active PRs on source and target refs, verified in `tests/pr-lifecycle.test.ts`. |
| 4   | `AdoClient` provides `getGitApi()` and `getPolicyApi()` wrapped in exponential backoff retry for HTTP 429/5xx errors | ✓ VERIFIED | Implemented in `src/ado/client.ts`, verified across `tests/ado-client.test.ts` and `tests/pr-lifecycle.test.ts`. |
| 5   | `formatPrDescription` outputs structured markdown with `<250 LOC` checklist, test immutability verification, and L3 test run metrics | ✓ VERIFIED | Implemented in `src/ado/formatter.ts` with `<!-- [automated-agent] -->` shield, verified in `tests/pr-lifecycle.test.ts`. |
| 6   | Work item transition to `Dev Done` automatically invokes `createOrGetPullRequest` with slugified task branch and L3 evidence | ✓ VERIFIED | Implemented in `src/execute/router.ts` (lines 127-181) using `slugify(workItem.title)` and latest `l3Evidence` record. |
| 7   | Two-key merge gate blocks merge when work item lacks `[acceptance-approved]` tag | ✓ VERIFIED | Implemented in `src/ado/policy.ts` (`evaluateMergeReadiness`), verified in `tests/branch-policies.test.ts`. |
| 8   | Two-key merge gate blocks merge when reviewer approval vote is missing (`vote < 5`) or rejected (`vote < 0`) | ✓ VERIFIED | Implemented in `src/ado/policy.ts` (`evaluateMergeReadiness`), verified in `tests/branch-policies.test.ts`. |
| 9   | Branch policy evaluation reads native ADO evaluation records via CodeReview artifact URI `vstfs:///CodeReview/CodeReviewId/${projectId}/${pullRequestId}` | ✓ VERIFIED | Implemented in `src/ado/policy.ts` (`verifyBranchPolicies`), verified in `tests/branch-policies.test.ts`. |
| 10  | Branch policy evaluation blocks merge when any blocking policy (Build L3, Reviewers L2, Security L4) is Queued, Running, Rejected, or Broken | ✓ VERIFIED | Implemented in `src/ado/policy.ts` (`verifyBranchPolicies`), verified in `tests/branch-policies.test.ts`. |
| 11  | `extractActiveReviewComments` extracts file-specific review comments and line numbers, excluding closed/fixed/wontfix threads, deleted comments, system comments, and bot echoes | ✓ VERIFIED | Implemented in `src/ado/threads.ts`, verified in `tests/branch-policies.test.ts`. |
| 12  | PR review rejection webhook (`git.pullrequest.updated` with negative reviewer vote) evaluates shared circuit breaker | ✓ VERIFIED | Implemented in `src/ingress/pr-router.ts` calling `evaluateCircuitBreaker(workItemId, 'pr_review')`, verified in `tests/pr-rework.test.ts`. |
| 13  | Combined bounces exceeding 2 across Accept and PR Review trip circuit breaker, escalating ticket to `Blocked` with `[rework-escalated]` | ✓ VERIFIED | Implemented in `src/ingress/pr-router.ts` calling `escalateReworkToBlocked`, verified in `tests/pr-rework.test.ts`. |
| 14  | Review rejection within bounce budget triggers rework pipeline on existing task branch, updating PR in-place | ✓ VERIFIED | Implemented in `src/ingress/pr-router.ts` calling `processWorkItemRework`, verified in `tests/pr-rework.test.ts`. |
| 15  | PR merge webhook (`git.pullrequest.merged`) transitions work item to `Ready for QA` with `[pr-merged]` tag and posts sanitized HTML `[Merge Summary]` comment | ✓ VERIFIED | Implemented in `src/ingress/pr-router.ts` and `src/ado/work-item.ts` (`transitionToReadyForQa`), verified in `tests/pr-merge.test.ts`. |

**Score:** 15/15 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/ado/client.ts` | `getGitApi` and `getPolicyApi` accessors with retry wrapping and mock setters | ✓ VERIFIED | 138 LOC; provides typed client accessors, exponential backoff with retry-after header support, and mock injection hooks. |
| `src/ado/formatter.ts` | `formatPrDescription` and `formatMergeSummaryComment` formatters | ✓ VERIFIED | 121 LOC; generates markdown PR description with L1/L3 checklist and sanitized HTML merge summary comment with L2/L3/L4 policy results. |
| `src/ado/git.ts` | `createOrGetPullRequest` and `getPullRequest` Git API helpers | ✓ VERIFIED | 79 LOC; checks for existing active PRs, resolves default branch, creates PR with `AB#` title, and registers `ArtifactLink` on work item. |
| `src/ado/policy.ts` | `verifyBranchPolicies` and `evaluateMergeReadiness` functions | ✓ VERIFIED | 122 LOC; reads native ADO policy evaluations via CodeReview artifact URI and evaluates two-key merge readiness gate. |
| `src/ado/threads.ts` | `extractActiveReviewComments` PR discussion thread comment extractor | ✓ VERIFIED | 70 LOC; extracts file paths and line numbers, filtering closed/wontfix threads, deleted comments, system events, and bot echoes. |
| `src/ado/work-item.ts` | `buildMergeReadyForQaPatch` and `transitionToReadyForQa` patch builders | ✓ VERIFIED | 252 LOC; updates `System.State` to `Ready for QA`, applies `[pr-merged]` tag, removes `[awaiting-acceptance]`, and appends merge comment. |
| `src/execute/router.ts` | Event router dispatching PR creation upon work item `Dev Done` state transition | ✓ VERIFIED | 217 LOC; selects latest `l3Evidence`, formats PR description, computes slugified branch name, and invokes `createOrGetPullRequest`. |
| `src/ingress/pr-router.ts` | `handlePullRequestEvent` router handling `git.pullrequest` service hooks | ✓ VERIFIED | 189 LOC; routes review rejections through shared circuit breaker and rework pipeline, and routes merges to `Ready for QA`. |
| `src/ingress/routes.ts` | Webhook ingress route supporting `git.pullrequest.*` events with HMAC & dedup | ✓ VERIFIED | 192 LOC; verifies HMAC signature, deduplicates PR events in SQLite, and delegates execution to serial work item queue. |
| `tests/pr-lifecycle.test.ts` | Test suite for PR creation, description formatting, and ArtifactLink registration (MRG-01) | ✓ VERIFIED | 275 LOC (min 80 required); 8 tests passing in 475ms. |
| `tests/branch-policies.test.ts` | Test suite for native branch policies and two-key merge readiness evaluation (MRG-02, MRG-03) | ✓ VERIFIED | 519 LOC (min 100 required); 17 tests passing in 399ms. |
| `tests/pr-rework.test.ts` | Test suite for PR review rejection, comment extraction, and shared circuit breaker (MRG-04) | ✓ VERIFIED | 397 LOC (min 80 required); 10 tests passing in 930ms. |
| `tests/pr-merge.test.ts` | Test suite for PR merge handling, Fastify webhook ingress, and Ready for QA transition (MRG-05) | ✓ VERIFIED | 380 LOC (min 80 required); 9 tests passing in 1.48s. |
| `tests/ado-client.test.ts` | Unit tests for AdoClient API accessors, retry mechanism, and error handling | ✓ VERIFIED | 172 LOC; 22 tests passing in 1.64s. |

---

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `src/ado/git.ts` | `src/ado/client.ts` | `adoClient.getGitApi()` | ✓ WIRED | Line 27: retrieves typed `GitApi` client with connection caching. |
| `src/ado/git.ts` | `src/ado/client.ts` | `adoClient.updateWorkItem()` | ✓ WIRED | Lines 61-74: registers `ArtifactLink` relation with `vstfs:///Git/PullRequestId` URI. |
| `src/ado/policy.ts` | `src/ado/client.ts` | `adoClient.getPolicyApi()` | ✓ WIRED | Line 29: retrieves typed `PolicyApi` client with connection caching. |
| `src/ado/threads.ts` | `src/ado/client.ts` | `adoClient.getGitApi()` | ✓ WIRED | Line 21: queries PR discussion threads via `gitApi.getThreads()`. |
| `src/ado/policy.ts` | ADO Policy API | `vstfs:///CodeReview/CodeReviewId/${projectId}/${pullRequestId}` | ✓ WIRED | Line 30: formulates standard CodeReview artifact URI for policy evaluations. |
| `src/ingress/pr-router.ts` | `src/accept/breaker.ts` | `evaluateCircuitBreaker(workItemId, 'pr_review')` | ✓ WIRED | Line 104: queries shared circuit breaker across accept and review gates. |
| `src/ingress/pr-router.ts` | `src/execute/rework-worker.ts` | `processWorkItemRework()` | ✓ WIRED | Line 138: dispatches rework pipeline reusing existing task branch. |
| `src/ingress/pr-router.ts` | `src/ado/work-item.ts` | `transitionToReadyForQa()` | ✓ WIRED | Line 186: applies state transition and merge summary comment to work item. |
| `src/ingress/routes.ts` | `src/ingress/pr-router.ts` | `handlePullRequestEvent()` | ✓ WIRED | Lines 17, 95: invokes PR router within serialized per-ticket queue worker. |
| `src/execute/router.ts` | `src/ado/git.ts` | `createOrGetPullRequest()` | ✓ WIRED | Line 164: automatically opens or links active PR when ticket reaches `Dev Done`. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `src/ado/formatter.ts` | `PrDescriptionOptions` | `l3Evidence` SQLite table + ticket AC + parsed git diff stats | Yes (real LOC count, test metrics, and criteria blockquote) | ✓ FLOWING |
| `src/ado/git.ts` | `GitPullRequest` | `gitApi.createPullRequest` / `gitApi.getPullRequests` | Yes (real Azure Repos PR object, pullRequestId, refs) | ✓ FLOWING |
| `src/ado/policy.ts` | `PolicyEvaluationRecord[]` | `policyApi.getPolicyEvaluations` via CodeReview artifact URI | Yes (reads live/mocked policy status, types, blocking configs) | ✓ FLOWING |
| `src/ado/threads.ts` | `InlineReviewComment[]` | `gitApi.getThreads` | Yes (extracts real file paths, line numbers, reviewer comments) | ✓ FLOWING |
| `src/ingress/pr-router.ts` | PR service hook payload | ADO webhook POST `/api/ado/webhook` with HMAC validation | Yes (parses resource ID, reviewers array, lastMergeCommit, refs) | ✓ FLOWING |
| `src/ado/work-item.ts` | `JsonPatchDocument` | `buildMergeReadyForQaPatch` | Yes (constructs operational patch for State, Tags, and History) | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| PR Lifecycle & Git Operations test suite | `npx vitest run tests/pr-lifecycle.test.ts` | 1 file, 8 passed (8) in 475ms | ✓ PASS |
| Branch Policies & Merge Readiness test suite | `npx vitest run tests/branch-policies.test.ts` | 1 file, 17 passed (17) in 399ms | ✓ PASS |
| PR Review Rejection & Circuit Breaker test suite | `npx vitest run tests/pr-rework.test.ts` | 1 file, 10 passed (10) in 930ms | ✓ PASS |
| PR Merge & Ready for QA Transition test suite | `npx vitest run tests/pr-merge.test.ts` | 1 file, 9 passed (9) in 1.48s | ✓ PASS |
| ADO Client & Retry Engine test suite | `npx vitest run tests/ado-client.test.ts` | 1 file, 22 passed (22) in 1.64s | ✓ PASS |
| All Phase 5 related test suites | `npx vitest run tests/ado-client.test.ts tests/branch-policies.test.ts tests/pr-lifecycle.test.ts tests/pr-merge.test.ts tests/pr-rework.test.ts` | 5 files, 66 passed (66) in 4.44s | ✓ PASS |
| Entire project test regression suite | `npm test` | 23 files, 225 passed (225) in 36.63s | ✓ PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| MRG-01 | 05-01-PLAN | Agent pushes task branch and creates Azure Repos PR linked via `AB#<id>` with L1/L3 evidence summary in PR description. | ✓ SATISFIED | Implemented in `src/ado/git.ts` (`createOrGetPullRequest`), `src/ado/formatter.ts` (`formatPrDescription`), and `src/execute/router.ts`; verified in `tests/pr-lifecycle.test.ts`. |
| MRG-02 | 05-02-PLAN | Human reviewer conducts code review and renders PR merge verdict (◆); merge blocked until acceptance (ACCP-02) passed. | ✓ SATISFIED | Implemented in `src/ado/policy.ts` (`evaluateMergeReadiness`), checking both `[acceptance-approved]` tag and human reviewer vote `>= 5` without negative votes; verified in `tests/branch-policies.test.ts`. |
| MRG-03 | 05-02-PLAN | System verifies native ADO branch policy gate status before merge: build validation green (L3 re-run), code quality scans (L2), security/SAST scans (L4). No custom CI orchestration — branch policies are the enforcement; system reads status only. | ✓ SATISFIED | Implemented in `src/ado/policy.ts` (`verifyBranchPolicies`) reading policy evaluation records via `vstfs:///CodeReview/CodeReviewId/${projectId}/${pullRequestId}`; verified in `tests/branch-policies.test.ts`. |
| MRG-04 | 05-03-PLAN | PR review rejection moves ticket back to "In Dev" and re-triggers rework agent with cumulative envelope (original AC + prior diff + review comments); shares ACCP-03 breaker. | ✓ SATISFIED | Implemented in `src/ingress/pr-router.ts` on `git.pullrequest.updated` negative votes, evaluating `evaluateCircuitBreaker(workItemId, 'pr_review')` and invoking `processWorkItemRework` on existing branch; verified in `tests/pr-rework.test.ts`. |
| MRG-05 | 05-03-PLAN | Successful merge transitions ticket to "Ready for QA" and posts merge summary to work item. | ✓ SATISFIED | Implemented in `src/ingress/routes.ts` and `src/ingress/pr-router.ts` on `git.pullrequest.merged`, verifying branch policies and applying `transitionToReadyForQa` with `[pr-merged]` tag and `[Merge Summary]` HTML comment; verified in `tests/pr-merge.test.ts`. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| None | - | None | - | Clean codebase; zero TODO/FIXME comments, stubs, or unhandled early exits found. All 10 code review findings from 05-REVIEW.md were resolved and committed in 05-REVIEW-FIX.md. |

---

### Human Verification Required

### 1. Visual Inspection of PR Description and ArtifactLink in ADO Repos/Boards

**Test:** Inspect an opened Pull Request and linked work item in Azure DevOps at `Dev Done` state.
**Expected:** The Pull Request description contains formatted markdown with `AB#<id>` header, `<250 LOC` checklist, test assertion file immutability notice, and L3 test run metrics. The work item Links tab displays an active bidirectional `ArtifactLink` pointing to the Pull Request.
**Why human:** Automated tests verify markdown generation and JSON patch construction, but live web UI rendering and link interactivity in Azure DevOps Boards and Repos requires visual inspection.

### 2. Live Webhook Delivery on PR Rejection and Merge

**Test:** In a live Azure DevOps repository, vote "Reject" or "Waiting for author" on an open PR with inline file comments, and subsequently complete/merge the PR once approved.
**Expected:** Negative vote triggers rework on the existing task branch, addressing inline comments and updating the existing PR. PR completion/merge triggers webhook, verifies branch policies, transitions ticket to `Ready for QA` with tag `[pr-merged]`, and posts `[Merge Summary]` HTML comment.
**Why human:** Automated integration tests mock the ADO REST client; testing live webhook ingress and HMAC signature verification against Microsoft Azure DevOps servers requires human deployment.

---

### Gaps Summary

No functional gaps blocking Phase 5 goals were identified. All five requirements (`MRG-01`, `MRG-02`, `MRG-03`, `MRG-04`, `MRG-05`) are fully satisfied in implemented code, wired end-to-end, and covered by comprehensive unit and integration test suites (66 Phase 5 tests passing; 225 total project tests passing).

All 10 code review findings identified in `05-REVIEW.md` were remediated in atomic commits (including branch name slugification, fail-closed branch policy defaults, bot push filtering, generic type preservation in review comments, and empty comment filtering).

The project is ready to proceed to Phase 6: QA — Verification Loop.

---

_Verified: 2026-09-09T11:15:00Z_
_Verifier: the agent (gsd-verifier)_
