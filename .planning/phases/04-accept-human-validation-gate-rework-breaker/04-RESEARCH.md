# Phase 4: ACCEPT — Human Validation Gate & Rework Breaker - Research

**Researched:** 2026-09-09
**Domain:** Human Acceptance Gates, ADO Discussion Ingress, Circuit Breakers, Iterative Rework Loops
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Implementation Decisions

#### Acceptance Packet Composition & Presentation
- Packet contents: test run summary (passed/failed counts, duration), cumulative diff stat (<250 LOC), PR link, and optional preview/staging URL.
- ADO presentation: formatted HTML comment with `[Acceptance Packet]` header, structured table, collapsible details, and bot loop shield tag.
- Preview resolution: template-based via `PREVIEW_URL_TEMPLATE` env var or local development port fallback.
- Tagging: append `[awaiting-acceptance]` tag to work item when transitioning to `Dev Done`.

#### Human Verdict Detection (Approve vs Reject)
- Approval signal: moving work item from `Dev Done` to `Ready for QA` (or posting `[approve-acceptance]` comment).
- Rejection signal: moving work item from `Dev Done` back to `In Dev` with human feedback comments.
- Feedback extraction: query latest human comments submitted since ticket entered `Dev Done`.
- Loop prevention: verify `System.ChangedBy.id !== ADO_BOT_ID` and comment lacks `[automated-agent]` marker.

#### Rework Context Envelope & Resumption
- Cumulative envelope: original ticket acceptance criteria + prior cumulative git diff + recent developer review comments.
- Task branch: check out existing branch `task/ticket-{id}-{slug}` and apply iterative fixes.
- Commit convention: Conventional Commit `fix(review): address acceptance feedback` with `AB#<id>` trailer.
- Full verification: re-run diff ceiling check, test immutability guard, test runner, and self-repair loop on every rework turn.

#### Shared Rework Circuit Breaker (Max 2 Bounces)
- Counter storage: SQLite `rework_cycles` table `(work_item_id, bounce_count, last_bounce_at, source_gate)`.
- Limit: shared maximum of 2 automated rework cycles across both Accept and PR Review gates.
- Breaker action (3rd rejection): patch `System.State` to `Blocked`, add tag `[rework-escalated]`, post escalation comment tagging human lead.
- Reset mechanism: human comment `[reset-rework]` resets counter to 0 in SQLite.

### Claude's Discretion
- Drizzle schema definition and indexes for `rework_cycles`.
- HTML styling and Markdown formatting for the acceptance packet and rework comments.

### Deferred Ideas (OUT OF SCOPE)
- Interactive approval buttons directly inside Slack or Microsoft Teams (v2).
- Automatic staging environment provisioning via Kubernetes ephemeral namespaces (v2).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ACCP-01 | System transitions work item to "Dev Done" with acceptance packet attached: test run summary, diff stat, PR link, and preview/staging URL where available. | Formatter module compiles L3 test run metrics, cumulative diff stat (<250 LOC), PR URL link, and resolved preview URL; applies `buildDevDoneAcceptancePatch` with `[awaiting-acceptance]` tag and `<!-- [automated-agent] -->` shield. |
| ACCP-02 | Human renders functional acceptance verdict (◆): approve proceeds to PR review/merge; reject moves ticket back to "In Dev" with comments. | Webhook ingress listener detects state transition (`Dev Done` → `Ready for QA` vs `Dev Done` → `In Dev`) or explicit verdict tokens (`[approve-acceptance]`, `[reject-acceptance]`, `[reset-rework]`); extracts recent human feedback comments. |
| ACCP-03 | System enforces a shared rework circuit breaker (max 2 automated bounces across Accept + PR review) before escalating to human tech lead. | SQLite table `rework_cycles` tracks cumulative bounces across Accept and PR Review gates; on 3rd bounce (count >= 2), intercepts flow, transitions ticket to `Blocked`, tags `[rework-escalated]`, and posts tech lead notification comment. |
</phase_requirements>

