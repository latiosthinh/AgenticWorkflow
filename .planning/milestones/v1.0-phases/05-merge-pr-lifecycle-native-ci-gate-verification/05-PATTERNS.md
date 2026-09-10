# Phase 5: MERGE — PR Lifecycle & Native CI Gate Verification - Pattern Map

**Mapped:** 2026-09-09  
**Files analyzed:** 14 (8 source files, 2 modified infrastructure files, 4 test files)  
**Analogs found:** 14 / 14 (100% codebase pattern coverage)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/ado/client.ts` | client / utility | request-response | `src/ado/client.ts` | exact |
| `src/ado/git.ts` | service / client | request-response | `src/ado/work-item.ts` | role-match |
| `src/ado/policy.ts` | service / client | request-response | `src/ado/client.ts` & `src/auditor/evaluator.ts` | role-match |
| `src/ado/threads.ts` | service / client | request-response | `src/accept/verdict.ts` & `src/ado/client.ts` | role-match |
| `src/ado/formatter.ts` | utility | transform | `src/accept/packet.ts` & `src/ado/formatter.ts` | exact |
| `src/ado/work-item.ts` | service / client | request-response / transform | `src/ado/work-item.ts` | exact |
| `src/ingress/pr-router.ts` | controller / router | event-driven | `src/execute/router.ts` | role-match |
| `src/ingress/routes.ts` | controller / route | request-response / event-driven | `src/ingress/routes.ts` | exact |
| `src/execute/rework-worker.ts` | worker / runner | batch / transform | `src/execute/rework-worker.ts` | exact |
| `src/execute/router.ts` | controller / router | event-driven | `src/execute/router.ts` | exact |
| `tests/pr-lifecycle.test.ts` | test | request-response | `tests/acceptance-packet.test.ts` | role-match |
| `tests/branch-policies.test.ts` | test | request-response | `tests/verdict-detector.test.ts` | role-match |
| `tests/pr-rework.test.ts` | test | event-driven | `tests/rework-breaker.test.ts` | role-match |
| `tests/pr-merge.test.ts` | test | event-driven | `tests/ingress.test.ts` | role-match |

---

## Pattern Assignments

### `src/ado/client.ts` (client / utility, request-response)
Extend existing singleton Azure DevOps client with `GitApi` and `PolicyApi` accessors wrapped in exponential backoff retry.

**Analog:** `src/ado/client.ts`

**Imports pattern** (`src/ado/client.ts:1-5`):
```typescript
import * as azdev from 'azure-devops-node-api';
import type { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi.js';
import type { WorkItem } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import type { JsonPatchDocument } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { env } from '../config/env.js';
```

**Retry & Backoff pattern** (`src/ado/client.ts:7-30`):
```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const statusCode =
        err?.statusCode ??
        err?.status ??
        err?.response?.status ??
        err?.response?.statusCode;

      const isRateLimited = statusCode === 429;
      const isServerError =
        typeof statusCode === 'number' && statusCode >= 500 && statusCode < 600;
      const isNetworkError =
        Boolean(err?.code && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(err.code));

      if (attempt >= maxRetries || (!isRateLimited && !isServerError && !isNetworkError)) {
        throw err;
      }
```

**Api Getter pattern** (`src/ado/client.ts:60-77`):
```typescript
export class AdoClient {
  private connection: azdev.WebApi | null = null;
  private witApi: IWorkItemTrackingApi | null = null;

  getConnection(): azdev.WebApi {
    if (!this.connection) {
      const authHandler = azdev.getPersonalAccessTokenHandler(env.ADO_PAT);
      this.connection = new azdev.WebApi(env.ADO_ORG_URL, authHandler);
    }
    return this.connection;
  }

  async getWorkItemTrackingApi(): Promise<IWorkItemTrackingApi> {
    if (!this.witApi) {
      this.witApi = await this.getConnection().getWorkItemTrackingApi();
    }
    return this.witApi;
  }
```

---

### `src/ado/git.ts` (service / client, request-response)
Encapsulate Pull Request operations: lookup existing active PR, create new PR targeting `main`, link PR to Work Item via `ArtifactLink` relationship, complete PR via API.

**Analog:** `src/ado/work-item.ts` & `src/ado/client.ts`

**Imports pattern:**
```typescript
import type { IGitApi } from 'azure-devops-node-api/GitApi.js';
import type { GitPullRequest } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { adoClient, withRetry } from './client.js';
```

**Core PR Creation & Work Item Linking pattern** (`05-RESEARCH.md:191-244`):
```typescript
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
  const existingPrs = await withRetry(() =>
    gitApi.getPullRequests(params.repositoryId, {
      sourceRefName,
      targetRefName,
      status: 1, // Active
    }, params.projectId)
  );

  if (existingPrs && existingPrs.length > 0) {
    return existingPrs[0];
  }

  const prToCreate: GitPullRequest = {
    sourceRefName,
    targetRefName,
    title: `AB#${params.workItemId} - ${params.title}`,
    description: params.description,
  };

  const createdPr = await withRetry(() =>
    gitApi.createPullRequest(prToCreate, params.repositoryId, params.projectId)
  );

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

---

### `src/ado/policy.ts` (service / client, request-response)
Query ADO Policy Evaluations API (`getPolicyEvaluations`) using CodeReview artifact scheme `vstfs:///CodeReview/CodeReviewId/${projectId}/${pullRequestId}`. Verify L2 (reviewers), L3 (build validation), and L4 (security/status) checks.

**Analog:** `src/ado/client.ts` & `src/auditor/evaluator.ts`

**Imports pattern:**
```typescript
import {
  PolicyEvaluationStatus,
  type PolicyEvaluationRecord,
} from 'azure-devops-node-api/interfaces/PolicyInterfaces.js';
import { adoClient, withRetry } from './client.js';
```

**Core Policy Gate Evaluation pattern** (`05-RESEARCH.md:256-324`):
```typescript
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
  // Pitfall 1 mitigation: artifactId MUST use CodeReviewId format
  const artifactId = `vstfs:///CodeReview/CodeReviewId/${projectId}/${pullRequestId}`;

  const evaluations: PolicyEvaluationRecord[] = await withRetry(() =>
    policyApi.getPolicyEvaluations(projectId, artifactId, true)
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

---

### `src/ado/threads.ts` (service / client, request-response)
Query ADO Git PR Threads API (`getThreads`). Filter out deleted/fixed/closed threads, automated bot comments, and non-file comments to extract file paths, line numbers, and actionable reviewer comments.

**Analog:** `src/accept/verdict.ts` & `src/ado/client.ts`

**Imports pattern:**
```typescript
import { CommentThreadStatus } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import { adoClient, withRetry } from './client.js';
```

**Core Thread Extraction & Bot Filtering pattern** (`05-RESEARCH.md:335-381`):
```typescript
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
  const threads = await withRetry(() =>
    gitApi.getThreads(repositoryId, pullRequestId, projectId)
  );

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

---

### `src/ado/formatter.ts` (utility, transform)
Format PR description with L1/L3 checklist, diff statistics, and bot shield tag. Format `[Merge Summary]` HTML discussion comment for transitioned tickets.

**Analog:** `src/accept/packet.ts` & `src/ado/formatter.ts`

**Markdown & HTML Sanitization pattern** (`src/accept/packet.ts:57-74`):
```typescript
  const rawHtml = marked.parse(md) as string;
  const sanitized = sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img',
      'h1',
      'h2',
      'h3',
      'details',
      'summary',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
    },
  });

  return `${sanitized.trim()}\n<!-- [automated-agent] -->`;
