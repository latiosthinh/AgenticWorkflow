# Phase 5: MERGE — PR Lifecycle & Native CI Gate Verification - Research

**Researched:** 2026-09-09  
**Domain:** Azure DevOps Git Pull Requests, Native Branch Policy Evaluations, Review Rework Loops & Merge Transitions  
**Confidence:** HIGH  

## Summary

Phase 5 implements the **MERGE** stage of the Golden Path SDLC. Its core responsibility is managing the pull request lifecycle in Azure Repos without hand-rolling custom CI pipelines. When an autonomous developer agent completes implementation and local testing (`Dev Done`), the system pushes the task branch (`task/ticket-{id}-{slug}`) to Azure Repos, opens a Pull Request targeting `main`, registers an `ArtifactLink` relationship on the work item, and embeds structured L1 and L3 evidence into the PR description.

The merge path is strictly protected by a two-key gate: (1) functional acceptance verdict must have passed at `Dev Done` (`[acceptance-approved]` tag present from ACCP-02), and (2) human code review must render an approved vote. Furthermore, native Azure DevOps branch policies evaluate code quality (L2), build verification (L3 re-run), and security/SAST scans (L4). The system queries the ADO Policy Evaluations API (`getPolicyEvaluations`) to verify all blocking policies are `Approved` before any merge occurs—it reads status only and never orchestrates CI tasks itself.

If human reviewers reject the PR or request changes (`waitingForAuthor` or `rejected`), the system extracts file-specific active review comments from the ADO Git PR Threads API (`getThreads`), formats a cumulative rework envelope, checks the shared max-2 circuit breaker (`rework_cycles` table), and resumes the rework agent. Rework commits are pushed directly to the existing task branch, updating the open PR in-place without opening duplicate PRs. Once approved and green, the PR is merged, transitioning the work item to `Ready for QA` and posting a structured `[Merge Summary]` comment.

**Primary recommendation:** Use `GitApi` and `PolicyApi` from `azure-devops-node-api` for all PR operations, query policy evaluations via artifact ID `vstfs:///CodeReview/CodeReviewId/${projectId}/${pullRequestId}`, enforce merge gates via tag and policy checks, and reuse existing task branches across review rework turns.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Pull Request Creation & Work Item Linking
- PR creation: created upon entering `Dev Done` via Azure DevOps Git API from `task/ticket-{id}-{slug}` targeting `main`.
- Work item linking: PR description includes `AB#<id>` in header and registers `ArtifactLink` relationship on the work item.
- Description contents: structured Markdown containing L1 criteria checklist, L3 local test execution summary, diff stat (<250 LOC), and bot loop shield tag.
- Rework updates: when rework commits are generated, git push updates existing task branch — ADO PR updates in-place automatically without opening a new PR.

#### Native CI Branch Policy Gates (L2/L3/L4)
- Policy evaluation reader: query Azure DevOps Policy Evaluations API (`getPolicyEvaluations`) for target pull request.
- Required policies: verify `Build` (L3 functional re-run), `Reviewers` (L2 code quality), and `Status` checks (L4 security / SAST) are `approved` / `succeeded`.
- Gate enforcement: system READS status only — does NOT re-implement CI orchestration. If policies are pending or broken, merge action is blocked and feedback posted.
- Helper integration: use `ado-connector` (or `azure-devops-node-api`) to query build run status and artifact metadata.

#### PR Review Verdict & Rework Loop (MRG-04)
- Rejection trigger: reviewer votes `waitingForAuthor` or `rejected`, or adds PR review comments and moves card back to `In Dev`.
- Comment extraction: query ADO Git PR Threads API (`getThreads`), filter for active non-bot comment threads on file diffs (file path, line number, review comment).
- Rework prompt envelope: inject original ticket AC + cumulative git diff (`origin/main...HEAD`) + file-specific inline review comments.
- Shared circuit breaker: PR review rejections increment the shared SQLite `rework_cycles` table (capped at combined 2 bounces across Accept and PR Review). On 3rd bounce, escalate to `Blocked` with tag `[rework-escalated]`.

#### PR Completion & Transition to "Ready for QA" (MRG-05)
- PR merge authority: human reviewer merges PR via ADO UI, or agent completes PR via API only after human vote is `approved` and all branch policies are green.
- Merge strategy: squash merge or rebase/fast-forward per project repository branch policy.
- State transition: upon PR merge webhook (`git.pullrequest.merged`), patch work item `System.State` from `Dev Done` to `Ready for QA`.
- Notification: post `[Merge Summary]` comment in work item discussion containing merge commit SHA, merged PR URL, and CI gate pass confirmation.