## Summary

Phase 4 implements the human functional acceptance gate at `Dev Done` and closes the feedback loop back into execution while capping rework iterations. When coding finishes in Phase 3, the orchestrator assembles an Acceptance Packet (test summary, cumulative diff stat, PR link, preview URL) and posts it to ADO Discussion with tag `[awaiting-acceptance]`.

Human reviewers inspect the packet on ADO Boards. When moving the ticket to `Ready for QA` (or commenting `[approve-acceptance]`), the system marks acceptance passed and unlocks the PR merge path. When moving the ticket back to `In Dev` with feedback (or commenting `[reject-acceptance]`), the orchestrator extracts human feedback, checks the shared circuit breaker in SQLite (`rework_cycles`), and if within the 2-bounce budget, constructs a cumulative rework envelope (original AC + prior diff + review feedback) to resume execution on the existing task branch `task/ticket-{id}-{slug}`. Rejections exceeding the 2-bounce cap immediately escalate to `Blocked` with tag `[rework-escalated]`.

**Primary recommendation:** Store rework counters in a dedicated `rework_cycles` SQLite table, modify `createWorktree` to support attaching to existing task branches without branch deletion, format acceptance packets as collapsible HTML tables, and guard against bot loops using existing `isBotEcho` checks.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Acceptance Packet Assembly | Backend / Worker | ADO API Client | Test metrics and diff stats exist in worker completion pipeline; formatted as ADO HTML comment. |
| Dev Done Transition & Tagging | ADO API Client | SQLite Dedup | Atomic JSON Patch replaces state with `Dev Done` and adds `[awaiting-acceptance]` tag. |
| Human Verdict Ingress & Detection | Ingress Gateway | Fastify Webhook | ADO Service Hook `workitem.updated` fires on board column drag or comment submission. |
| Circuit Breaker State & Escalation | Persistence / SQLite | Ingress Router | Shared table `rework_cycles` tracks bounces across Accept and PR Review; short-circuits execution before container/worker spawn. |
| Cumulative Rework Envelope | Execution Engine | Sandbox Worktree | Extracts prior diff via `simple-git`, combines with AC and review comments into structured prompt context. |
| Task Branch Resumption | Sandbox Worktree | Execution Worker | Checks out existing `task/ticket-{id}-{slug}` branch without destroying prior commits. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^13.0.3 | Persistence for `rework_cycles` | Synchronous C++ binding, microsecond transactional reads/writes in WAL mode. Zero external server. [VERIFIED: package.json] |
| drizzle-orm | ^0.45.2 | Schema definition & SQL builder | Type-safe schema for `rework_cycles`, compile-time typed queries. [VERIFIED: package.json] |
| azure-devops-node-api | ^17.0.0 | Work item updates & comments | Official Microsoft client SDK for JSON Patch operations and comment inspection. [VERIFIED: package.json] |
| simple-git | ^3.36.0 | Git branch checkout & diff stat | Wraps native Git CLI for cumulative diff calculation and task branch checkout. [VERIFIED: package.json] |
| marked + sanitize-html | ^18.0.11 / ^2.17.7 | Markdown to ADO-safe HTML | Converts acceptance summary markdown to clean ADO-compatible HTML with loop shields. [VERIFIED: package.json] |
| zod | ^4.5.4 | Schema validation | Validates acceptance packet inputs, rework envelopes, and verdict payloads. [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| p-queue | ^9.3.3 | Concurrency serialization | Serializes rapid feedback updates on identical work items via per-item lane. [VERIFIED: package.json] |
| execa | ^10.0.1 | Process runner | Runs unit tests and verification during rework cycle. [VERIFIED: package.json] |
| dotenv | ^17.4.0 | Config loading | Loads `PREVIEW_URL_TEMPLATE` and `PR_URL_TEMPLATE` env vars. [VERIFIED: package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQLite `rework_cycles` | ADO Custom Field (`Custom.ReworkCount`) | Requires modifying ADO Process Template in organizational settings; fails without admin permissions. SQLite requires zero cloud configuration. |
| Webhook state listener | ADO Poller cron | Webhooks deliver state transitions within 500ms; polling adds 60s latency and wastes API quota. Poller serves only as fallback. |
| Preserving branch commits | Squashing all rework into single commit | Loses intermediate audit trail; reviewer cannot see what changed in response to feedback. Standard git commits with `fix(review): ...` preserve history. |

## Architecture Patterns

### System Architecture Diagram

```
[Phase 3: Execution Worker Finishes]
                │
                ▼
┌──────────────────────────────────────────────┐
│ 1. Assemble Acceptance Packet (ACCP-01)      │
│    - Test run metrics (pass/fail/duration)   │
│    - Cumulative diff stat (<250 LOC)         │
│    - PR link (template / branch compare)     │
│    - Preview URL (template / local port)     │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ 2. Patch ADO Work Item                       │
│    - System.State = 'Dev Done'               │
│    - Tags += '[awaiting-acceptance]'         │
│    - Post formatted HTML comment + shield    │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
            [Human Review on ADO]
           ┌───────────┴───────────┐
           │                       │
      [Approve ◆]              [Reject ◆]
 (Dev Done -> Ready for QA)  (Dev Done -> In Dev)
           │                       │
           ▼                       ▼
┌──────────────────────┐ ┌──────────────────────────────────────────────┐
│ 3. Ingress Route     │ │ 4. Ingress Route                             │
│    - Bot echo check  │ │    - Bot echo check (prevent agent loop)     │
│    - Remove tag      │ │    - Extract human feedback comments         │
│      [awaiting-      │ └──────────────────────┬───────────────────────┘
│       acceptance]    │                        │
│    - Tag [acceptance-│                        ▼
│       approved]      │ ┌──────────────────────────────────────────────┐
│    - Unlock PR merge │ │ 5. Circuit Breaker Evaluation (ACCP-03)      │
│      gate (Phase 5)  │ │    - Query SQLite `rework_cycles`            │
└──────────────────────┘ └──────────────────────┬───────────────────────┘
                                                │
                       ┌────────────────────────┴────────────────────────┐
                       │                                                 │
               [Bounces < 2]                                    [Bounces >= 2]
                       │                                                 │
                       ▼                                                 ▼
┌──────────────────────────────────────────────┐ ┌──────────────────────────────────────────────┐
│ 6. Resume Rework Agent                       │ │ 7. Escalate to Tech Lead (ACCP-03)           │
│    - Increment bounce_count in SQLite        │ │    - System.State = 'Blocked'                │
│    - Build Cumulative Rework Envelope:       │ │    - Tags += '[rework-escalated]'            │
│      * Original AC                           │ │    - Tags -= '[awaiting-acceptance]'         │
│      * Prior diff (`origin/main...HEAD`)     │ │    - Post escalation HTML comment tagging    │
│      * Human review comments                 │ │      human lead (@TechLead)                  │
│    - Attach worktree to existing branch      │ │    - Halt automated execution                │
│      `task/ticket-{id}-{slug}`               │ └──────────────────────────────────────────────┘
│    - Apply code fixes                        │
│    - Commit: `fix(review): ... AB#{id}`      │
│    - Re-verify: diff ceiling, immutability,  │
│      unit tests, self-repair                 │
│    - Loop back to Step 1 (re-Dev Done)       │
└──────────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── accept/
│   ├── packet.ts          # Acceptance packet formatting & Dev Done patch builder
│   ├── breaker.ts         # Shared rework circuit breaker service (rework_cycles)
│   ├── verdict.ts         # Human verdict classifier (approve vs reject vs reset)
│   ├── envelope.ts        # Cumulative rework context envelope builder
│   └── rework-worker.ts   # Rework execution pipeline resuming task branch
├── db/
│   ├── schema.ts          # Added reworkCycles table definition
│   └── index.ts
├── sandbox/
│   └── worktree.ts        # Extended with checkoutExistingBranch option
├── execute/
│   └── router.ts          # Extended routing for Dev Done verdicts
└── config/
    └── env.ts             # Added PREVIEW_URL_TEMPLATE & PR_URL_TEMPLATE
```

### Pattern 1: Acceptance Packet Composition & HTML Presentation
**What:** Combines L3 test evidence, git diff stats, PR URLs, and preview URLs into a clean ADO discussion comment.
**When to use:** At completion of bounded implementation before moving to `Dev Done`.
**Example:**
```typescript
// Source: src/accept/packet.ts
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

### Pattern 2: Shared Rework Circuit Breaker Schema & Service
**What:** SQLite table and transactional check capping cumulative rework bounces at 2 across Accept and PR Review gates.
**When to use:** On every ticket rejection moving `Dev Done` → `In Dev` or PR review rejection.
**Example:**
```typescript
// Source: src/accept/breaker.ts
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
    // 3rd rejection trips breaker
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

  // Increment bounce count
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

### Pattern 3: Cumulative Rework Envelope
**What:** Combines original ticket criteria, prior git diff against base branch, and latest review comments into a single prompt context.
**When to use:** When re-triggering the coding agent on a rejected ticket.
**Example:**
```typescript
// Source: src/accept/envelope.ts
export interface CumulativeReworkEnvelope {
  workItemId: number;
  title: string;
  originalAcceptanceCriteria: string;
  priorGitDiff: string;
  reviewFeedback: string[];
}

export function formatReworkPrompt(envelope: CumulativeReworkEnvelope): string {
  return `You are performing an iterative rework turn on ticket #${envelope.workItemId}: "${envelope.title}".

<original_acceptance_criteria>
${envelope.originalAcceptanceCriteria}
</original_acceptance_criteria>

<prior_cumulative_diff>
${envelope.priorGitDiff}
</prior_cumulative_diff>

<reviewer_feedback>
${envelope.reviewFeedback.map((f, i) => `Comment ${i + 1}:\n${f}`).join('\n\n')}
</reviewer_feedback>

INSTRUCTIONS:
1. Address all points raised in the reviewer feedback.
2. DO NOT revert previous changes that satisfy the original acceptance criteria.
3. Keep cumulative diff changes under the <250 LOC ceiling.
4. Protected test files remain read-only.
`;
}
```

### Pattern 4: Task Branch Resumption (Preserving Commits)
**What:** Checking out existing task branch `task/ticket-{id}-{slug}` in worktree without deleting the branch.
**When to use:** During rework resumption.
**Fix required in `createWorktree`:**
```typescript
// In src/sandbox/worktree.ts:
// Add checkoutExistingBranch parameter:
if (options?.checkoutExistingBranch) {
  // Do NOT run `git branch -D branchName`
  // Attach worktree directly to existing branch:
  await git.raw(['worktree', 'add', worktreePath, branchName]);
} else {
  // Fresh branch creation:
  await git.raw(['worktree', 'add', '-b', branchName, worktreePath, targetBase]);
}
```

### Anti-Patterns to Avoid
- **Branch Deletion on Resumption:** Invoking `git branch -D task/ticket-{id}` on rework wipes out prior implementation commits and makes cumulative diff tracking impossible.
- **Feedback Amnesia (Single-Comment Context):** Providing only the latest review comment without original AC causes the agent to break previously passing requirements while fixing the feedback.
- **Missing Bot Echo Shield:** Omitting `<!-- [automated-agent] -->` on acceptance packets or escalation comments causes ADO webhook loops.
- **Uncapped Rework Bounces:** Allowing tickets to loop indefinitely between `Dev Done` and `In Dev` burns LLM tokens and creates reviewer fatigue. The circuit breaker must strictly stop at 2 bounces.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Diff Calculation | Custom line-diff parser | `simpleGit.raw(['diff', '--shortstat', 'origin/main...HEAD'])` [VERIFIED: simple-git] | Native Git handles whitespace, renames, binary files, and CRLF normalization correctly. |
| Comment HTML Sanitization | Regex tag stripper | `sanitize-html` [VERIFIED: npm package] | Regexes fail on malformed nested tags, script injection vectors, and broken entities. |
| Deduplication & Locking | In-memory `Set` or global variables | SQLite `dedup_events` table with unique constraint `(work_item_id, rev_id)` [VERIFIED: better-sqlite3] | Process restarts or cluster scale-out erase in-memory locks, leading to duplicate execution runs. |
| URL Template Resolution | Custom template engine | Native regex string replacement (`template.replace('{workItemId}', id)`) [VERIFIED: Node.js stdlib] | Zero dependencies needed for simple token substitution. |

**Key insight:** Rework loops must be stateful and deterministic. Git maintains code state; SQLite maintains cycle counts.

## Common Pitfalls

### Pitfall 1: Git Branch Destruction on Rework
**What goes wrong:** `createWorktree` in `src/sandbox/worktree.ts` currently runs `git branch -D branchName` if the branch exists. Calling it on rework deletes the task branch and erases all prior code commits. [VERIFIED: src/sandbox/worktree.ts line 95]
**Why it happens:** Initial implementation assumed worktrees were only created for fresh tickets.
**How to avoid:** Add `{ checkoutExisting: boolean }` option to `createWorktree`. If true, skip branch deletion and execute `git worktree add <path> <branch>`.
**Warning signs:** Git errors `fatal: A branch named 'task/ticket-...' already exists` or loss of commit history on rejected tickets.

### Pitfall 2: Feedback Amnesia & Reverting Previous Turns
**What goes wrong:** Agent fixes a requested change from Reviewer 2, but undoes a fix requested by Reviewer 1 in the previous turn.
**Why it happens:** Agent prompt only includes the latest comment string, lacking historical context.
**How to avoid:** Construct Cumulative Rework Envelope containing (1) original AC, (2) cumulative diff against `origin/main`, and (3) all comments recorded since the ticket first entered `Dev Done`.
**Warning signs:** Ping-pong commit diffs alternating between two implementations.

### Pitfall 3: Bot Echo Loops on Acceptance / Escalation Comments
**What goes wrong:** Posting the `[Acceptance Packet]` comment triggers ADO `workitem.updated` webhook, which system misinterprets as human activity and re-runs.
**Why it happens:** ADO fires webhooks for all work item mutations regardless of actor.
**How to avoid:** Ensure all outbound comments append `<!-- [automated-agent] -->` and webhook handler runs `isBotEcho` check before dispatching. [VERIFIED: src/ingress/bot-shield.ts]
**Warning signs:** Rapid consecutive comments appearing in ticket history within seconds.

### Pitfall 4: Rework Diff Ceiling Explosion
**What goes wrong:** Adding review fixes pushes total cumulative LOC over 250 LOC, triggering immediate `diff-ceiling` block.
**Why it happens:** Each rework iteration adds lines. If the original implementation was 240 LOC, a 15 LOC fix exceeds the budget.
**How to avoid:** The rework prompt must explicitly warn the agent of remaining LOC budget: `Budget remaining: ${250 - totalLoc} LOC`. If exceeded, flag ticket blocked for human review.
**Warning signs:** Tickets failing verification on rework turn with `diff-ceiling-exceeded`.

## Code Examples

### 1. Drizzle Schema for `rework_cycles`
```typescript
// Source: src/db/schema.ts
import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';

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

### 2. URL Resolvers for Preview and PR Links
```typescript
// Source: src/accept/urls.ts
import { env } from '../config/env.js';

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
  // Optional fallback: link to Azure DevOps branch compare
  return `${env.ADO_ORG_URL}/_git?version=GB${encodeURIComponent(branchName)}`;
}
```

### 3. Human Verdict Detection
```typescript
// Source: src/accept/verdict.ts
export type AcceptanceVerdict =
  | { type: 'approve'; comment?: string }
  | { type: 'reject'; feedback: string }
  | { type: 'reset_rework' }
  | { type: 'none' };

export function detectAcceptanceVerdict(
  currentState: string,
  previousState: string | undefined,
  historyComment: string | undefined,
  tags: string | undefined
): AcceptanceVerdict {
  const comment = historyComment || '';

  if (comment.includes('[reset-rework]')) {
    return { type: 'reset_rework' };
  }

  // Approval: state moved to Ready for QA or comment explicitly approves
  if (
    (previousState === 'Dev Done' && (currentState === 'Ready for QA' || currentState === 'Approved')) ||
    comment.includes('[approve-acceptance]')
  ) {
    return { type: 'approve', comment };
  }

  // Rejection: state moved from Dev Done back to In Dev, or comment explicitly rejects
  if (
    (previousState === 'Dev Done' && currentState === 'In Dev') ||
    (tags?.includes('[awaiting-acceptance]') && currentState === 'In Dev') ||
    comment.includes('[reject-acceptance]')
  ) {
    return {
      type: 'reject',
      feedback: comment.replace(/\[reject-acceptance\]/g, '').trim() || 'No feedback details provided in comment.',
    };
  }

  return { type: 'none' };
}
```

### 4. Breaker Action: Tech Lead Escalation Comment & Patch
```typescript
// Source: src/accept/breaker.ts
import { Operation, type JsonPatchDocument } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { buildTagPatch } from '../ado/work-item.js';

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
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Infinite rework loops | Hard circuit breaker capped at 2 bounces [VERIFIED: 04-CONTEXT.md] | 2026-09-07 (Audit) | Prevents token budget exhaustion and human review fatigue. |
| Raw markdown comments in ADO | Marked + sanitize-html conversion [VERIFIED: src/ado/work-item.ts] | Phase 1 | Ensures clean HTML rendering on ADO Boards discussion fields. |
| In-memory bounce counters | SQLite `rework_cycles` persistence [VERIFIED: 04-CONTEXT.md] | Phase 4 | State survives orchestrator restarts; shared across Accept and PR Review gates. |
| Re-creating branch on rework | Checking out existing branch with conventional fix commits [VERIFIED: 04-CONTEXT.md] | Phase 4 | Preserves cumulative commit history and diff integrity. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Human reviewers can signal approval either by dragging ticket on board (`Dev Done` → `Ready for QA`) or commenting `[approve-acceptance]`. | Human Verdict Detection | Low: both signals are supported simultaneously. |
| A2 | Preview URL template can use `{workItemId}` interpolation token. | URL Resolvers | Low: standard pattern for dev environments. |
| A3 | PR link can be constructed via `PR_URL_TEMPLATE` or point to branch compare URL prior to Phase 5 PR automation. | URL Resolvers | Low: ACCP-01 requires PR link where available; Phase 5 implements full PR creation. |

## Open Questions

1. **How should review comments be fetched if human rejects by dragging the card without adding a comment?**
   - What we know: ADO allows state transitions without comments.
   - Recommendation: If `System.History` is empty on `Dev Done` → `In Dev` transition, check `witApi.getComments()` for the latest non-bot comment; if still empty, default feedback to `"Rejected from Dev Done without specific comments. Please review acceptance criteria and test results."`

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Core runtime | ✓ | 24.0.2 | — |
| Git | Worktree & diff management | ✓ | 2.53.0 | — |
| SQLite (better-sqlite3) | Rework cycles table | ✓ | 13.0.3 | — |
| Vitest | Test execution & verification | ✓ | 5.0.0 | — |
| npm | Package manager | ✓ | 11.3.0 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.0 [VERIFIED: package.json] |
| Config file | `vitest.config.ts` [VERIFIED] |
| Quick run command | `npx vitest run tests/acceptance-packet.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACCP-01 | Assembles acceptance packet comment, resolves preview URL, and builds Dev Done patch with `[awaiting-acceptance]` tag | unit | `npx vitest run tests/acceptance-packet.test.ts` | ❌ Wave 0 |
| ACCP-02 | Detects approve/reject/reset verdicts from state transitions and comments; extracts human feedback | unit | `npx vitest run tests/verdict-detector.test.ts` | ❌ Wave 0 |
| ACCP-03 | Shared circuit breaker records bounces, allows bounces 1-2, trips and escalates on 3rd bounce to Blocked | unit | `npx vitest run tests/rework-breaker.test.ts` | ❌ Wave 0 |
| ACCP-01..03 | Full rework cycle: Dev Done → Reject → Rework on existing branch → Verify → re-Dev Done; 3rd reject → Blocked | integration | `npx vitest run tests/rework-integration.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/acceptance-packet.test.ts tests/rework-breaker.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/acceptance-packet.test.ts` — covers ACCP-01 (formatting, templates, Dev Done patch)
- [ ] `tests/verdict-detector.test.ts` — covers ACCP-02 (approve/reject/reset parsing)
- [ ] `tests/rework-breaker.test.ts` — covers ACCP-03 (SQLite table, counter increment, trip at 2, reset)
- [ ] `tests/rework-integration.test.ts` — covers ACCP-01..03 end-to-end flow

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Internal pipeline operations; webhook authentication handled in Phase 1 via HMAC. |
| V3 Session Management | no | Stateless webhook processing. |
| V4 Access Control | yes | Verify `System.ChangedBy.id !== ADO_BOT_ID` to prevent privilege escalation or self-approval loops. |
| V5 Input Validation | yes | Sanitize all human review comments via `sanitize-html`; validate packet payloads via Zod. |
| V6 Cryptography | no | No new cryptographic primitives needed in Phase 4. |

### Known Threat Patterns for Phase 4 Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Bot Echo Infinite Loop | Denial of Service | Include `<!-- [automated-agent] -->` loop shield in all acceptance and escalation comments; filter via `isBotEcho`. |
| Malicious Review Feedback Injection | Tampering / Elevation | XML-delimit human comments inside rework prompt (`<reviewer_feedback>`); enforce strict test immutability and diff ceiling (<250 LOC). |
| HTML Script Injection via ADO Comments | Tampering | Sanitize HTML using `sanitize-html` before submitting JSON Patch to ADO API. |
| Unbounded Rework Spend | Denial of Service | Hard SQLite circuit breaker strictly blocks after 2 automated bounces. |

## Sources

### Primary (HIGH confidence)
- `04-CONTEXT.md` - Phase 4 implementation decisions and boundary constraints. [VERIFIED]
- `src/db/schema.ts` & `src/db/index.ts` - Existing SQLite database setup and Drizzle ORM schemas. [VERIFIED]
- `src/execute/worker.ts` - Existing Phase 3 execution worker and verification pipeline. [VERIFIED]
- `src/sandbox/worktree.ts` - Ephemeral git worktree manager and test protection logic. [VERIFIED]
- `src/test-runner/evidence.ts` - L3 evidence recording and Dev Done patch builder. [VERIFIED]
- `src/ingress/bot-shield.ts` - Bot loop detection mechanism. [VERIFIED]

### Secondary (MEDIUM confidence)
- Microsoft Azure DevOps Services REST API Documentation: Work Item Tracking Comments & Updates. [CITED: learn.microsoft.com/en-us/rest/api/azure/devops/wit]
- Autonomous Coding Agent Circuit Breakers & Ping-Pong Post-Mortems (SWE-bench analysis). [CITED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries verified from existing codebase and package.json.
- Architecture: HIGH - straightforward extension of existing SQLite WAL, Fastify webhook router, and worktree runner.
- Pitfalls: HIGH - critical git branch deletion bug identified in `createWorktree` and mitigation designed.

**Research date:** 2026-09-09
**Valid until:** 2026-10-09 (30 days)
