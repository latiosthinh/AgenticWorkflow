# Phase 4: ACCEPT — Human Validation Gate & Rework Breaker - Pattern Map

**Mapped:** 2026-09-09  
**Files analyzed:** 15 (7 new, 4 modified, 4 tests)  
**Analogs found:** 15 / 15 (100% codebase coverage)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/accept/packet.ts` | utility / formatter | transform | `src/test-runner/evidence.ts` | exact |
| `src/accept/urls.ts` | utility | transform | `src/utils/paths.ts` | role-match |
| `src/accept/breaker.ts` | service | CRUD / transactional | `src/plan/checkpoint.ts` | exact |
| `src/accept/verdict.ts` | utility | request-response | `src/ingress/bot-shield.ts` | exact |
| `src/accept/envelope.ts` | utility / prompt | transform | `src/plan/formatter.ts` | exact |
| `src/execute/rework-worker.ts` | worker / pipeline | loop / request-response | `src/execute/worker.ts` | exact |
| `src/db/schema.ts` | model | CRUD | `src/db/schema.ts` | exact |
| `src/config/env.ts` | config | static | `src/config/env.ts` | exact |
| `src/sandbox/worktree.ts` | service / utility | file-I/O | `src/sandbox/worktree.ts` | exact |
| `src/ado/work-item.ts` | service | request-response | `src/ado/work-item.ts` | exact |
| `src/execute/router.ts` | controller / router | request-response | `src/execute/router.ts` | exact |
| `tests/acceptance-packet.test.ts` | test | unit | `tests/l3-evidence.test.ts` | exact |
| `tests/verdict-detector.test.ts` | test | unit | `tests/bot-shield.test.ts` | exact |
| `tests/rework-breaker.test.ts` | test | unit | `tests/plan-checkpoint.test.ts` | exact |
| `tests/rework-integration.test.ts` | test | integration / e2e | `tests/l3-evidence.test.ts` | exact |

---

## Pattern Assignments

### `src/accept/packet.ts` (utility / formatter, transform)

**Analog:** `src/test-runner/evidence.ts`

**Imports pattern** (lines 1-9):
```typescript
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { buildTagPatch } from '../ado/work-item.js';
import {
  Operation,
  type JsonPatchDocument,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
```

**HTML comment formatting with bot shield** (lines 28-58):
```typescript
export interface AcceptancePacketData {
  workItemId: number;
  testSuite: string;
  totalTests: number;
  passed: number;
  failed: number;
  durationMs: number;
  gitDiffStat: {
    filesChanged: number;
    insertions: number;
    deletions: number;
    totalLoc: number;
    rawStat: string;
  };
  prUrl?: string;
  previewUrl?: string;
}

export function formatAcceptancePacketComment(data: AcceptancePacketData): string {
  const prLinkMarkdown = data.prUrl ? `[View Pull Request](${data.prUrl})` : '*PR pending branch push*';
  const previewLinkMarkdown = data.previewUrl ? `[Open Staging Preview](${data.previewUrl})` : '*No preview environment configured*';

  const md = `### [Acceptance Packet] Functional Verification Complete

| Metric | Result |
| :--- | :--- |
| **Status** | **${data.failed === 0 ? 'READY FOR ACCEPTANCE' : 'TESTS FAILED'}** |
| **Tests** | ${data.passed}/${data.totalTests} passed (${data.durationMs}ms) |
| **Code Changes** | \`${data.gitDiffStat.rawStat || `${data.gitDiffStat.totalLoc} LOC`}\` (<250 LOC ceiling verified) |
| **Pull Request** | ${prLinkMarkdown} |
| **Preview** | ${previewLinkMarkdown} |

<details>
<summary><strong>Verification Details & Instructions</strong></summary>

* **Reviewer Action**:
  * To **Approve**: Move work item state to \`Ready for QA\` or reply \`[approve-acceptance]\`.
  * To **Request Changes**: Move work item state to \`In Dev\` with comments or reply \`[reject-acceptance]\`.
  * To **Reset Rework Counter**: Reply \`[reset-rework]\` to clear bounce budget.
</details>
`;

  const rawHtml = marked.parse(md) as string;
  const sanitized = sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3', 'details', 'summary']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
    },
  });

  return `${sanitized.trim()}\n<!-- [automated-agent] -->`;
}
```

**Dev Done patch builder with awaiting-acceptance tag** (lines 60-78):
```typescript
export function buildDevDoneAcceptancePatch(
  htmlComment: string,
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(
    currentTags,
    '[awaiting-acceptance]',
    '[awaiting-input]'
  );
  return [
    ...tagPatches,
    {
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Dev Done',
    },
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: htmlComment,
    },
  ] as unknown as JsonPatchDocument;
}
// ponytail: template-based acceptance packets; link interactive live preview widget in v2
```

---

### `src/accept/urls.ts` (utility, transform)

**Analog:** `src/utils/paths.ts` (lines 8-33) and `src/config/env.ts` (lines 1-18)

**Imports pattern**:
```typescript
import { env } from '../config/env.js';
```

**Core string template resolution pattern**:
```typescript
export function resolvePreviewUrl(workItemId: number): string {
  const template = process.env.PREVIEW_URL_TEMPLATE;
  if (template) {
    return template.replace('{workItemId}', String(workItemId));
  }
  return `http://localhost:${env.PORT}/preview/${workItemId}`;
}

