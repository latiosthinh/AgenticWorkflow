---
phase: 05-merge-pr-lifecycle-native-ci-gate-verification
reviewed: 2026-09-09T11:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - src/ado/client.ts
  - src/ado/formatter.ts
  - src/ado/git.ts
  - src/ado/policy.ts
  - src/ado/threads.ts
  - src/ado/work-item.ts
  - src/config/env.ts
  - src/execute/router.ts
  - src/ingress/pr-router.ts
  - src/ingress/routes.ts
  - tests/ado-client.test.ts
  - tests/branch-policies.test.ts
  - tests/pr-lifecycle.test.ts
  - tests/pr-merge.test.ts
  - tests/pr-rework.test.ts
findings:
  critical: 0
  warning: 5
  info: 5
  total: 10
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-09-09T11:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed 15 files across `src/` and `tests/` implemented in Phase 5: MERGE — PR Lifecycle & Native CI Gate Verification. The implementation introduces the ADO Git and Policy API client foundations, structured PR description and sanitized HTML merge summary formatters, idempotent PR creation with work item `ArtifactLink` JSON patch relations, native Azure DevOps branch policy verification reader, two-key merge readiness gate evaluator, active PR review thread comment extractor with bot loop shielding, Fastify PR webhook ingress with HMAC verification and SQLite deduplication, and automated transition to `Ready for QA` upon PR merge.

Zero critical security vulnerabilities were detected. Five warnings require remediation:
1. `router.ts` computes branch slugs without using `slugify()`, omitting the 40-character truncation and causing source branch mismatch errors in Azure Repos when ticket titles exceed 40 characters.
2. `pr-router.ts` defaults all branch policy gate flags (`allApproved`, `l2ReviewersPassed`, `l3BuildPassed`, `l4SecurityPassed`) to `true` on API exceptions, failing open and posting false compliance evidence to work items.
3. `handlePullRequestEvent` does not distinguish bot-authored commit pushes from human reviewer votes, allowing the bot's own git push to trigger re-rework on existing negative votes and prematurely blow the shared circuit breaker.
4. `sanitizeComment` in `pr-router.ts` utilizes `sanitizeHtml` with `allowedTags: []`, stripping generic type parameters (e.g. `Map<string, number>` or `Promise<void>`) and JSX from review feedback.
5. `extractActiveReviewComments` fails to filter `CommentThreadStatus.WontFix` threads and `CommentType.System` comments, routing resolved discussions and non-actionable telemetry into rework prompts.

Five info items address hardcoded diff metrics in `router.ts`, hardcoded `'main'` default branch in `git.ts`, loose `Promise<any>` return type in `work-item.ts`, numeric magic numbers for PR status, and unfiltered empty review comments.

---

## Warnings

### WR-01: Branch Name Mismatch for Titles > 40 Chars in `router.ts` Breaks PR Creation

**File:** `src/execute/router.ts:131-135`
**Issue:** When creating a task branch during development, `src/sandbox/worktree.ts` uses `slugify(workItem.title)` from `src/utils/paths.ts`. `slugify` lowercases the string, replaces non-alphanumeric characters with hyphens, trims leading/trailing hyphens, and truncates the slug to 40 characters (`.slice(0, 40).replace(/-+$/, '')`). The created branch in Git is `task/ticket-${workItemId}-${slug}`.

However, in `src/execute/router.ts` upon `Dev Done` transition, the branch name is constructed without `slugify`:
```typescript
const slug = workItem.title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '');
const sourceBranch = `task/ticket-${workItemId}-${slug}`;
```
Because truncation to 40 characters is omitted, any ticket with a title slug longer than 40 characters generates a different branch name than the one created and pushed to the remote. When `createOrGetPullRequest` runs, Azure DevOps rejects the request with `TF401027: The source branch refs/heads/task/ticket-... does not exist in repository`.

**Fix:**
Import and use `slugify` from `../utils/paths.js`:
```typescript
import { slugify } from '../utils/paths.js';

// In routeWorkItemEvent (workItem.state === 'Dev Done'):
const slug = slugify(workItem.title);
const sourceBranch = `task/ticket-${workItemId}-${slug}`;
```

---

### WR-02: Fail-Open Defaulting of Branch Policy Gates on API Exceptions in `pr-router.ts`

**File:** `src/ingress/pr-router.ts:137-150`
**Issue:** In `handlePullRequestEvent` for `git.pullrequest.merged`, the branch policies are evaluated to generate the merge summary comment. If `verifyBranchPolicies(projectId, pullRequestId)` fails (e.g. Policy API rate limiting, network disconnect, 5xx server error, or authentication failure), the `catch` block defaults all policy flags to `true`:
```typescript
let policyStatus;
try {
  policyStatus = await verifyBranchPolicies(projectId, pullRequestId);
} catch {
  policyStatus = {
    allApproved: true,
    pendingCount: 0,
    failedCount: 0,
    l2ReviewersPassed: true,
    l3BuildPassed: true,
    l4SecurityPassed: true,
    summary: [],
  };
}
```
This is a fail-open security anti-pattern. If policy evaluation fails, `formatMergeSummaryComment` and `transitionToReadyForQa` post comments to the work item declaring that L2 code review, L3 build validation, and L4 security gates passed, producing false compliance evidence.