```

**PR Description Formatter pattern** (`05-RESEARCH.md:465-500`):
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

**Merge Summary Comment Formatter pattern** (`05-RESEARCH.md:503-530`):
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

  const md = `### [Merge Summary] Pull Request Merged

Pull Request [#${pullRequestId}](${prUrl}) has been successfully merged into \`${targetBranch}\`.

- **Merge Commit:** \`${mergeCommitSha.substring(0, 8)}\`
- **L2 Code Review Gate:** ${policies.l2Reviewers ? 'Passed' : 'N/A'}
- **L3 Build Validation Gate:** ${policies.l3Build ? 'Passed' : 'N/A'}
- **L4 Security & SAST Gate:** ${policies.l4Security ? 'Passed' : 'N/A'}

Work item transitioned to **Ready for QA**.
`;

  const rawHtml = marked.parse(md) as string;
  const sanitized = sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h3', 'ul', 'li', 'strong', 'code', 'a']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'target', 'rel'],
    },
  });

  return `${sanitized.trim()}\n<!-- [automated-agent] -->`;
}
```

---

### `src/ado/work-item.ts` (service / client, request-response / transform)
Add `buildMergeReadyForQaPatch` and `transitionToReadyForQa` updating work item `System.State` to `Ready for QA`, setting `[pr-merged]` tag, and posting merge summary history.

**Analog:** `src/ado/work-item.ts`

**Tag Patch & Transition pattern** (`src/ado/work-item.ts:26-54`, `src/ado/work-item.ts:200-207`):
```typescript
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