### the agent's Discretion
- Exact method signatures for ADO Git PR client helpers (`createPullRequest`, `getPolicyEvaluations`, `getThreads`).
- Formatting of the PR description and `[Merge Summary]` comment.

### Deferred Ideas (OUT OF SCOPE)
- Multi-repository cross-PR atomic merges (v2).
- Automatic cherry-picking to backport branches (v2).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MRG-01 | Agent pushes task branch and creates Azure Repos PR linked via `AB#<id>` with L1/L3 evidence summary in PR description. | `GitApi.createPullRequest` with `sourceRefName: refs/heads/task/...`, `AB#<id>` in title/body, and `ArtifactLink` JSON patch on work item. [CITED: learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests/create] |
| MRG-02 | Human reviewer conducts code review and renders PR merge verdict (◆); merge blocked until acceptance (ACCP-02) passed. | Merge evaluation gate: checks `[acceptance-approved]` tag on work item, verifies reviewer `vote >= 5`, blocks PR completion if either is missing. [CITED: learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-reviewers/update] |
| MRG-03 | System verifies native ADO branch policy gate status before merge: build validation green (L3 re-run), code quality scans (L2), security/SAST scans (L4). No custom CI orchestration — branch policies are the enforcement; system reads status only. | `PolicyApi.getPolicyEvaluations` using artifact URI `vstfs:///CodeReview/CodeReviewId/${projectId}/${pullRequestId}`. Verifies all blocking policies have `status === PolicyEvaluationStatus.Approved`. [CITED: learn.microsoft.com/en-us/rest/api/azure/devops/policy/evaluations/list] |
| MRG-04 | PR review rejection moves ticket back to "In Dev" and re-triggers rework agent with cumulative envelope (original AC + prior diff + review comments); shares ACCP-03 breaker. | `GitApi.getThreads` filters active file threads (`filePath`, `rightFileStart.line`). Calls `evaluateCircuitBreaker(id, 'pr_review')`. Bounces ≤ 2 re-run `processWorkItemRework` on existing branch; bounce 3 escalates to `Blocked`. [VERIFIED: codebase `src/accept/breaker.ts`] |
| MRG-05 | Successful merge transitions ticket to "Ready for QA" and posts merge summary to work item. | Ingress webhook handles `git.pullrequest.merged` or API completion. Transitions `System.State` to `Ready for QA`, posts `[Merge Summary]` HTML comment with merge commit SHA, PR link, and gate status. [CITED: learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests/update] |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| PR Creation & Work Item Linking | API / Backend (`src/ado/git.ts`) | Git Runner (`simple-git`) | Orchestrator creates PR via ADO REST API and patches Work Item `ArtifactLink` relation after task branch is pushed. |
| Native CI Branch Policy Reading | API / Backend (`src/ado/policy.ts`) | — | Pure read-only query to ADO Policy Evaluations API. Does not execute or orchestrate CI pipelines. |
| PR Review Verdict & Rejection Detection | API / Backend (`src/ingress/pr-router.ts`) | Ingress Webhook (`Fastify`) | Decodes PR service hooks (`git.pullrequest.updated`), detects reviewer negative votes or comments. |
| PR Thread Comment Extraction | API / Backend (`src/ado/threads.ts`) | — | Fetches active file-specific discussion threads via ADO Git API and parses file paths and line numbers. |
| Review Rework Loop Execution | Runner / Worker (`src/execute/rework-worker.ts`) | Database (`better-sqlite3`) | Reuses ephemeral worktree on existing task branch, runs self-repair loop, pushes incremental commits. |
| Merge Completion & QA Transition | API / Backend (`src/ado/merge.ts`) | Work Item Tracking (`src/ado/work-item.ts`) | Updates PR status to completed (if agent-managed) or detects UI merge via webhook; patches ticket state to `Ready for QA`. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `azure-devops-node-api` | `17.0.0` | ADO Git, Policy & Work Item SDK | Official Microsoft client library. Typed APIs for `GitApi`, `PolicyApi`, and `WorkItemTrackingApi`. [VERIFIED: npm registry] |
| `fastify` | `5.12.3` | Webhook ingress server | High throughput, sub-millisecond raw body caching for HMAC verification on `git.pullrequest.*` events. [VERIFIED: npm registry] |
| `better-sqlite3` | `13.0.3` | Local database & shared state | Synchronous zero-ops storage in WAL mode. Tracks `rework_cycles` and `pull_requests` state. [VERIFIED: npm registry] |
| `drizzle-orm` | `0.45.2` | Relational query builder | Type-safe queries for SQLite tables with zero runtime overhead. [VERIFIED: npm registry] |
| `simple-git` | `3.36.0` | Git client wrapper | Manages branch commits and pushes to Azure Repos remote; calculates cumulative diffs via `git merge-base`. [VERIFIED: npm registry] |
| `zod` | `4.5.4` | Payload schema validation | Validates incoming PR webhook payloads and policy evaluation structures. [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `p-queue` | `9.3.3` | Per-ticket lane concurrency | Serializes PR webhook processing for the same work item ID. [VERIFIED: npm registry] |
| `sanitize-html` | `2.17.7` | HTML comment sanitizer | Ensures PR merge summaries and work item comments are safe ADO-compliant HTML. [VERIFIED: npm registry] |
| `dotenv` | `17.4.0` | Environment configuration | Loads `ADO_ORG_URL`, `ADO_PAT`, `ADO_PROJECT`, `ADO_REPOSITORY_ID`. [VERIFIED: npm registry] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native ADO Branch Policies | Custom CI Orchestrator (GitHub Actions / Jenkins script) | Violates core architectural constraint. ADO branch policies provide enterprise-grade branch protection natively; the orchestrator must read status, not run CI. |
| `GitApi.getThreads` | Raw Webhook Payload Scraping | Webhook payloads for comments often omit line numbers or full thread context. Querying `getThreads` provides authoritative file positions and thread statuses. |
| In-place Task Branch Commits | Fresh Branch & PR per Rework | Opening a new PR on every review rejection fractures discussion history and invalidates existing reviewer links. Pushing to the same branch updates the open PR cleanly. |

## Architecture Patterns

### System Architecture Diagram

```
                              ADO Service Hooks / Webhook Ingress
                                             │
                        ┌────────────────────┴────────────────────┐
                        │                                         │
                        ▼                                         ▼
            [workitem.updated: Dev Done]              [git.pullrequest.*]
                        │                                         │
                        ▼                                         ▼
            MRG-01: Push Task Branch &                  PR Ingress Router
            Create Linked Azure Repos PR                          │
           (AB#<id> + ArtifactLink relation)                      ├──────────────────────────┐
                        │                                         │                          │
                        ▼                                         ▼                          ▼
            Acceptance Gate Check                      Reviewer Verdict?             git.pullrequest.merged
           ([acceptance-approved] tag)                            │                          │
                        │                                         │                          │
              ┌─────────┴─────────┐                  ┌────────────┴────────────┐             │
              ▼                   ▼                  ▼                         ▼             │
          [Missing]           [Approved]        [Rejection]               [Approved]         │
              │                   │                  │                         │             │
        Block Merge &             │                  ▼                         ▼             │
        Wait for ACCP-02          │           Extract Threads            Evaluate Native     │
                                  │          (getThreads API)            Branch Policies     │
                                  │                  │                  (L2, L3, L4 Gates)   │
                                  │                  ▼                         │             │
                                  │           Circuit Breaker?                 ▼             │
                                  │         (rework_cycles <= 2)          All Green?         │
                                  │                  │                         │             │
                                  │          ┌───────┴───────┐           ┌─────┴─────┐       │
                                  │          ▼               ▼           ▼           ▼       │
                                  │       [Count>2]      [Count<=2]   [Pending/   [Green]    │
                                  │          │               │         Broken]       │       │
                                  │          ▼               ▼           │           ▼       │
                                  │       Escalate        Trigger        Block   Merge PR    │
                                  │      to Blocked     MRG-04 Rework    Merge   (or await   │
                                  │     [rework-esc]    (In Dev + Env)     │      human)     │
                                  │                          │             │         │       │
                                  │                          └─────────────┼─────────┘       │
                                  │                                        │                 │
                                  └────────────────────────────────────────┼─────────────────┘
                                                                           │
                                                                           ▼
                                                                  MRG-05: Merge Handler
                                                              (System.State -> "Ready for QA"
                                                                + [Merge Summary] HTML comment)
```

### Recommended Project Structure
```
src/
├── ado/
│   ├── client.ts            # WebApi connection, getGitApi(), getPolicyApi()
│   ├── git.ts               # PR creation, PR lookup, PR completion
│   ├── policy.ts            # Policy evaluation reader, L2/L3/L4 status verification
│   ├── threads.ts           # Active review comment extraction, thread parser
│   ├── work-item.ts         # ArtifactLink patch builder, Ready for QA transition
│   └── formatter.ts         # PR description and [Merge Summary] HTML formatters
├── accept/
│   ├── breaker.ts           # Shared rework circuit breaker (accept + pr_review)
│   ├── envelope.ts          # Cumulative rework envelope formatting
│   └── packet.ts            # Acceptance packet assembly
├── ingress/
│   ├── routes.ts            # Extended Fastify route handling workitem.* and git.pullrequest.*
│   ├── pr-router.ts         # Pull request event handler and verdict dispatcher
│   └── bot-shield.ts        # Bot echo filter for PR events and comments
├── db/
│   ├── schema.ts            # pullRequests table, dedupEvents, reworkCycles
│   └── index.ts             # SQLite connection
└── execute/
    └── rework-worker.ts     # Bounded rework worker executing on task branch
```

### Pattern 1: Safe Git PR Creation & Artifact Linking (MRG-01)
**What:** When entering `Dev Done`, agent creates PR via `GitApi.createPullRequest` if not already open. Embeds `AB#<id>` in title and description, and adds an `ArtifactLink` relationship to the work item.  
**When to use:** In `worker.ts` or when work item enters `Dev Done`.  
**Example:**
```typescript
// Source: https://github.com/microsoft/azure-devops-node-api/blob/master/_autodocs/api-reference/GitApi.md
import { GitPullRequest } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { adoClient } from './client.js';

export async function createOrGetPullRequest(params: {
  workItemId: number;
  title: string;
  sourceBranch: string; // e.g. "task/ticket-101-slug"
  targetBranch?: string; // default "main"
  description: string;
  projectId: string;
  repositoryId: string;
}): Promise<GitPullRequest> {
  const gitApi = await adoClient.getGitApi();
  const sourceRefName = `refs/heads/${params.sourceBranch}`;
  const targetRefName = `refs/heads/${params.targetBranch || 'main'}`;

  // Check if active PR already exists for branch
  const existingPrs = await gitApi.getPullRequests(params.repositoryId, {
    sourceRefName,
    targetRefName,
    status: 1, // Active
  }, params.projectId);

  if (existingPrs && existingPrs.length > 0) {
    return existingPrs[0];
  }

  const prToCreate: GitPullRequest = {
    sourceRefName,
    targetRefName,
    title: `AB#${params.workItemId} - ${params.title}`,
    description: params.description,
  };

  const createdPr = await gitApi.createPullRequest(prToCreate, params.repositoryId, params.projectId);

  // Register ArtifactLink on Work Item
  if (createdPr.pullRequestId) {
    const artifactUrl = `vstfs:///Git/PullRequestId/${params.projectId}/${params.repositoryId}/${createdPr.pullRequestId}`;
    await adoClient.updateWorkItem(params.workItemId, [
      {
        op: Operation.Add,
        path: '/relations/-',
        value: {
          rel: 'ArtifactLink',
          url: artifactUrl,
          attributes: {
            name: 'Pull Request',
            comment: `Linked Pull Request #${createdPr.pullRequestId}`,
          },
        },
      },
    ]);
  }

  return createdPr;
}
```

### Pattern 2: Native Branch Policy Gate Evaluation (MRG-03)
**What:** Read policy evaluations via `PolicyApi.getPolicyEvaluations`. Map each blocking evaluation to L2 (code review), L3 (build validation), or L4 (security status checks). Block merge unless all applicable blocking policies are `Approved`.  
**When to use:** Prior to merging PR or when assessing PR readiness.  
**Example:**
```typescript
// Source: https://learn.microsoft.com/en-us/rest/api/azure/devops/policy/evaluations/list
import { PolicyEvaluationStatus, PolicyEvaluationRecord } from 'azure-devops-node-api/interfaces/PolicyInterfaces.js';
import { adoClient } from './client.js';