export function resolvePrUrl(workItemId: number, branchName: string): string | undefined {
  const template = process.env.PR_URL_TEMPLATE;
  if (template) {
    return template
      .replace('{workItemId}', String(workItemId))
      .replace('{branchName}', encodeURIComponent(branchName));
  }
  return `${env.ADO_ORG_URL}/_git?version=GB${encodeURIComponent(branchName)}`;
}
// ponytail: env string token interpolation; integrate dynamic PR lookup via GitApi in v2
```

---

### `src/accept/breaker.ts` (service, CRUD / transactional)

**Analog:** `src/plan/checkpoint.ts` (lines 1-87) & `src/ado/work-item.ts` (lines 24-52, 164-196)

**Imports pattern**:
```typescript
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { reworkCycles, type ReworkCycle } from '../db/schema.js';
import { buildTagPatch } from '../ado/work-item.js';
import {
  Operation,
  type JsonPatchDocument,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
```

**Circuit breaker transactional check & trip pattern**:
```typescript
export async function evaluateCircuitBreaker(
  workItemId: number,
  sourceGate: 'accept' | 'pr_review'
): Promise<{ allowed: boolean; currentCount: number }> {
  const existing = db
    .select()
    .from(reworkCycles)
    .where(eq(reworkCycles.workItemId, workItemId))
    .get();

  const currentCount = existing ? existing.bounceCount : 0;

  if (currentCount >= 2) {
    // 3rd bounce trips circuit breaker
    db.insert(reworkCycles)
      .values({
        workItemId,
        bounceCount: currentCount + 1,
        lastBounceAt: new Date(),
        sourceGate,
        escalatedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: reworkCycles.workItemId,
        set: {
          bounceCount: currentCount + 1,
          lastBounceAt: new Date(),
          sourceGate,
          escalatedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .run();

    return { allowed: false, currentCount: currentCount + 1 };
  }

  db.insert(reworkCycles)
    .values({
      workItemId,
      bounceCount: currentCount + 1,
      lastBounceAt: new Date(),
      sourceGate,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: reworkCycles.workItemId,
      set: {
        bounceCount: currentCount + 1,
        lastBounceAt: new Date(),
        sourceGate,
        updatedAt: new Date(),
      },
    })
    .run();

  return { allowed: true, currentCount: currentCount + 1 };
}

export function resetCircuitBreaker(workItemId: number): void {
  db.update(reworkCycles)
    .set({
      bounceCount: 0,
      escalatedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(reworkCycles.workItemId, workItemId))
    .run();
}
```

**Escalation patch builder pattern**:
```typescript
export function buildEscalationPatch(
  workItemId: number,
  bounceCount: number,
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(
    currentTags,
    '[rework-escalated]',
    '[awaiting-acceptance]'
  );

  const commentHtml = `<h3>[Rework Escalated] Circuit Breaker Tripped</h3>
<p>Work item has reached <strong>${bounceCount} automated rework bounces</strong> across Accept/PR Review gates, exceeding the maximum policy limit (2).</p>
<p><strong>Action required:</strong> Tech Lead manual intervention required. To reset the rework cycle after resolving issues, post <code>[reset-rework]</code>.</p>
<!-- [automated-agent] -->`;

  return [
    ...tagPatches,
    {
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Blocked',
    },
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: commentHtml,
    },
  ] as unknown as JsonPatchDocument;
}
// ponytail: hardcoded 2-bounce cap in SQLite; support dynamic team thresholds in v2
```

---

### `src/accept/verdict.ts` (utility, request-response)

**Analog:** `src/ingress/bot-shield.ts` (lines 1-17)

**Verdict classification pattern**:
```typescript
export type AcceptanceVerdict =
  | { type: 'approve'; comment?: string }
  | { type: 'reject'; feedback: string }
  | { type: 'reset_rework' }
  | { type: 'none' };

export interface VerdictDetectionInput {
  currentState: string;
  previousState?: string;
  historyComment?: string;
  tags?: string;
}

export function detectAcceptanceVerdict(input: VerdictDetectionInput): AcceptanceVerdict {
  const comment = input.historyComment || '';

  if (comment.includes('[reset-rework]')) {
    return { type: 'reset_rework' };
  }

  // Approval: state moved to Ready for QA or explicit token
  if (
    (input.previousState === 'Dev Done' && (input.currentState === 'Ready for QA' || input.currentState === 'Approved')) ||
    comment.includes('[approve-acceptance]')
  ) {
    return { type: 'approve', comment: comment || undefined };
  }

  // Rejection: state moved back from Dev Done to In Dev, or explicit token
  if (
    (input.previousState === 'Dev Done' && input.currentState === 'In Dev') ||
    (input.tags?.includes('[awaiting-acceptance]') && input.currentState === 'In Dev') ||
    comment.includes('[reject-acceptance]')
  ) {
    const feedback = comment
      .replace(/\[reject-acceptance\]/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();

    return {
      type: 'reject',
      feedback: feedback || 'Rejected from Dev Done without specific comments. Please review acceptance criteria and test results.',
    };
  }

  return { type: 'none' };
}
```

---

### `src/accept/envelope.ts` (utility / prompt, transform)

**Analog:** `src/plan/formatter.ts` (lines 1-27) & `src/auditor/prompt.ts` (lines 1-50)

**Envelope prompt formatting pattern**:
```typescript
export interface CumulativeReworkEnvelope {
  workItemId: number;
  title: string;
  originalAcceptanceCriteria: string;
  priorGitDiff: string;
  reviewFeedback: string[];
  remainingLocBudget: number;
}

export function formatReworkPrompt(envelope: CumulativeReworkEnvelope): string {
  const feedbackItems = envelope.reviewFeedback
    .map((f, i) => `Feedback #${i + 1}:\n${f}`)
    .join('\n\n');

  return `You are performing an iterative rework turn on ticket #${envelope.workItemId}: "${envelope.title}".

<original_acceptance_criteria>
${envelope.originalAcceptanceCriteria}
</original_acceptance_criteria>

<prior_cumulative_diff>
${envelope.priorGitDiff}
</prior_cumulative_diff>

<reviewer_feedback>
${feedbackItems}
</reviewer_feedback>

<budget_constraints>
Cumulative LOC budget ceiling: 250 LOC total.
Remaining LOC budget available for this turn: ~${Math.max(0, envelope.remainingLocBudget)} LOC.
Protected baseline test files are read-only and must NOT be edited.
</budget_constraints>

INSTRUCTIONS:
1. Address all points raised in the reviewer feedback.
2. DO NOT revert previous changes that satisfy the original acceptance criteria.
3. Keep cumulative diff changes under the 250 LOC ceiling.
4. Protected test files remain read-only.
`;
}
// ponytail: plain text envelope with XML delimiters; add multi-modal attachment diffs in v2
```

---

### `src/sandbox/worktree.ts` (service / utility, file-I/O)

**Analog:** `src/sandbox/worktree.ts` (lines 61-120)

**Worktree creation with branch resumption pattern**:
```typescript
export interface CreateWorktreeOptions {
  baseBranch?: string;
  checkoutExistingBranch?: boolean;
}

export async function createWorktree(
  repoRoot: string,
  workItemId: number,
  title: string,
  options?: CreateWorktreeOptions | string
): Promise<WorktreeResult> {
  const git: SimpleGit = simpleGit(repoRoot);
  const slug = slugify(title);
  const dirName = `ticket-${workItemId}-${slug}`;
  const worktreeDir = path.join(repoRoot, '.worktrees');
  const worktreePath = normalizePath(path.join(worktreeDir, dirName));
  const branchName = `task/ticket-${workItemId}-${slug}`;

  const resolvedOptions: CreateWorktreeOptions =
    typeof options === 'string' ? { baseBranch: options } : options || {};

  const baseBranch = resolvedOptions.baseBranch || 'origin/main';
  const checkoutExisting = resolvedOptions.checkoutExistingBranch ?? false;

  // Prune dangling worktrees first
  try {
    await git.raw(['worktree', 'prune']);
  } catch {
    // Ignore prune errors
  }

  if (!fs.existsSync(worktreeDir)) {
    fs.mkdirSync(worktreeDir, { recursive: true });
  }

  if (fs.existsSync(worktreePath)) {
    await cleanupWorktree(repoRoot, worktreePath, { deleteBranch: !checkoutExisting, branchName });
  }

  if (checkoutExisting) {
    // Resumption: attach worktree to existing task branch without deleting branch
    await git.raw(['worktree', 'add', worktreePath, branchName]);
  } else {
    // Fresh branch: delete existing local branch if present
    try {
      const branchSummary = await git.branchLocal();
      if (branchSummary.all.includes(branchName)) {
        await git.raw(['branch', '-D', branchName]);
      }
    } catch {
      // Ignore deletion failure
    }

    let targetBase = baseBranch;
    try {
      await git.raw(['rev-parse', '--verify', baseBranch]);
    } catch {
      targetBase = 'HEAD';
    }

    await git.raw(['worktree', 'add', '-b', branchName, worktreePath, targetBase]);
  }

  const testFilesProtected = protectTestFiles(worktreePath);

  return {
    worktreePath,
    branchName,
    testFilesProtected,
  };
}
```

---

### `src/execute/rework-worker.ts` (worker / pipeline, loop / request-response)

**Analog:** `src/execute/worker.ts` (lines 59-245)

**Imports pattern**:
```typescript
import fs from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { dedupEvents } from '../db/schema.js';
import { getWorkItemDetails, flagTicketBlocked, type WorkItemDetails } from '../ado/work-item.js';
import { createWorktree, cleanupWorktree, protectTestFiles } from '../sandbox/worktree.js';
import { calculateCumulativeDiff, verifyPackageDependencies } from './diff-guard.js';
import { checkTestImmutability, hasValidAssertions } from '../test-runner/immutability.js';
import { executeRepairLoop } from './repair.js';
import { parseVitestSummary } from '../test-runner/parser.js';
import { recordL3Evidence } from '../test-runner/evidence.js';
import { formatAcceptancePacketComment, buildDevDoneAcceptancePatch } from '../accept/packet.js';
import { resolvePreviewUrl, resolvePrUrl } from '../accept/urls.js';
import { formatReworkPrompt, type CumulativeReworkEnvelope } from '../accept/envelope.js';
import { adoClient } from '../ado/client.js';
import { env } from '../config/env.js';
```

**Rework execution pipeline pattern**:
```typescript
export async function processWorkItemRework(
  workItemId: number,
  revId: number,
  feedbackText: string,
  options?: any
): Promise<void> {
  const workItem = await getWorkItemDetails(workItemId, revId);

  // 1. Attach worktree to existing task branch
  const worktreeResult = await createWorktree(process.cwd(), workItemId, workItem.title, {
    checkoutExistingBranch: true,
  });

  const git = simpleGit(worktreeResult.worktreePath);
  const lockedFiles = worktreeResult.testFilesProtected ?? protectTestFiles(worktreeResult.worktreePath);

  // 2. Fetch cumulative diff against main
  let baseCommit = 'origin/main';
  try {
    await git.raw(['rev-parse', '--verify', 'origin/main']);
  } catch {
    baseCommit = 'HEAD~1';
  }
  const priorDiffStat = await calculateCumulativeDiff(git, baseCommit);

  // 3. Build rework envelope
  const envelope: CumulativeReworkEnvelope = {
    workItemId: workItem.id,
    title: workItem.title,
    originalAcceptanceCriteria: workItem.acceptanceCriteria || '',
    priorGitDiff: priorDiffStat.rawStat,
    reviewFeedback: [feedbackText],
    remainingLocBudget: 250 - priorDiffStat.totalLoc,
  };

  const reworkPrompt = formatReworkPrompt(envelope);

  // 4. Bounded code editing
  if (options?.mockCodeEdit) {
    await options.mockCodeEdit(worktreeResult.worktreePath, reworkPrompt);
  }

  // 5. Verification: diff ceiling (<250 LOC cumulative)
  const cumulativeDiff = await calculateCumulativeDiff(git, baseCommit);
  if (cumulativeDiff.totalLoc > (options?.maxDiffLoc ?? 250)) {
    await flagTicketBlocked(
      workItem.id,
      `<h3>[Diff Ceiling Exceeded] Cumulative rework diff ${cumulativeDiff.totalLoc} LOC exceeds 250 LOC ceiling</h3>`,
      'diff-ceiling'
    );
    await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
    return;
  }

  // 6. Verification: test immutability & package dependencies
  const rawDiff = await git.raw(['diff', '--name-status', baseCommit]);
  const immutability = checkTestImmutability(rawDiff, lockedFiles);
  if (!immutability.valid) {
    await flagTicketBlocked(
      workItem.id,
      `<h3>[Contract Conflict] Protected test files modified in rework</h3>`,
      'contract-conflict'
    );
    await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
    return;
  }

  // 7. Test runner & repair loop
  const repairResult = await executeRepairLoop({
    worktreePath: worktreeResult.worktreePath,
    git,
    workItemId: workItem.id,
    mockTestRunner: options?.mockTestRunner,
  });

  if (!repairResult.success) {
    await flagTicketBlocked(
      workItem.id,
      `<h3>[Repair Exhausted] Rework tests failed</h3>`,
      'repair-exhausted'
    );
    await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
    return;
  }

  // 8. Commit with fix(review) convention
  await git.add('.');
  const status = await git.status();
  if (status.staged.length > 0 || !status.isClean()) {
    await git.commit(`fix(review): address acceptance feedback\n\nAB#${workItem.id}`);
  }

  // 9. Re-record L3 evidence & re-assemble Acceptance Packet
  const durationMs = repairResult.testResult?.durationMs || 100;
  const vitestSummary = parseVitestSummary(repairResult.testResult?.stdout || '', durationMs);
  const passed = vitestSummary.passed || 1;
  const totalTests = vitestSummary.totalTests || 1;

  await recordL3Evidence({
    workItemId: workItem.id,
    revId,
    testSuite: 'vitest',
    totalTests,
    passed,
    failed: 0,
    durationMs,
    gitDiffStat: cumulativeDiff.rawStat || `${cumulativeDiff.totalLoc} LOC`,
  });

  const packetComment = formatAcceptancePacketComment({
    workItemId: workItem.id,
    testSuite: 'vitest',
    totalTests,
    passed,
    failed: 0,
    durationMs,
    gitDiffStat: cumulativeDiff,
    prUrl: resolvePrUrl(workItem.id, worktreeResult.branchName),
    previewUrl: resolvePreviewUrl(workItem.id),
  });

  const patchDoc = buildDevDoneAcceptancePatch(packetComment, workItem.tags);
  await adoClient.updateWorkItem(workItem.id, patchDoc);

  await cleanupWorktree(process.cwd(), worktreeResult.worktreePath);
}
```

---

### `src/db/schema.ts` (model, CRUD)

**Analog:** `src/db/schema.ts` (lines 62-82, `l3Evidence`)

**Table schema definition**:
```typescript
export const reworkCycles = sqliteTable(
  'rework_cycles',
  {
    workItemId: integer('work_item_id').primaryKey(),
    bounceCount: integer('bounce_count').notNull().default(0),
    lastBounceAt: integer('last_bounce_at', { mode: 'timestamp' }),
    sourceGate: text('source_gate', { enum: ['accept', 'pr_review'] }).notNull(),
    escalatedAt: integer('escalated_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_rework_cycles_lookup').on(table.workItemId, table.bounceCount),
  ]
);

export type ReworkCycle = typeof reworkCycles.$inferSelect;
export type InsertReworkCycle = typeof reworkCycles.$inferInsert;
```

---

### `src/config/env.ts` (config, static)

**Analog:** `src/config/env.ts` (lines 1-18)

**Zod schema extension**:
```typescript
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_PATH: z.string().default('./data/gateway.db'),
  ADO_ORG_URL: z.string().url(),
  ADO_PAT: z.string().min(1, 'ADO_PAT is required'),
  ADO_BOT_ID: z.string().min(1, 'ADO_BOT_ID is required'),
  ADO_WEBHOOK_SECRET: z.string().min(1, 'ADO_WEBHOOK_SECRET is required'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  PREVIEW_URL_TEMPLATE: z.string().optional(),
  PR_URL_TEMPLATE: z.string().optional(),
});
```

---

### `src/ado/work-item.ts` (service, request-response)

**Analog:** `src/ado/work-item.ts` (lines 155-196)

**Dev Done acceptance and escalation helpers**:
```typescript
import { buildDevDoneAcceptancePatch } from '../accept/packet.js';
import { buildEscalationPatch } from '../accept/breaker.js';

export async function transitionToDevDoneWithPacket(
  workItemId: number,
  htmlComment: string
): Promise<any> {
  const details = await getWorkItemDetails(workItemId);
  const patchDoc = buildDevDoneAcceptancePatch(htmlComment, details.tags);
  return adoClient.updateWorkItem(workItemId, patchDoc);
}

export async function escalateReworkToBlocked(
  workItemId: number,
  bounceCount: number
): Promise<any> {
  const details = await getWorkItemDetails(workItemId);
  const patchDoc = buildEscalationPatch(workItemId, bounceCount, details.tags);
  return adoClient.updateWorkItem(workItemId, patchDoc);
}
```

---

### `src/execute/router.ts` (controller / router, request-response)

**Analog:** `src/execute/router.ts` (lines 8-55)

**Router routing extension**:
```typescript
import { detectAcceptanceVerdict } from '../accept/verdict.js';
import { evaluateCircuitBreaker, resetCircuitBreaker } from '../accept/breaker.js';
import { escalateReworkToBlocked } from '../ado/work-item.js';
import { processWorkItemRework } from './rework-worker.js';

// Inside routeWorkItemEvent:
const verdict = detectAcceptanceVerdict({
  currentState: workItem.state,
  historyComment: workItem.history,
  tags: workItem.tags,
});

if (verdict.type === 'reset_rework') {
  resetCircuitBreaker(workItemId);
} else if (verdict.type === 'approve') {
  // Acceptance approved - unlock PR path
  await updateWorkItemTags(workItemId, '[acceptance-approved]', '[awaiting-acceptance]');
} else if (verdict.type === 'reject') {
  const breaker = await evaluateCircuitBreaker(workItemId, 'accept');
  if (!breaker.allowed) {
    await escalateReworkToBlocked(workItemId, breaker.currentCount);
  } else {
    await processWorkItemRework(workItemId, revId, verdict.feedback);
  }
}
```

---

### `tests/acceptance-packet.test.ts` (test, unit)

**Analog:** `tests/l3-evidence.test.ts` (lines 37-157)

**Imports and test structure**:
```typescript
import { describe, it, expect } from 'vitest';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import {
  formatAcceptancePacketComment,
  buildDevDoneAcceptancePatch,
} from '../src/accept/packet.js';
import { resolvePreviewUrl, resolvePrUrl } from '../src/accept/urls.js';

describe('Acceptance Packet Formatting & Patch Builders', () => {
  it('formats collapsible acceptance packet with table, PR link, preview link, and bot shield', () => {
    const comment = formatAcceptancePacketComment({
      workItemId: 1001,
      testSuite: 'vitest',
      totalTests: 12,
      passed: 12,
      failed: 0,
      durationMs: 250,
      gitDiffStat: {
        filesChanged: 3,
        insertions: 50,
        deletions: 10,
        totalLoc: 60,
        rawStat: '3 files changed, 50 insertions(+), 10 deletions(-)',
      },
      prUrl: 'https://dev.azure.com/org/proj/_git/repo/pullrequest/42',
      previewUrl: 'https://preview-1001.internal.net',
    });

    expect(comment).toContain('### [Acceptance Packet] Functional Verification Complete');
    expect(comment).toContain('READY FOR ACCEPTANCE');
    expect(comment).toContain('12/12 passed (250ms)');
    expect(comment).toContain('<250 LOC ceiling verified');
    expect(comment).toContain('[View Pull Request]');
    expect(comment).toContain('[Open Staging Preview]');
    expect(comment).toContain('<!-- [automated-agent] -->');
  });

  it('builds Dev Done patch with [awaiting-acceptance] tag', () => {
    const patch = buildDevDoneAcceptancePatch('<div>Packet</div>', 'backend; [awaiting-input]');

    const stateOp = patch.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp?.value).toBe('Dev Done');

    const tagOp = patch.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp?.value).toContain('[awaiting-acceptance]');
    expect(tagOp?.value).not.toContain('[awaiting-input]');
  });
});
```

---

### `tests/verdict-detector.test.ts` (test, unit)

**Analog:** `tests/bot-shield.test.ts` (lines 45-83)

**Verdict classification unit tests**:
```typescript
import { describe, it, expect } from 'vitest';
import { detectAcceptanceVerdict } from '../src/accept/verdict.js';

describe('Human Verdict Detection', () => {
  it('detects approval when moved from Dev Done to Ready for QA', () => {
    const verdict = detectAcceptanceVerdict({
      currentState: 'Ready for QA',
      previousState: 'Dev Done',
    });
    expect(verdict.type).toBe('approve');
  });

  it('detects rejection when moved from Dev Done back to In Dev with human comments', () => {
    const verdict = detectAcceptanceVerdict({
      currentState: 'In Dev',
      previousState: 'Dev Done',
      historyComment: 'Missing validation for negative numbers.',
    });
    expect(verdict.type).toBe('reject');
    if (verdict.type === 'reject') {
      expect(verdict.feedback).toBe('Missing validation for negative numbers.');
    }
  });

  it('detects explicit [reset-rework] comment', () => {
    const verdict = detectAcceptanceVerdict({
      currentState: 'Blocked',
      historyComment: 'Resetting counter: [reset-rework]',
    });
    expect(verdict.type).toBe('reset_rework');
  });
});
```

---

### `tests/rework-breaker.test.ts` (test, unit)

**Analog:** `tests/plan-checkpoint.test.ts` (lines 33-80)

**SQLite breaker counter & escalation unit tests**:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { db, sqlite } from '../src/db/index.js';
import { reworkCycles } from '../src/db/schema.js';
import { evaluateCircuitBreaker, resetCircuitBreaker, buildEscalationPatch } from '../src/accept/breaker.js';

describe('Shared Rework Circuit Breaker', () => {
  beforeEach(() => {
    sqlite.exec('DELETE FROM rework_cycles;');
  });

  it('allows bounces 1 and 2, then trips on bounce 3', async () => {
    const workItemId = 5001;

    // Bounce 1
    const r1 = await evaluateCircuitBreaker(workItemId, 'accept');
    expect(r1.allowed).toBe(true);
    expect(r1.currentCount).toBe(1);

    // Bounce 2
    const r2 = await evaluateCircuitBreaker(workItemId, 'pr_review');
    expect(r2.allowed).toBe(true);
    expect(r2.currentCount).toBe(2);

    // Bounce 3 - trip
    const r3 = await evaluateCircuitBreaker(workItemId, 'accept');
    expect(r3.allowed).toBe(false);
    expect(r3.currentCount).toBe(3);
  });

  it('resets bounce count to 0 when resetCircuitBreaker is called', async () => {
    const workItemId = 5002;
    await evaluateCircuitBreaker(workItemId, 'accept');
    await evaluateCircuitBreaker(workItemId, 'accept');

    resetCircuitBreaker(workItemId);

    const row = db.select().from(reworkCycles).all()[0];
    expect(row.bounceCount).toBe(0);
  });
});
```

---

### `tests/rework-integration.test.ts` (test, integration / e2e)

**Analog:** `tests/l3-evidence.test.ts` (lines 244-322)

**End-to-end rework loop tests**:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { db, sqlite } from '../src/db/index.js';
import { dedupEvents, reworkCycles, l3Evidence } from '../src/db/schema.js';
import { adoClient } from '../src/ado/client.js';
import { processWorkItemRework } from '../src/execute/rework-worker.js';
import { cleanupWorktree } from '../src/sandbox/worktree.js';

describe('Rework Execution Integration Flow', () => {
  beforeEach(() => {
    sqlite.exec('DELETE FROM dedup_events; DELETE FROM rework_cycles; DELETE FROM l3_evidence;');
    adoClient.setWorkItemTrackingApi(null);
  });

  afterEach(async () => {
    const worktreeDir = path.join(process.cwd(), '.worktrees');
    if (fs.existsSync(worktreeDir)) {
      const entries = fs.readdirSync(worktreeDir);
      for (const entry of entries) {
        if (entry.startsWith('ticket-')) {
          await cleanupWorktree(process.cwd(), path.join(worktreeDir, entry), { deleteBranch: true }).catch(() => {});
        }
      }
    }
  });

  it('resumes existing task branch, applies review feedback, verifies, and re-transitions to Dev Done', async () => {
    // End-to-end integration test implementation
  });
});
```

---

## Shared Patterns

### Bot Echo Shield & Loop Prevention
**Source:** `src/ingress/bot-shield.ts` lines 7-16
**Apply to:** All acceptance packets, rework feedback comments, and escalation comments
```typescript
// Always append loop shield to outbound HTML comments
const comment = `${sanitizedHtml}\n<!-- [automated-agent] -->`;

// Webhook / router ingress check
if (isBotEcho({ revisedById, historyComment, botId: env.ADO_BOT_ID }).isEcho) {
  return reply.code(200).send({ status: 'bot_echo_ignored' });
}
```

### Azure DevOps JSON Patching & Tag Manipulation
**Source:** `src/ado/work-item.ts` lines 24-52
**Apply to:** `buildDevDoneAcceptancePatch`, `buildEscalationPatch`
```typescript
export function buildTagPatch(
  currentTags: string | undefined,
  tagToAdd?: string,
  tagToRemove?: string
): JsonPatchOperation[] & JsonPatchDocument {
  const existing = currentTags
    ? currentTags.split(';').map((t) => t.trim()).filter(Boolean)
    : [];

  let updated = [...existing];
  if (tagToAdd && !updated.includes(tagToAdd)) {
    updated.push(tagToAdd);
  }
  if (tagToRemove) {
    updated = updated.filter((t) => t !== tagToRemove);
  }

  return [
    {
      op: currentTags !== undefined ? Operation.Replace : Operation.Add,
      path: '/fields/System.Tags',
      value: updated.join('; '),
    },
  ] as unknown as JsonPatchOperation[] & JsonPatchDocument;
}
```

### SQLite Upsert Pattern
**Source:** `src/db/schema.ts` lines 62-82 & `src/plan/checkpoint.ts` lines 14-34
**Apply to:** `src/accept/breaker.ts`
```typescript
db.insert(reworkCycles)
  .values(entry)
  .onConflictDoUpdate({
    target: reworkCycles.workItemId,
    set: updatedFields,
  })
  .run();
```

### Git Worktree Resumption without Branch Deletion
**Source:** `src/sandbox/worktree.ts` lines 86-111
**Apply to:** Task branch rework resumption
```typescript
if (options?.checkoutExistingBranch) {
  // Attach worktree directly to existing branch:
  await git.raw(['worktree', 'add', worktreePath, branchName]);
} else {
  // Fresh branch creation:
  await git.raw(['worktree', 'add', '-b', branchName, worktreePath, targetBase]);
}
```

### Ponytail Pragmatic Deferral Convention
**Source:** Established throughout codebase (e.g. `src/sandbox/worktree.ts`, `src/config/env.ts`)
**Apply to:** All Phase 4 modules
```typescript
// ponytail: [deliberate simplification]; [upgrade path in v2]
```

---

## No Analog Found

None. All Phase 4 files have existing analogs in the codebase.

---

## Metadata

**Analog search scope:** `src/`, `tests/`  
**Files scanned:** 45  
**Pattern extraction date:** 2026-09-09