export async function transitionToReadyForQa(
  workItemId: number,
  htmlComment: string
): Promise<any> {
  const details = await getWorkItemDetails(workItemId);
  const patchDoc = buildMergeReadyForQaPatch(htmlComment, details.tags);
  return adoClient.updateWorkItem(workItemId, patchDoc);
}
```

---

### `src/ingress/pr-router.ts` (controller / router, event-driven)
Dispatch PR service hook events (`git.pullrequest.updated`, `git.pullrequest.merged`). Evaluate reviewer votes, branch policy status, acceptance tags, and trigger rework or QA transition.

**Analog:** `src/execute/router.ts`

**Imports pattern:**
```typescript
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { dedupEvents } from '../db/schema.js';
import {
  getWorkItemDetails,
  transitionToReadyForQa,
  escalateReworkToBlocked,
} from '../ado/work-item.js';
import { evaluateCircuitBreaker } from '../accept/breaker.js';
import { verifyBranchPolicies } from '../ado/policy.js';
import { extractActiveReviewComments } from '../ado/threads.js';
import { processWorkItemRework } from '../execute/rework-worker.js';
import { formatMergeSummaryComment } from '../ado/formatter.js';
import { env } from '../config/env.js';
```

**Verdict Dispatch pattern** (`src/execute/router.ts:69-84`):
```typescript
// On PR review rejection (vote < 0 or waitingForAuthor):
const breaker = await evaluateCircuitBreaker(workItemId, 'pr_review');
if (!breaker.allowed) {
  await escalateReworkToBlocked(workItemId, breaker.currentCount);
} else {
  const comments = await extractActiveReviewComments(repositoryId, pullRequestId, projectId, env.ADO_BOT_ID);
  const feedbackText = comments.map((c) => `[${c.filePath}:${c.lineNumber ?? 0}] ${c.content}`).join('\n');
  await processWorkItemRework(workItemId, revId, feedbackText, options);
}
```

---

### `src/ingress/routes.ts` (controller / route, request-response / event-driven)
Extend webhook routes to accept `git.pullrequest.created`, `git.pullrequest.updated`, and `git.pullrequest.merged`. Verify HMAC signature, filter bot echoes, deduplicate events in SQLite, and dispatch to per-ticket queue lane.

**Analog:** `src/ingress/routes.ts`

**Core Ingress pattern** (`src/ingress/routes.ts:20-50`, `src/ingress/routes.ts:74-104`):
```typescript
    const rawBody = (request as any).rawBody as Buffer | string | undefined;
    const headerSig = request.headers['x-hub-signature-256'];
    const signature = Array.isArray(headerSig) ? headerSig[0] : headerSig;

    if (!verifyHmac(rawBody, signature, env.ADO_WEBHOOK_SECRET)) {
      return reply.code(401).send({ error: 'Invalid HMAC signature' });
    }

    const payload = request.body as any;
    const eventType = payload?.eventType;
    const resource = payload?.resource;

    // Support workitem and PR service hooks
    const isWorkItemEvent = eventType === 'workitem.created' || eventType === 'workitem.updated';
    const isPrEvent = eventType === 'git.pullrequest.created' || eventType === 'git.pullrequest.updated' || eventType === 'git.pullrequest.merged';

    if (!isWorkItemEvent && !isPrEvent) {
      return reply.code(200).send({ status: 'ignored_event_type' });
    }