export interface PolicyGateStatus {
  allApproved: boolean;
  pendingCount: number;
  failedCount: number;
  l2ReviewersPassed: boolean;
  l3BuildPassed: boolean;
  l4SecurityPassed: boolean;
  summary: string[];
}

export async function verifyBranchPolicies(
  projectId: string,
  pullRequestId: number
): Promise<PolicyGateStatus> {
  const policyApi = await adoClient.getPolicyApi();
  const artifactId = `vstfs:///CodeReview/CodeReviewId/${projectId}/${pullRequestId}`;

  const evaluations: PolicyEvaluationRecord[] = await policyApi.getPolicyEvaluations(
    projectId,
    artifactId,
    true // includeNotApplicable: false or true
  );

  const blockingEvaluations = evaluations.filter(
    (e) => e.configuration?.isBlocking && e.status !== PolicyEvaluationStatus.NotApplicable
  );

  let pendingCount = 0;
  let failedCount = 0;
  let l2ReviewersPassed = true;
  let l3BuildPassed = true;
  let l4SecurityPassed = true;
  const summary: string[] = [];

  for (const evaluation of blockingEvaluations) {
    const typeName = evaluation.configuration?.type?.displayName || '';
    const status = evaluation.status;
    const isApproved = status === PolicyEvaluationStatus.Approved;

    if (status === PolicyEvaluationStatus.Queued || status === PolicyEvaluationStatus.Running) {
      pendingCount++;
    } else if (status === PolicyEvaluationStatus.Rejected || status === PolicyEvaluationStatus.Broken) {
      failedCount++;
    }

    if (typeName.toLowerCase().includes('reviewer') || typeName.toLowerCase().includes('quality')) {
      if (!isApproved) l2ReviewersPassed = false;
    } else if (typeName.toLowerCase().includes('build')) {
      if (!isApproved) l3BuildPassed = false;
    } else if (typeName.toLowerCase().includes('status') || typeName.toLowerCase().includes('security')) {
      if (!isApproved) l4SecurityPassed = false;
    }

    summary.push(`${typeName}: ${PolicyEvaluationStatus[status ?? 0]}`);
  }

  const allApproved = blockingEvaluations.length > 0 && pendingCount === 0 && failedCount === 0;

  return {
    allApproved,
    pendingCount,
    failedCount,
    l2ReviewersPassed,
    l3BuildPassed,
    l4SecurityPassed,
    summary,
  };
}
```

### Pattern 3: PR Review Thread Comment Extraction (MRG-04)
**What:** Retrieve review comments from `GitApi.getThreads`. Filter out closed/fixed threads, bot comments, and non-file comments to construct clean inline feedback.  
**When to use:** When human reviewer rejects PR or requests changes.  
**Example:**
```typescript
// Source: https://github.com/microsoft/azure-devops-node-api/blob/master/_autodocs/api-reference/GitApi.md
import { CommentThreadStatus } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import { adoClient } from './client.js';