**Fix:**
Default all gate pass flags to `false` when policy verification encounters an exception, and provide diagnostic feedback in the summary:
```typescript
let policyStatus;
try {
  policyStatus = await verifyBranchPolicies(projectId, pullRequestId);
} catch (err: any) {
  console.error(`[pr-router] Policy verification failed for PR #${pullRequestId}:`, err);
  policyStatus = {
    allApproved: false,
    pendingCount: 0,
    failedCount: 0,
    l2ReviewersPassed: false,
    l3BuildPassed: false,
    l4SecurityPassed: false,
    summary: ['Policy verification API unavailable; gates unverified'],
  };
}
```

---

### WR-03: Bot Push Re-Triggers PR Review Rework and Exhausts Circuit Breaker

**File:** `src/ingress/pr-router.ts:74-86`
**Issue:** When handling `git.pullrequest.updated`, `handlePullRequestEvent` checks `resource.reviewers` for negative votes:
```typescript
const reviewers = resource.reviewers || [];
const hasNegativeVote = reviewers.some((r: any) => (r.vote ?? 0) < 0);

if (!hasNegativeVote) {
  return;
}

const breaker = await evaluateCircuitBreaker(workItemId, 'pr_review');
```
In Azure DevOps, `git.pullrequest.updated` fires for any mutation on the pull request, including new commits pushed to the source branch. When the agent finishes rework and pushes an automated commit to the branch, Azure DevOps sends a new `git.pullrequest.updated` webhook delivery. Because the human reviewer's vote in Azure DevOps remains `-10` until the reviewer manually updates their vote, `hasNegativeVote` remains `true`. 

Because neither `routes.ts` nor `pr-router.ts` checks whether the commit author or event actor matches `ADO_BOT_ID`, the bot's own push will immediately trigger another rework cycle. This increments `bounceCount` from 1 to 2, pushes another commit, and then triggers a 3rd bounce which trips the circuit breaker and escalates the ticket to `Blocked` with `[rework-escalated]` without human intervention. In addition, `handlePullRequestEvent` does not check if the work item is already in `Blocked` state before evaluating the circuit breaker.

**Fix:**
Ignore updates triggered by the bot's own commits and check if the ticket is already `Blocked`:
```typescript
const details = await getWorkItemDetails(workItemId);
if (details.state === 'Blocked') {
  return;
}

// Check if update was triggered by the bot's own commit push
const lastCommitAuthor =
  resource.lastMergeSourceCommit?.committer?.id ||
  resource.lastMergeSourceCommit?.author?.id;