```

---

### `src/execute/rework-worker.ts` (worker / runner, batch / transform)
Executes rework turns by attaching worktree to existing task branch (`{ checkoutExistingBranch: true }`), calculating cumulative diff against base commit, executing self-repair loop, and pushing commits in-place without opening new PRs.

**Analog:** `src/execute/rework-worker.ts`

**Existing Branch & Cumulative Diff pattern** (`src/execute/rework-worker.ts:67-75`, `src/execute/rework-worker.ts:107-114`):
```typescript
    // 1. Attach worktree to existing task branch
    const worktreeResult = await createWorktree(
      process.cwd(),
      workItemId,
      workItem.title,
      { checkoutExistingBranch: true }
    );
    worktreePath = worktreeResult.worktreePath;

    const git = simpleGit(worktreeResult.worktreePath);
    const lockedFiles =
      worktreeResult.testFilesProtected ??
      protectTestFiles(worktreeResult.worktreePath);

    // 2. Fetch cumulative diff against base commit
    const baseCommit = (await git.raw(['merge-base', 'HEAD', baseRef])).trim();
    const priorDiffStat = await calculateCumulativeDiff(git, baseCommit);
```

---

### `src/execute/router.ts` (controller / router, event-driven)
When work item enters `Dev Done`, create Azure Repos PR linked via `AB#<id>` and register `ArtifactLink` relationship if PR is not already open.

**Analog:** `src/execute/router.ts`

**Core Router pattern** (`src/execute/router.ts:85-92`):
```typescript
    if (workItem.state === 'Dev Done') {
      // Trigger PR creation and work item linking (MRG-01)
      await createOrGetPullRequest({
        workItemId,
        title: workItem.title,
        sourceBranch: `task/ticket-${workItemId}-${slugify(workItem.title)}`,
        description: prDescription,
        projectId: env.ADO_PROJECT,
        repositoryId: env.ADO_REPOSITORY_ID,
      });
    }
```

---

### `tests/pr-lifecycle.test.ts` (test, request-response)
Unit and integration tests for MRG-01: verify PR title format (`AB#<id>`), description checklist, test evidence inclusion, diff ceiling stats, and `ArtifactLink` JSON patch construction.

**Analog:** `tests/acceptance-packet.test.ts` & `tests/ado-client.test.ts`

**Imports & Test Structure pattern** (`tests/acceptance-packet.test.ts:1-12`):
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { formatPrDescription } from '../src/ado/formatter.js';
import { createOrGetPullRequest } from '../src/ado/git.js';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