export interface InlineReviewComment {
  filePath: string;
  lineNumber?: number;
  author: string;
  content: string;
}

export async function extractActiveReviewComments(
  repositoryId: string,
  pullRequestId: number,
  projectId: string,
  botId: string
): Promise<InlineReviewComment[]> {
  const gitApi = await adoClient.getGitApi();
  const threads = await gitApi.getThreads(repositoryId, pullRequestId, projectId);

  const activeComments: InlineReviewComment[] = [];

  for (const thread of threads) {
    if (thread.isDeleted || thread.status === CommentThreadStatus.Fixed || thread.status === CommentThreadStatus.Closed) {
      continue;
    }

    const filePath = thread.threadContext?.filePath;
    const lineNumber = thread.threadContext?.rightFileStart?.line ?? thread.threadContext?.leftFileStart?.line;

    for (const comment of thread.comments || []) {
      if (comment.isDeleted) continue;
      const authorId = comment.author?.id;
      const content = comment.content?.trim() || '';

      // Ignore bot identity or automated markers
      if (authorId?.toLowerCase() === botId.toLowerCase() || content.includes('<!-- [automated-agent] -->')) {
        continue;
      }

      activeComments.push({
        filePath: filePath || 'General Comment',
        lineNumber,
        author: comment.author?.displayName || 'Reviewer',
        content,
      });
    }
  }

  return activeComments;
}
```

### Pattern 4: PR Completion & Transition to "Ready for QA" (MRG-05)
**What:** Upon merge (via webhook or completion API), patch work item state from `Dev Done` to `Ready for QA`, update tags, and post structured `[Merge Summary]` HTML comment.  
**When to use:** In PR merge event handler.  
**Example:**
```typescript
import { Operation, JsonPatchDocument } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { buildTagPatch } from './work-item.js';