if (lastCommitAuthor && lastCommitAuthor.toLowerCase() === env.ADO_BOT_ID.toLowerCase()) {
  return;
}
```

---

### WR-04: `sanitizeComment` Destroys Generic Types and Code Snippets in Review Feedback

**File:** `src/ingress/pr-router.ts:46-51`
**Issue:** `sanitizeComment` processes comment text using `sanitizeHtml` with an empty allowed tags array:
```typescript
function sanitizeComment(text: string): string {
  return sanitizeHtml(text, {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}
```
In code review feedback, reviewers routinely provide code syntax with angle brackets, such as `Map<string, number>`, `Promise<void>`, `Array<T>`, or `<MyComponent prop="val" />`. Because `allowedTags: []` is passed, `sanitize-html` parses any text inside angle brackets as unknown HTML elements and strips them completely (e.g. `Map<string, number>` is mutated into `Map`, deleting `<string, number>`).

Because `formatReworkPrompt` in `src/accept/envelope.ts` already protects XML prompt boundaries by escaping `<` and `>` into `&lt;` and `&gt;`, stripping angle-bracketed content with `sanitize-html` causes loss of technical review guidance.

**Fix:**
Strip only dangerous executable tags (`<script>`, `<iframe>`) and preserve angle-bracketed code identifiers, relying on `escapeXml` in `formatReworkPrompt` to prevent XML boundary escape:
```typescript
function sanitizeComment(text: string): string {
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .trim();
}
```

---

### WR-05: Missing `CommentThreadStatus.WontFix` and System Comment Filtering in `threads.ts`

**File:** `src/ado/threads.ts:29-35, 42-56`
**Issue:** `extractActiveReviewComments` filters resolved threads using:
```typescript
if (
  thread.isDeleted ||
  thread.status === CommentThreadStatus.Fixed ||
  thread.status === CommentThreadStatus.Closed ||
  thread.status === CommentThreadStatus.ByDesign
) {
  continue;
}
```
`CommentThreadStatus.WontFix` (enum value `3` in `azure-devops-node-api`) is omitted from the check. Threads resolved as "Won't Fix" by team agreement are treated as active review items and fed into the agent rework prompt.

Additionally, comments within threads can have `commentType: CommentType.System` (such as automated vote notices, policy status updates, or git push records), which are not filtered, allowing system telemetry to leak into reviewer feedback.

**Fix:**
Add `CommentThreadStatus.WontFix` to the resolved thread filter and skip comments with `commentType === CommentType.System`:
```typescript
import {
  CommentThreadStatus,
  CommentType,
  type GitPullRequestCommentThread,
} from 'azure-devops-node-api/interfaces/GitInterfaces.js';

// In extractActiveReviewComments:
if (
  thread.isDeleted ||
  thread.status === CommentThreadStatus.Fixed ||
  thread.status === CommentThreadStatus.Closed ||
  thread.status === CommentThreadStatus.ByDesign ||
  thread.status === CommentThreadStatus.WontFix
) {
  continue;
}

// Inside comment loop:
for (const comment of thread.comments || []) {
  if (comment.isDeleted || comment.commentType === CommentType.System) {
    continue;
  }
  ...
}
```

---

## Info

### IN-01: Hardcoded `diffStat` and Unordered `l3Evidence` Lookup in `src/execute/router.ts:98, 118-121`

**File:** `src/execute/router.ts:98, 118-121`
**Issue:** In `routeWorkItemEvent` for `Dev Done` tickets:
```typescript
const evidence = db
  .select()
  .from(l3Evidence)
  .where(eq(l3Evidence.workItemId, workItemId))
  .get();

const diffStat = {
  totalLoc: 50,
  filesChanged: 2,
};
```
1. `diffStat` is hardcoded to `{ totalLoc: 50, filesChanged: 2 }`, causing all PR descriptions to report identical dummy LOC statistics regardless of the actual code diff recorded in `l3Evidence.gitDiffStat`.
2. The `l3Evidence` query lacks an `orderBy(desc(l3Evidence.id))` clause. If a ticket underwent prior execution or rework turns, `.get()` returns the oldest initial record rather than the latest run evidence.
**Fix:**
Order by `desc(l3Evidence.id)` and parse LOC and files changed from `evidence.gitDiffStat` (or fall back to defaults if unparseable).

---

### IN-02: Target Branch Defaults to Hardcoded `'main'` Without Env Fallback in `src/ado/git.ts:25`

**File:** `src/ado/git.ts:25`, `src/config/env.ts`
**Issue:** In `createOrGetPullRequest`:
```typescript
const targetRefName = `refs/heads/${(params.targetBranch || 'main').replace(/^refs\/heads\//, '')}`;
```
`targetBranch` defaults to `'main'`. In repositories whose default trunk branch is `master` or a custom branch, calling `createOrGetPullRequest` without explicit `targetBranch` causes ADO to fail with target branch not found.
**Fix:**
Add `ADO_DEFAULT_BRANCH` to `src/config/env.ts` with default `'main'` and use `env.ADO_DEFAULT_BRANCH` as the default.

---

### IN-03: Loose `Promise<any>` Return Type in `src/ado/work-item.ts:241`

**File:** `src/ado/work-item.ts:241-247`
**Issue:** `transitionToReadyForQa` declares its return type as `Promise<any>`, whereas `adoClient.updateWorkItem` returns `Promise<WorkItem>`.
**Fix:**
```typescript
import type { WorkItem } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';

export async function transitionToReadyForQa(
  workItemId: number,
  htmlComment: string
): Promise<WorkItem> {
  const details = await getWorkItemDetails(workItemId);
  const patchDoc = buildMergeReadyForQaPatch(htmlComment, details.tags);
  return adoClient.updateWorkItem(workItemId, patchDoc);
}
```

---

### IN-04: Numeric Magic Number `status: 1` in `src/ado/git.ts:33`

**File:** `src/ado/git.ts:33`
**Issue:** `gitApi.getPullRequests` passes numeric literal `status: 1` instead of using the typed enum `PullRequestStatus.Active` from `azure-devops-node-api/interfaces/GitInterfaces.js`.
**Fix:**
Import `PullRequestStatus` and use `status: PullRequestStatus.Active`.

---

### IN-05: Unfiltered Empty or Whitespace-Only Comments in `src/ado/threads.ts:57-63`

**File:** `src/ado/threads.ts:52-63`
**Issue:** If a comment has empty content or only whitespace (such as empty system placeholders), `activeComments.push` still appends an `InlineReviewComment` with empty `content: ""`.
**Fix:**
Skip empty comments:
```typescript
const content = comment.content?.trim() || '';
if (!content || content.includes('<!-- [automated-agent] -->')) {
  continue;
}
```

---

_Reviewed: 2026-09-09T11:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