describe('PR Lifecycle & Work Item Linking (MRG-01)', () => {
  it('formats PR description with L1 checklist, L3 test evidence, and bot loop shield', () => {
    const desc = formatPrDescription({
      workItemId: 101,
      title: 'Support Auth Headers',
      acceptanceCriteria: 'Return 401 when invalid token provided',
      testSummary: {
        suite: 'vitest',
        totalTests: 8,
        passed: 8,
        failed: 0,
        durationMs: 120,
      },
      diffStat: {
        totalLoc: 45,
        filesChanged: 2,
      },
    });

    expect(desc).toContain('## AB#101 - Support Auth Headers');
    expect(desc).toContain('Scope bounded within `<250 LOC` ceiling (`45` LOC across 2 files)');
    expect(desc).toContain('Return 401 when invalid token provided');
    expect(desc).toContain('8/8 passed');
    expect(desc).toContain('<!-- [automated-agent] -->');
  });
});
```

---

### `tests/branch-policies.test.ts` (test, request-response)
Tests for MRG-02 & MRG-03: verify gate blocking on pending or broken branch policies (L2/L3/L4), approval verification, and two-key gate enforcement (`[acceptance-approved]` tag + human vote >= 5).

**Analog:** `tests/verdict-detector.test.ts` & `tests/rework-breaker.test.ts`

**Policy Mocking & Gate Evaluation pattern:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { PolicyEvaluationStatus } from 'azure-devops-node-api/interfaces/PolicyInterfaces.js';
import { verifyBranchPolicies } from '../src/ado/policy.js';
import { adoClient } from '../src/ado/client.js';

describe('Native CI Branch Policy Gates (MRG-02 & MRG-03)', () => {
  it('blocks merge when build validation (L3) policy is queued or running', async () => {
    vi.spyOn(adoClient, 'getPolicyApi').mockResolvedValue({
      getPolicyEvaluations: vi.fn().mockResolvedValue([
        {
          configuration: { isBlocking: true, type: { displayName: 'Build' } },
          status: PolicyEvaluationStatus.Running,
        },
        {
          configuration: { isBlocking: true, type: { displayName: 'Reviewers' } },
          status: PolicyEvaluationStatus.Approved,
        },
      ]),
    } as any);

    const gate = await verifyBranchPolicies('proj-1', 42);
    expect(gate.allApproved).toBe(false);
    expect(gate.pendingCount).toBe(1);
    expect(gate.l3BuildPassed).toBe(false);
    expect(gate.l2ReviewersPassed).toBe(true);
  });
});
```

---

### `tests/pr-rework.test.ts` (test, event-driven)
Tests for MRG-04: PR review rejection parsing, active thread comment extraction, shared circuit breaker check (≤ 2 bounces across Accept and PR Review), and branch preservation.

**Analog:** `tests/rework-breaker.test.ts` & `tests/rework-integration.test.ts`

**Breaker & Rework pattern** (`tests/rework-breaker.test.ts:40-70`):
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateCircuitBreaker, resetCircuitBreaker } from '../src/accept/breaker.js';
import { sqlite } from '../src/db/index.js';

describe('PR Review Rejection & Shared Breaker (MRG-04)', () => {
  beforeEach(() => {
    sqlite.exec('DELETE FROM rework_cycles;');
  });

  it('shares circuit breaker between accept and pr_review gates up to 2 bounces', async () => {
    const workItemId = 2001;
    const bounce1 = await evaluateCircuitBreaker(workItemId, 'accept');
    expect(bounce1).toEqual({ allowed: true, currentCount: 1 });

    const bounce2 = await evaluateCircuitBreaker(workItemId, 'pr_review');
    expect(bounce2).toEqual({ allowed: true, currentCount: 2 });

    const bounce3 = await evaluateCircuitBreaker(workItemId, 'pr_review');
    expect(bounce3).toEqual({ allowed: false, currentCount: 3 });
  });
});
```

---

### `tests/pr-merge.test.ts` (test, event-driven)
Tests for MRG-05: verify handling of `git.pullrequest.merged` webhook, work item transition to `Ready for QA`, `[pr-merged]` tag addition, and `[Merge Summary]` comment generation.

**Analog:** `tests/ingress.test.ts`

**Webhook Test & Patch Verification pattern** (`tests/ingress.test.ts:42-57`):
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildMergeReadyForQaPatch } from '../src/ado/work-item.js';
import { formatMergeSummaryComment } from '../src/ado/formatter.js';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

describe('PR Merge Handler & Ready for QA Transition (MRG-05)', () => {
  it('creates valid JSON patch moving System.State to Ready for QA with [pr-merged] tag', () => {
    const summaryComment = formatMergeSummaryComment({
      pullRequestId: 88,
      prUrl: 'https://dev.azure.com/org/proj/_git/repo/pullrequest/88',
      mergeCommitSha: 'a1b2c3d4e5f6',
      targetBranch: 'main',
      policies: { l2Reviewers: true, l3Build: true, l4Security: true },
    });

    const patch = buildMergeReadyForQaPatch(summaryComment, 'backend; [awaiting-acceptance]');

    const stateOp = patch.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp).toEqual({ op: Operation.Replace, path: '/fields/System.State', value: 'Ready for QA' });

    const tagOp = patch.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp?.value).toContain('[pr-merged]');
    expect(tagOp?.value).not.toContain('[awaiting-acceptance]');

    const historyOp = patch.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp?.value).toContain('[Merge Summary] Pull Request Merged');
    expect(historyOp?.value).toContain('a1b2c3d4');
  });
});
```