export function buildMergeReadyForQaPatch(
  htmlComment: string,
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(
    currentTags,
    '[pr-merged]',
    '[awaiting-acceptance]'
  );

  return [
    ...tagPatches,
    {
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Ready for QA',
    },
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: htmlComment,
    },
  ] as unknown as JsonPatchDocument;
}
```

### Anti-Patterns to Avoid
- **Re-running CI from Orchestrator Code:** Do not invoke `npm test` or security scanners inside orchestrator to simulate branch policies. The branch policies configured in Azure DevOps Repos are authoritative; the orchestrator merely reads evaluation status.
- **Creating New Branches or PRs on Rework:** Do not create `task/ticket-101-rework-1`. Rework must push commits to the existing branch `task/ticket-101-{slug}` so the PR updates in-place, preserving review thread discussions.
- **Merging without Acceptance Approval:** Do not complete a PR based solely on green CI or reviewer approval if the work item has not yet received functional acceptance approval (`[acceptance-approved]` tag).
- **Ignoring Bot Echoes in PR Comments:** Failing to filter bot comments when parsing review threads causes the agent to treat its own previous feedback as new reviewer instructions, causing infinite rework ping-pong.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Branch Policy Verification | Custom CI test harness & runner in orchestrator | `PolicyApi.getPolicyEvaluations` | Azure DevOps natively orchestrates build validation, quality gates, and SAST policies. Reading evaluation status guarantees parity with branch protection rules. |
| PR Comment Extraction | Raw HTML / comment text scraping | `GitApi.getThreads` | ADO thread API provides structured coordinates (`filePath`, `rightFileStart.line`, `status`). Custom parsing misses diff anchors and thread resolution statuses. |
| Pull Request Completion | Direct git merge & push to `main` via git CLI | `GitApi.updatePullRequest` with `PullRequestStatus.Completed` | Direct pushing to `main` bypasses branch policy enforcement and violates repository permissions. Completing via API triggers ADO server-side policy validation and merge strategies. |
| Review Rework Breaker | Separate PR rejection counter | `evaluateCircuitBreaker(id, 'pr_review')` in `rework_cycles` table | Reusing the SQLite `rework_cycles` table ensures a combined maximum of 2 automated bounces across both Accept and PR Review gates. |

**Key insight:** In Azure DevOps, Pull Requests and Branch Policies are server-managed primitives. Treating them as first-class REST API resources rather than raw git operations avoids permission errors and guarantees enterprise governance.

## Common Pitfalls

### Pitfall 1: Policy Evaluation ArtifactId URI Format Mismatch
**What goes wrong:** Calling `policyApi.getPolicyEvaluations(projectId, artifactId)` with the PR's `pr.artifactId` (`vstfs:///Git/PullRequestId/...`) returns an empty list or 404 error.  
**Why it happens:** In Azure DevOps, policy evaluations for pull requests are indexed under the CodeReview artifact URI scheme: `vstfs:///CodeReview/CodeReviewId/{projectId}/{pullRequestId}`.  
**How to avoid:** Always format the artifact ID as `vstfs:///CodeReview/CodeReviewId/${projectId}/${pullRequestId}` when querying `getPolicyEvaluations`. [CITED: learn.microsoft.com/en-us/rest/api/azure/devops/policy/evaluations/list]  
**Warning signs:** `getPolicyEvaluations` returns 0 records even though branch policies are active on the target branch.

