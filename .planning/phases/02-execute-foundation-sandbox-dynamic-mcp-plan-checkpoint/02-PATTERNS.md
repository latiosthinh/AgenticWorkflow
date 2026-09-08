# Phase 2: EXECUTE Foundation — Sandbox, Dynamic MCP & Plan Checkpoint - Pattern Map

**Mapped:** 2026-09-08  
**Files analyzed:** 27 (22 source files + 5 test files)  
**Analogs found:** 27 / 27 (100% coverage across Phase 1 codebase)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/db/schema.ts` | model | CRUD | `src/db/schema.ts` | exact |
| `src/db/index.ts` | config / db | CRUD | `src/db/index.ts` | exact |
| `src/utils/paths.ts` | utility | transform | `src/ingress/bot-shield.ts` | role-match |
| `src/sandbox/types.ts` | model / types | request-response | `src/auditor/schema.ts` | role-match |
| `src/sandbox/worktree.ts` | service | file-I/O | `src/ado/work-item.ts` + `src/db/index.ts` | role-match |
| `src/sandbox/runner.ts` | service | request-response | `src/ado/client.ts` | role-match |
| `src/mcp/types.ts` | model / types | request-response | `src/auditor/schema.ts` | role-match |
| `src/mcp/server.ts` | service | request-response | `src/ado/client.ts` | role-match |
| `src/mcp/tools/common.ts` | component | request-response | `src/auditor/evaluator.ts` | role-match |
| `src/mcp/tools/frontend.ts` | component | request-response | `src/auditor/evaluator.ts` | role-match |
| `src/mcp/tools/backend.ts` | component | request-response | `src/auditor/evaluator.ts` | role-match |
| `src/mcp/tools/infra.ts` | component | request-response | `src/auditor/evaluator.ts` | role-match |
| `src/mcp/registry.ts` | service | transform | `src/queue/lane-manager.ts` | role-match |
| `src/plan/schema.ts` | model / schema | request-response | `src/auditor/schema.ts` | exact |
| `src/plan/formatter.ts` | utility | transform | `src/ado/formatter.ts` | exact |
| `src/plan/checkpoint.ts` | service / repo | CRUD | `src/auditor/worker.ts` | role-match |
| `src/plan/planner.ts` | service / AI agent | request-response | `src/auditor/evaluator.ts` | exact |
| `src/plan/watchdog.ts` | service / poller | batch | `src/ingress/poller.ts` + `src/index.ts` | exact |
| `src/ado/work-item.ts` | service | request-response | `src/ado/work-item.ts` | exact |
| `src/execute/worker.ts` | controller / worker | request-response | `src/auditor/worker.ts` | exact |
| `src/execute/router.ts` | controller / router | request-response | `src/ingress/routes.ts` | exact |
| `src/index.ts` | entrypoint | lifecycle | `src/index.ts` | exact |
| `tests/worktree.test.ts` | test | file-I/O | `tests/worker.test.ts` | role-match |
| `tests/runner.test.ts` | test | process-exec | `tests/ado-client.test.ts` | role-match |
| `tests/mcp-registry.test.ts` | test | unit | `tests/auditor.test.ts` | role-match |
| `tests/planner.test.ts` | test | AI reasoning | `tests/auditor.test.ts` | exact |
| `tests/plan-checkpoint.test.ts` | test | integration | `tests/worker.test.ts` | exact |

---

## Pattern Assignments

### 1. `src/db/schema.ts` & `src/db/index.ts` (model / config, CRUD)

**Analog:** `src/db/schema.ts` and `src/db/index.ts`

**Imports pattern** (`src/db/schema.ts`, lines 1-2):
```typescript
import { sqliteTable, integer, text, primaryKey } from 'drizzle-orm/sqlite-core';
```

**Table definition pattern** (`src/db/schema.ts`, lines 3-16, 31-34):
```typescript
export const dedupEvents = sqliteTable('dedup_events', {
  workItemId: integer('work_item_id').notNull(),
  revId: integer('rev_id').notNull(),
  status: text('status', { enum: ['pending', 'completed', 'skipped', 'failed'] })
    .notNull()
    .default('pending'),
  payloadHash: text('payload_hash').notNull(),
  errorMessage: text('error_message'),
  receivedAt: integer('received_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => [
  primaryKey({ columns: [table.workItemId, table.revId] }),
]);

export type DedupEvent = typeof dedupEvents.$inferSelect;
export type InsertDedupEvent = typeof dedupEvents.$inferInsert;
```

**Raw DDL migration pattern** (`src/db/index.ts`, lines 17-45):
```typescript
export const sqlite = new Database(env.DATABASE_PATH);

sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');

sqlite.exec(`
CREATE TABLE IF NOT EXISTS dedup_events (
  work_item_id INTEGER NOT NULL,
  rev_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload_hash TEXT NOT NULL,
  error_message TEXT,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (work_item_id, rev_id)
);
`);

export const db = drizzle(sqlite, { schema });
```

**Application to Phase 2:**
Define `planCheckpoints` table in `src/db/schema.ts` with columns: `id`, `workItemId`, `revId`, `status` (`pending_human_input`, `resumed`, `locked`, `blocked`, `expired`), `questions`, `answers`, `planMarkdown`, `estimatedFiles`, `testStrategy`, `remindedAt`, `escalatedAt`, `createdAt`, `updatedAt`. Add matching `CREATE TABLE IF NOT EXISTS plan_checkpoints` statement in `src/db/index.ts`.

---

### 2. `src/utils/paths.ts` (utility, transform)

**Analog:** `src/ingress/bot-shield.ts` & `src/ingress/hmac.ts`

**Pure function transform pattern** (`src/ingress/bot-shield.ts`, lines 7-17):
```typescript
export function isBotEcho(input: BotShieldInput): { isEcho: boolean; reason?: string } {
  if (input.revisedById && input.revisedById.toLowerCase() === input.botId.toLowerCase()) {
    return { isEcho: true, reason: 'Actor matches ADO_BOT_ID' };
  }

  if (input.historyComment && input.historyComment.includes('[automated-agent]')) {
    return { isEcho: true, reason: 'History comment contains [automated-agent] marker' };
  }

  return { isEcho: false };
}
```

**Application to Phase 2:**
- `normalizePath(p: string): string`: Converts Windows backslashes (`\`) to POSIX slashes (`/`), drops trailing slashes.
- `slugify(text: string): string`: Normalizes ticket title into lowercase alphanumeric kebab slug (`/[^a-z0-9]+/g`), truncated to 40 chars.

---

### 3. `src/sandbox/worktree.ts` (service, file-I/O)

**Analog:** `src/db/index.ts` (filesystem/native) + `src/ado/work-item.ts` (state operations)

**FS directory bootstrap pattern** (`src/db/index.ts`, lines 10-15):
```typescript
if (env.DATABASE_PATH !== ':memory:') {
  const dir = path.dirname(env.DATABASE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
```

**Core Worktree & Permission Pattern:**
```typescript
import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';
import { normalizePath, slugify } from '../utils/paths.js';

export async function createWorktree(
  repoRoot: string,
  workItemId: number,
  title: string,
  baseBranch = 'origin/main'
) {
  const git: SimpleGit = simpleGit(repoRoot);
  const slug = slugify(title);
  const dirName = `ticket-${workItemId}-${slug}`;
  const worktreePath = normalizePath(path.join(repoRoot, '.worktrees', dirName));
  const branchName = `task/ticket-${workItemId}-${slug}`;

  await git.raw(['worktree', 'prune']);
  fs.mkdirSync(path.join(repoRoot, '.worktrees'), { recursive: true });

  await git.raw(['worktree', 'add', '-b', branchName, worktreePath, baseBranch]);
  // Protect tests: chmod 0o444 recursively
  // Return { worktreePath, branchName }
}

export async function cleanupWorktree(repoRoot: string, worktreePath: string) {
  // Unprotect files before removal (chmod 0o666) to avoid Windows EPERM
  // git worktree remove --force
  // git worktree prune
}
```

**Application to Phase 2:**
- Startup cleanup prunes orphaned worktrees older than 2 hours (`pruneOrphanedWorktrees`).
- Test protection sets files matching `/\.(test|spec)\.(ts|js|tsx|jsx)$/` to `0o444`.

---

### 4. `src/sandbox/runner.ts` (service, process execution)

**Analog:** `src/ado/client.ts` (resilience, timeout enforcement, error mapping)

**Error wrapping & retry/timeout pattern** (`src/ado/client.ts`, lines 7-28):
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
      // inspect error, detect timeout/disconnect, handle or throw
    }
  }
}
```

**Core Execa & Credential Scrubbing Pattern:**
```typescript
import { execa } from 'execa';

export async function runCommand(
  file: string,
  args: string[],
  options: CommandOptions,
  knownSecrets: string[] = []
): Promise<CommandResult> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  try {
    const result = await execa(file, args, {
      cwd: options.cwd,
      shell: false,
      timeout: timeoutMs,
      killSignal: 'SIGTERM',
      forceKillAfterDelay: 2_000,
      env: sanitizeEnv(options.env),
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      stdout: truncateBuffer(scrubOutput(result.stdout, knownSecrets)),
      stderr: truncateBuffer(scrubOutput(result.stderr, knownSecrets)),
      exitCode: result.exitCode ?? 0,
      timedOut: false,
    };
  } catch (err: any) {
    const isTimeout = Boolean(err.timedOut);
    return {
      stdout: truncateBuffer(scrubOutput(err.stdout || '', knownSecrets)),
      stderr: truncateBuffer(scrubOutput(err.stderr || err.message || '', knownSecrets)),
      exitCode: err.exitCode ?? (isTimeout ? 124 : 1),
      timedOut: isTimeout,
    };
  }
}
```

**Application to Phase 2:**
- Strip env variables matching `/(PAT|API_KEY|TOKEN|SECRET)/i`.
- Redact secrets via regex replace (`scrubOutput`).
- Cap buffers at 50KB with `[...truncated...]` retention (`truncateBuffer`).

---

### 5. `src/plan/schema.ts` & `src/auditor/schema.ts` (model / schema, validation)

**Analog:** `src/auditor/schema.ts`

**Zod Schema & Infer Pattern** (`src/auditor/schema.ts`, lines 1-9):
```typescript
import { z } from 'zod';

export const AuditResultSchema = z.object({
  passed: z.boolean().describe('True if work item satisfies Definition of Done, false otherwise'),
  reasons: z.array(z.string()).describe('Checklist of met criteria if passed; specific missing requirements if failed'),
  criteria_summary: z.string().describe('Executive evaluation of acceptance criteria testability, persona clarity, and scope completeness'),
});

export type AuditResult = z.infer<typeof AuditResultSchema>;
```

**Application to Phase 2:**
Define `PlanResultSchema` with:
- `hasAmbiguities: z.boolean()`
- `questions: z.array(z.string())`
- `planMarkdown: z.string()`
- `estimatedFiles: z.array(z.string())`
- `testStrategy: z.string()`

---

### 6. `src/plan/formatter.ts` (utility, transform)

**Analog:** `src/ado/formatter.ts`

**Marked + SanitizeHtml + Bot Tag Pattern** (`src/ado/formatter.ts`, lines 1-45):
```typescript
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import type { AuditResult } from '../auditor/schema.js';

export function formatL1AuditComment(result: AuditResult): string {
  let md: string;
  // build markdown...
  const rawHtml = marked.parse(md) as string;
  const sanitized = sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'title'],
    },
  });

  return `${sanitized.trim()}\n<!-- [automated-agent] -->`;
}
```

**Application to Phase 2:**
- `formatPlanQuestionsComment(questions: string[])`: Generates `### [Plan Q&A]` HTML comment with numbered questions, instruction to reply directly, and `<!-- [automated-agent] -->` suffix.
- `formatPlanLockedComment(planMarkdown: string, estimatedFiles: string[])`: Generates `### [Plan Checkpoint] Implementation Plan Locked` HTML comment with estimated file list, markdown body, and `<!-- [automated-agent] -->` suffix.

---

### 7. `src/plan/planner.ts` (service, AI agent reasoning)

**Analog:** `src/auditor/evaluator.ts`

**AI generateText with Output.object & Test Fallback Pattern** (`src/auditor/evaluator.ts`, lines 147-164):
```typescript
// ponytail: deterministic offline fallback in test env; enable live model in staging
if (env.NODE_ENV === 'test' && !opts?.forceAi) {
  return evaluateDoDDeterministically(ticket);
}

const promptConfig = buildAuditorPrompt(ticket);

const result = await generateText({
  model: openai('gpt-4o'),
  instructions: promptConfig.instructions,
  prompt: promptConfig.prompt,
  output: Output.object({
    schema: AuditResultSchema,
  }),
});

return AuditResultSchema.parse(result.output);
```

**Application to Phase 2:**
- Formulates plan or detects ambiguities.
- Deterministic test fallback enabled when `env.NODE_ENV === 'test' && !opts?.forceAi`.
- Output validated against `PlanResultSchema`.

---

### 8. `src/plan/watchdog.ts` (service, poller / batch)

**Analog:** `src/ingress/poller.ts` (interval lifecycle) + `src/index.ts` (scheduled cleanup)

**Interval Cleanup & Poller Pattern** (`src/ingress/poller.ts`, lines 28-49):
```typescript
export function startPolling(options: PollerOptions = {}): { stop: () => void } {
  const intervalMs = options.intervalMs ?? 15000;
  let running = true;

  const timer = setInterval(async () => {
    if (!running) return;
    try {
      if (options.onPoll) {
        await options.onPoll(WIQL_NEW_WORK_ITEMS);
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, intervalMs);

  return {
    stop: () => {
      running = false;
      clearInterval(timer);
    },
  };
}
```

**Application to Phase 2:**
- `checkPlanCheckpointTimeouts()` queries SQLite for `pending_human_input` checkpoints.
- Elapsed >= 24h & `remindedAt IS NULL`: posts reminder comment, updates `remindedAt`.
- Elapsed >= 72h & `escalatedAt IS NULL`: posts escalation comment, updates ADO state to `Blocked`, sets status to `blocked`.
- Export `startWatchdog(intervalMs)` returning `{ stop: () => void }`.

---

### 9. `src/ado/work-item.ts` (service, JSON patch extensions)

**Analog:** `src/ado/work-item.ts`

**JSON Patch Document Pattern** (`src/ado/work-item.ts`, lines 13-36):
```typescript
export function buildReadyToDevPatch(htmlComment: string): JsonPatchDocument {
  return [
    {
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Ready to Dev',
    },
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: htmlComment,
    },
  ];
}
```

**Application to Phase 2:**
Add helper functions:
- `buildTagPatch(currentTags: string | undefined, tagToAdd: string, tagToRemove?: string): JsonPatchDocument`
- `buildPlanQuestionPatch(htmlComment: string, currentTags?: string): JsonPatchDocument` (adds `[awaiting-input]` tag + posts comment)
- `buildPlanLockedPatch(htmlComment: string, currentTags?: string): JsonPatchDocument` (removes `[awaiting-input]` tag + posts comment)
- `updateWorkItemTags(workItemId: number, tagToAdd: string, tagToRemove?: string): Promise<WorkItem>`

---

### 10. `src/execute/worker.ts` & `src/execute/router.ts` (controller / worker)

**Analog:** `src/auditor/worker.ts` & `src/ingress/routes.ts`

**Auditor Worker Execution & State Lifecycle Pattern** (`src/auditor/worker.ts`, lines 12-75, 76-94):
```typescript
export async function processWorkItemAudit(
  workItemId: number,
  revId: number
): Promise<void> {
  try {
    const workItem = await getWorkItemDetails(workItemId);
    if (workItem.state !== 'New') {
      db.update(dedupEvents)
        .set({
          status: 'skipped',
          errorMessage: `Ticket state is '${workItem.state}', expected 'New'`,
        })
        .where(
          and(
            eq(dedupEvents.workItemId, workItemId),
            eq(dedupEvents.revId, revId)
          )
        )
        .run();
      return;
    }
    // Execute logic...
    db.update(dedupEvents).set({ status: 'completed' }).where(...).run();
  } catch (err: any) {
    db.update(dedupEvents)
      .set({
        status: 'failed',
        errorMessage: err?.message || String(err),
      })
      .where(...)
      .run();
    throw err;
  }
}
```

**Application to Phase 2:**
`processWorkItemExecute(workItemId: number, revId: number)`:
1. Fetch work item details from ADO.
2. Check if ticket has `[awaiting-input]` tag and non-bot comment (resumption flow).
   - If resuming: incorporate comment into answers, lock plan, remove `[awaiting-input]` tag, update SQLite `plan_checkpoints` to `locked`.
3. If fresh `In Dev` ticket:
   - Create worktree `.worktrees/ticket-{id}-{slug}`.
   - Resolve tags and mount dynamic MCP tools.
   - Run planning agent.
   - If ambiguities: post `[Plan Q&A]` comment, add `[awaiting-input]` tag, insert `plan_checkpoints` (`pending_human_input`), release worktree immediately (`cleanupWorktree`).
   - If no ambiguities: post `[Plan Checkpoint] Implementation Plan Locked` comment, insert `plan_checkpoints` (`locked`).
4. In `src/execute/router.ts`:
   - Inspect event: if `System.State` is `New`, dispatch to `processWorkItemAudit`.
   - If `System.State` is `In Dev`, dispatch to `processWorkItemExecute`.

---

### 11. Test Patterns (`tests/worktree.test.ts`, `tests/runner.test.ts`, `tests/plan-checkpoint.test.ts`)

**Analog:** `tests/worker.test.ts` & `tests/ado-client.test.ts`

**Mock WIT API & DB Reset Pattern** (`tests/worker.test.ts`, lines 14-38):
```typescript
beforeEach(() => {
  sqlite.exec('DELETE FROM dedup_events; DELETE FROM audit_log;');
  adoClient.setWorkItemTrackingApi(null);
});

const mockWitApi = {
  getWorkItem: vi.fn().mockResolvedValue({
    id: workItemId,
    rev: revId,
    fields: { ... },
  }),
  updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
};
adoClient.setWorkItemTrackingApi(mockWitApi as any);
```

**Application to Phase 2:**
- Add `DELETE FROM plan_checkpoints;` to test cleanups.
- Mock `git` commands or test with temporary test repos.
- Mock `execa` or execute benign system binaries (`echo`, `node -e`).

---

## Shared Patterns

### Bot Shield & Loop Detection
**Source:** `src/ingress/bot-shield.ts` lines 1-17  
**Apply to:** Ingress webhook router, discussion comment resumption, comment formatters  
```typescript
// All posted comments MUST append this marker:
const marker = '<!-- [automated-agent] -->';

// Guard in bot-shield.ts drops echoes:
if (input.historyComment && input.historyComment.includes('[automated-agent]')) {
  return { isEcho: true, reason: 'History comment contains [automated-agent] marker' };
}
```

### Comment Formatting & HTML Sanitization
**Source:** `src/ado/formatter.ts` lines 34-44  
**Apply to:** `src/plan/formatter.ts`  
```typescript
const rawHtml = marked.parse(md) as string;
const sanitized = sanitizeHtml(rawHtml, {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3']),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['src', 'alt', 'title'],
  },
});
return `${sanitized.trim()}\n<!-- [automated-agent] -->`;
```

### ADO Client Retry & Rate Limit Handling
**Source:** `src/ado/client.ts` lines 7-58  
**Apply to:** All ADO updates in `src/execute/worker.ts`, `src/plan/watchdog.ts`, `src/ado/work-item.ts`  
```typescript
// withRetry wraps all getWorkItem and updateWorkItem calls:
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelayMs = 1000): Promise<T>
```

### Ponytail Simplification Ceiling Convention
**Source:** `src/config/env.ts`, `src/ado/client.ts`, `src/auditor/evaluator.ts`  
**Apply to:** All new Phase 2 modules  
```typescript
// Mark deliberate v1 simplifications with ceiling and v2 upgrade path:
// ponytail: local worktree isolation; add remote container pool for multi-tenant cloud runners in v2
// ponytail: in-process MCP tools; split into standalone microservices if shared across distributed runners in v2
```

---

## No Analog Found

All 27 files have close architectural analogs in the existing Phase 1 codebase:

| File | Closest Match | Reason / Integration Strategy |
|---|---|---|
| None | All files mapped to Phase 1 analogs | Process runner maps to `ado/client.ts` (retry/timeout), worktree maps to `db/index.ts` (filesystem/native) + `ado/work-item.ts` (state operations), MCP server maps to in-process service registry. |

---

## Metadata

**Analog search scope:** `src/`, `tests/`  
**Files scanned:** 22 source files + 6 test files  
**Pattern extraction date:** 2026-09-08