---

## Shared Patterns

### 1. Authentication & ADO Connection
**Source:** `src/ado/client.ts:64-70`  
**Apply to:** All ADO API services (`src/ado/git.ts`, `src/ado/policy.ts`, `src/ado/threads.ts`)
```typescript
const authHandler = azdev.getPersonalAccessTokenHandler(env.ADO_PAT);
this.connection = new azdev.WebApi(env.ADO_ORG_URL, authHandler);
```

### 2. Exponential Backoff with Rate-Limit Awareness
**Source:** `src/ado/client.ts:7-58`  
**Apply to:** All ADO REST API interactions (`gitApi`, `policyApi`, `witApi`)
```typescript
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelayMs = 1000): Promise<T> { ... }
```

### 3. Shared Circuit Breaker (Max 2 Automated Bounces)
**Source:** `src/accept/breaker.ts:10-74`  
**Apply to:** `src/ingress/pr-router.ts` and `src/execute/router.ts`
```typescript
const breaker = await evaluateCircuitBreaker(workItemId, 'pr_review');
if (!breaker.allowed) {
  await escalateReworkToBlocked(workItemId, breaker.currentCount);
}
```

### 4. Ingress Webhook HMAC & Deduplication
**Source:** `src/ingress/routes.ts:23-29`, `src/ingress/routes.ts:74-89`  
**Apply to:** `src/ingress/routes.ts` (extended for `git.pullrequest.*` events)
```typescript
if (!verifyHmac(rawBody, signature, env.ADO_WEBHOOK_SECRET)) {
  return reply.code(401).send({ error: 'Invalid HMAC signature' });
}
```

### 5. Bot Shield Tag & Loop Prevention
**Source:** `src/ingress/bot-shield.ts:7-17`, `src/accept/packet.ts:74`  
**Apply to:** All PR thread parsing and history comment generation
```typescript
// All bot-authored comments end with marker
return `${sanitized.trim()}\n<!-- [automated-agent] -->`;

// Shield filters echo deliveries
if (authorId?.toLowerCase() === botId.toLowerCase() || content.includes('<!-- [automated-agent] -->')) {
  continue;
}
```

### 6. HTML Comment Sanitization
**Source:** `src/accept/packet.ts:58-72`, `src/ado/formatter.ts:35-42`  
**Apply to:** `src/ado/formatter.ts` (`formatPrDescription`, `formatMergeSummaryComment`)
```typescript
const sanitized = sanitizeHtml(rawHtml, {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h3', 'ul', 'li', 'strong', 'code', 'a']),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ['href', 'target', 'rel'],
  },
});
```

---

## No Analog Found

None. All Phase 5 components map directly to battle-tested patterns within `src/ado/`, `src/accept/`, `src/execute/`, and `src/ingress/`.

---

## Metadata

**Analog search scope:** `D:/Projects/AgenticWorkflow/src/`, `D:/Projects/AgenticWorkflow/tests/`  
**Files scanned:** 45  
**Pattern extraction date:** 2026-09-09