### Pitfall 2: Premature PR Merge Before Acceptance Verdict
**What goes wrong:** A code reviewer approves the PR (vote = 10) and CI policies turn green, triggering auto-merge while the ticket is still awaiting functional acceptance (ACCP-02).  
**Why it happens:** The merge evaluator only checks PR status without checking work item board state and tags.  
**How to avoid:** Explicitly guard the merge path by checking that the work item has the `[acceptance-approved]` tag before completing the PR.  
**Warning signs:** PR merges into `main` before product owner or QA has validated the acceptance packet.

### Pitfall 3: Webhook Event Deduplication Missing on PR Events
**What goes wrong:** Azure DevOps fires multiple `git.pullrequest.updated` webhooks during a single review action (vote update + status check + build finish). Duplicate rework runs are triggered simultaneously.  
**Why it happens:** The deduplication store only keys on `(workItemId, revId)` for work items, leaving PR event deliveries unprotected.  
**How to avoid:** Key PR event deduplication using the notification `payload.id` or a composite key `(pullRequestId, eventType, commitSha/updatedDate)`. Process events in the dedicated work item lane queue.  
**Warning signs:** Parallel worktrees spinning up for the same PR.

### Pitfall 4: Rework Commits Pushed to Detached or New Branches
**What goes wrong:** Rework worker creates a new branch (`task/ticket-101-rework`), pushes commits, and the existing PR remains un-updated while CI policies remain stale.  
**Why it happens:** Worktree creator defaults to creating new branches rather than checking out the existing branch.  
**How to avoid:** Use `createWorktree(cwd, id, title, { checkoutExistingBranch: true })` which checks out and updates the existing branch `task/ticket-{id}-{slug}`.  
**Warning signs:** Reviewers complain that their requested changes are not visible on the open PR.

## Code Examples

### Format PR Description with Evidence Summary
```typescript
export interface PrDescriptionOptions {
  workItemId: number;
  title: string;
  acceptanceCriteria: string;
  testSummary: {
    suite: string;
    totalTests: number;
    passed: number;
    failed: number;
    durationMs: number;
  };
  diffStat: {
    totalLoc: number;
    filesChanged: number;
  };
}

export function formatPrDescription(options: PrDescriptionOptions): string {
  const { workItemId, title, acceptanceCriteria, testSummary, diffStat } = options;

  return `## AB#${workItemId} - ${title}

### L1 Requirements Verification
- [x] Scope bounded within \`<250 LOC\` ceiling (\`${diffStat.totalLoc}\` LOC across ${diffStat.filesChanged} files)
- [x] Test assertion files protected and unmodified
- [x] Acceptance criteria verified:
${acceptanceCriteria ? `> ${acceptanceCriteria.replace(/\n/g, '\n> ')}` : '> Standard Definition of Done'}

### L3 Functional Evidence (Local Pre-PR)
- **Suite**: \`${testSummary.suite}\`
- **Result**: **${testSummary.passed}/${testSummary.totalTests} passed** (${testSummary.failed} failed)
- **Duration**: \`${testSummary.durationMs}ms\`

<!-- [automated-agent] -->`;
}
```

### Format Merge Summary Discussion Comment
```typescript
export interface MergeSummaryCommentOptions {
  pullRequestId: number;
  prUrl: string;
  mergeCommitSha: string;
  targetBranch: string;
  policies: {
    l2Reviewers: boolean;
    l3Build: boolean;
    l4Security: boolean;
  };
}

export function formatMergeSummaryComment(options: MergeSummaryCommentOptions): string {
  const { pullRequestId, prUrl, mergeCommitSha, targetBranch, policies } = options;

  return `<h3>[Merge Summary] Pull Request Merged</h3>
<p>Pull Request <a href="${prUrl}">#${pullRequestId}</a> has been successfully merged into <code>${targetBranch}</code>.</p>
<ul>
  <li><strong>Merge Commit:</strong> <code>${mergeCommitSha.substring(0, 8)}</code></li>
  <li><strong>L2 Code Review Gate:</strong> ${policies.l2Reviewers ? 'Passed' : 'N/A'}</li>
  <li><strong>L3 Build Validation Gate:</strong> ${policies.l3Build ? 'Passed' : 'N/A'}</li>
  <li><strong>L4 Security & SAST Gate:</strong> ${policies.l4Security ? 'Passed' : 'N/A'}</li>
</ul>
<p>Work item transitioned to <strong>Ready for QA</strong>.</p>
<!-- [automated-agent] -->`;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom CI runner scripts inside bot | Native Azure DevOps Branch Policy Evaluations API | Post-Audit v2 | Eliminates duplicated CI orchestration. Bot reads server-evaluated policy status (`getPolicyEvaluations`). |
| Opening a new PR on review rejection | Pushing rework commits to existing task branch | Post-Audit v2 | Preserves reviewer comment history, avoids PR clutter, automatically triggers branch policy re-runs. |
| Separate bounce limits for Accept and PR Review | Shared SQLite `rework_cycles` table capped at 2 | Post-Audit v2 | Prevents infinite ping-pong across stages; 3 total rejections across Accept + Review escalates to Tech Lead. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Pull request policy evaluations use `vstfs:///CodeReview/CodeReviewId/{projectId}/{pullRequestId}` as artifact ID in ADO REST API. | Architecture Patterns / Pitfalls | [VERIFIED: learn.microsoft.com/en-us/rest/api/azure/devops/policy/evaluations/list] High risk if wrong, but verified in official Microsoft API docs. |
| A2 | Human approval vote in ADO PR reviewer list is represented by `vote >= 5` (`5`: approved with suggestions, `10`: approved). | Architecture Patterns / MRG-02 | [VERIFIED: azure-devops-node-api GitInterfaces.d.ts line 2874]. |

## Open Questions

1. **Auto-Complete vs Human UI Merge:**
   - What we know: In typical setups, developers click "Complete" in the ADO UI after reviewing, which fires `git.pullrequest.merged`. Alternatively, an automated agent can complete the PR via `updatePullRequest` if auto-complete or API completion is desired.
   - What's unclear: Does the team prefer humans to always click Merge in ADO UI, or can the agent complete the PR once reviewer vote is approved and all policies are green?
   - Recommendation: Support both! Webhook listener handles `git.pullrequest.merged` seamlessly for UI merges, while an API completion helper is available when automated merge is requested.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v24.0.2 | — |
| Git CLI | Task branch operations & diff calculation | ✓ | v2.53.0 | — |
| npm | Package management & tests | ✓ | v11.x | — |
| `azure-devops-node-api` | ADO Git & Policy APIs | ✓ | 17.0.0 | — |
| SQLite (WAL mode) | State & dedup persistence | ✓ | 13.0.3 (better-sqlite3) | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.0 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MRG-01 | Create PR with `AB#<id>`, evidence in body, register `ArtifactLink` | unit/integration | `npx vitest run tests/pr-lifecycle.test.ts` | ❌ Wave 0 |
| MRG-02 | Merge blocked until acceptance approved (`[acceptance-approved]`) and reviewer vote >= 5 | unit | `npx vitest run tests/branch-policies.test.ts` | ❌ Wave 0 |
| MRG-03 | Reads native branch policy status (L2, L3, L4); blocks merge if pending/failed; no custom CI | unit | `npx vitest run tests/branch-policies.test.ts` | ❌ Wave 0 |
| MRG-04 | PR review rejection extracts active thread comments, checks shared breaker (<=2), re-runs rework on existing branch | integration | `npx vitest run tests/pr-rework.test.ts` | ❌ Wave 0 |
| MRG-05 | Successful merge transitions ticket to `Ready for QA`, posts `[Merge Summary]` comment | integration | `npx vitest run tests/pr-merge.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/pr-lifecycle.test.ts` — covers MRG-01 (PR creation, description formatting, ArtifactLink)
- [ ] `tests/branch-policies.test.ts` — covers MRG-02 & MRG-03 (acceptance tag check, reviewer vote, L2/L3/L4 policy evaluation parsing)
- [ ] `tests/pr-rework.test.ts` — covers MRG-04 (thread comment extraction, breaker increment, existing branch update)
- [ ] `tests/pr-merge.test.ts` — covers MRG-05 (merge webhook, Ready for QA transition, merge summary comment)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Authenticate via `ADO_PAT` using Bearer handler in `AdoClient`. [VERIFIED] |
| V4 Access Control | yes | Verify human reviewer vote (`vote >= 5`) and `[acceptance-approved]` tag before completing PR; do not allow agent self-approval. [VERIFIED] |
| V5 Input Validation | yes | Validate incoming PR service hook payloads via Zod; sanitize branch names with `encodeURIComponent`; sanitize PR descriptions and merge summary comments via `sanitize-html`. [VERIFIED] |
| V6 Cryptography | yes | Validate `x-hub-signature-256` HMAC on all incoming PR webhook deliveries via `crypto.timingSafeEqual`. [VERIFIED] |

### Known Threat Patterns for ADO Git & PR Automation

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Webhook Forgery & Replay | Spoofing / Tampering | HMAC SHA-256 signature verification on raw request body + atomic SQLite deduplication lock. |
| Autonomous Unauthorized Merge | Elevation of Privilege | Merge path strictly gated on human review approval (`vote >= 5`) AND `[acceptance-approved]` tag. |
| PR Comment Prompt Injection | Tampering | Encapsulate review comment content within XML boundaries in rework prompt (`<pr_review_feedback>`) and strip HTML tags. |
| Infinite PR Webhook Echo Loop | Denial of Service | Filter events and comments matching `ADO_BOT_ID` or containing `<!-- [automated-agent] -->` shield. |

## Sources

### Primary (HIGH confidence)
- `azure-devops-node-api` Context7 library `/microsoft/azure-devops-node-api` - `GitApi.createPullRequest`, `GitApi.getThreads`, `GitApi.updatePullRequest`, `PolicyApi.getPolicyEvaluations`.
- [learn.microsoft.com/en-us/rest/api/azure/devops/policy/evaluations/list](https://learn.microsoft.com/en-us/rest/api/azure/devops/policy/evaluations/list) - Official specification for policy evaluations endpoint, URI format `vstfs:///CodeReview/CodeReviewId/{projectId}/{pullRequestId}`.
- [learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests) - Pull request lifecycle, reviewer vote enum values (-10, -5, 0, 5, 10).
- Local codebase inspection - `src/ado/client.ts`, `src/accept/breaker.ts`, `src/execute/rework-worker.ts`, `src/db/schema.ts`.

### Secondary (MEDIUM confidence)
- Microsoft Learn Azure DevOps Service Hooks event publisher catalog for `git.pullrequest.updated` and `git.pullrequest.merged`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - `azure-devops-node-api`, `fastify`, `better-sqlite3` verified and running in existing codebase.
- Architecture: HIGH - Mapped directly to locked decisions in `05-CONTEXT.md` and Golden Path specification.
- Pitfalls: HIGH - Addresses artifact URI format, bot loop echoes, and premature merge hazards.

**Research date:** 2026-09-09  
**Valid until:** 2026-10-09
