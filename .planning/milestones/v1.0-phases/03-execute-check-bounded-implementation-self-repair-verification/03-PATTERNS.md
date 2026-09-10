# Phase 3: EXECUTE + CHECK — Bounded Implementation & Self-Repair Verification - Pattern Map

**Mapped:** 2026-09-08  
**Files analyzed:** 15 (11 new, 4 modified)  
**Analogs found:** 15 / 15 (100% codebase coverage)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/execute/diff-guard.ts` | utility | CLI / file-I/O | `src/sandbox/worktree.ts` | exact |
| `src/execute/coder.ts` | service | request-response | `src/plan/planner.ts` | exact |
| `src/execute/repair.ts` | service | loop / event-driven | `src/execute/worker.ts` | role-match |
| `src/test-runner/executor.ts` | service | subprocess / request-response | `src/sandbox/runner.ts` | exact |
| `src/test-runner/parser.ts` | utility | transform | `src/sandbox/runner.ts` | role-match |
| `src/test-runner/immutability.ts` | utility | CLI / file-I/O | `src/sandbox/worktree.ts` | exact |
| `src/test-runner/evidence.ts` | service | CRUD / transform | `src/plan/formatter.ts` | exact |
| `src/db/schema.ts` | model | CRUD | `src/db/schema.ts` | exact |
| `src/db/index.ts` | config | CRUD | `src/db/index.ts` | exact |
| `src/ado/work-item.ts` | service | request-response | `src/ado/work-item.ts` | exact |
| `src/execute/worker.ts` | worker | pipeline / event-driven | `src/execute/worker.ts` | exact |
| `tests/diff-ceiling.test.ts` | test | request-response | `tests/worktree.test.ts` | exact |
| `tests/test-protection.test.ts` | test | request-response | `tests/worktree.test.ts` | exact |
| `tests/l3-evidence.test.ts` | test | CRUD / request-response | `tests/plan-checkpoint.test.ts` | exact |
| `tests/repair-loop.test.ts` | test | pipeline / request-response | `tests/worker.test.ts` | exact |

---

## Pattern Assignments

### `src/execute/diff-guard.ts` (utility, CLI / file-I/O)

**Analog:** `src/sandbox/worktree.ts` & `src/sandbox/runner.ts`

**Imports pattern** (from `src/sandbox/worktree.ts`, lines 1-5):
```typescript
import { simpleGit, type SimpleGit } from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';
import { normalizePath } from '../utils/paths.js';
```

**Cumulative Git Diff Calculation pattern** (analogous to `src/sandbox/worktree.ts` raw git invocation, lines 75-76, 110):
```typescript
export interface DiffStatResult {
  filesChanged: number;
  insertions: number;
  deletions: number;
  totalLoc: number;
  rawStat: string;
}

export async function calculateCumulativeDiff(
  git: SimpleGit,
  baseCommit: string
): Promise<DiffStatResult> {
  const rawStat = await git.raw(['diff', '--shortstat', baseCommit]);
  const match = rawStat.match(
    /(?:(\d+)\s+files?\s+changed)?(?:,\s*(\d+)\s+insertions?\(\+\))?(?:,\s*(\d+)\s+deletions?\(-\))?/
  );

  const filesChanged = match?.[1] ? parseInt(match[1], 10) : 0;
  const insertions = match?.[2] ? parseInt(match[2], 10) : 0;
  const deletions = match?.[3] ? parseInt(match[3], 10) : 0;
  const totalLoc = insertions + deletions;

  return { filesChanged, insertions, deletions, totalLoc, rawStat: rawStat.trim() };
}

export async function assertDiffCeiling(
  git: SimpleGit,
  baseCommit: string,
  maxLoc = 250
): Promise<DiffStatResult> {
  const stat = await calculateCumulativeDiff(git, baseCommit);
  if (stat.totalLoc > maxLoc) {
    throw new Error(
      `Diff ceiling exceeded: ${stat.totalLoc} LOC changed (ceiling is <${maxLoc} LOC). Aborting implementation.`
    );
  }
  return stat;
}
```

**Dependency Guard Pattern** (manifest parsing and comparison):
```typescript
export function verifyPackageDependencies(
  originalPkgJson: string,
  updatedPkgJson: string,
  ticketAcceptanceCriteria: string,
  allowlist: string[] = []
): { valid: boolean; unauthorizedPackages: string[] } {
  const original = JSON.parse(originalPkgJson || '{}');
  const updated = JSON.parse(updatedPkgJson || '{}');

  const origDeps = { ...original.dependencies, ...original.devDependencies };
  const newDeps = { ...updated.dependencies, ...updated.devDependencies };

  const unauthorizedPackages: string[] = [];
  const acLower = ticketAcceptanceCriteria.toLowerCase();

  for (const pkg of Object.keys(newDeps)) {
    if (!origDeps[pkg]) {
      const isAllowedByAc = acLower.includes(pkg.toLowerCase());
      const isAllowlisted = allowlist.includes(pkg);
      if (!isAllowedByAc && !isAllowlisted) {
        unauthorizedPackages.push(pkg);
      }
    }
  }

  return {
    valid: unauthorizedPackages.length === 0,
    unauthorizedPackages,
  };
}
```

---

### `src/execute/coder.ts` (service, request-response)

**Analog:** `src/plan/planner.ts`

**Imports pattern** (from `src/plan/planner.ts`, lines 1-4):
```typescript
import { generateText, tool, stepCount } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { normalizePath } from '../utils/paths.js';
```

**Offline test bypass pattern** (from `src/plan/planner.ts`, lines 21-47):
```typescript
// ponytail: deterministic offline coder fallback in test env; enable live model in staging
if (env.NODE_ENV === 'test' && !opts?.forceAi) {
  // Return deterministic file modification results for mock tests
  return mockExecution();
}
```

**Bounded File Tools pattern** (Vercel AI SDK tools):
```typescript
export function createCoderTools(worktreePath: string) {
  return {
    createFile: tool({
      description: 'Create a new file with specified content in the worktree',
      parameters: z.object({
        relativePath: z.string().describe('Relative path inside worktree'),
        content: z.string().describe('UTF-8 file content'),
      }),
      execute: async ({ relativePath, content }) => {
        const fullPath = path.resolve(worktreePath, relativePath);
        if (!fullPath.startsWith(path.resolve(worktreePath))) {
          throw new Error(`Path traversal denied: ${relativePath}`);
        }
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf8');
        return { success: true, path: normalizePath(relativePath) };
      },
    }),
    editFile: tool({
      description: 'Update content of an existing file in the worktree',
      parameters: z.object({
        relativePath: z.string().describe('Relative path inside worktree'),
        content: z.string().describe('New content to write'),
      }),
      execute: async ({ relativePath, content }) => {
        const fullPath = path.resolve(worktreePath, relativePath);
        if (!fullPath.startsWith(path.resolve(worktreePath))) {
          throw new Error(`Path traversal denied: ${relativePath}`);
        }
        if (!fs.existsSync(fullPath)) {
          throw new Error(`File does not exist: ${relativePath}`);
        }
        fs.writeFileSync(fullPath, content, 'utf8');
        return { success: true, path: normalizePath(relativePath) };
      },
    }),
    deleteFile: tool({
      description: 'Delete a file in the worktree',
      parameters: z.object({
        relativePath: z.string().describe('Relative path inside worktree'),
      }),
      execute: async ({ relativePath }) => {
        const fullPath = path.resolve(worktreePath, relativePath);
        if (!fullPath.startsWith(path.resolve(worktreePath))) {
          throw new Error(`Path traversal denied: ${relativePath}`);
        }
        if (fs.existsSync(fullPath)) {
          fs.rmSync(fullPath, { force: true });
        }
        return { success: true, path: normalizePath(relativePath) };
      },
    }),
  };
}
```

**Conventional Commit with Work Item Trailer** (git commit execution):
```typescript
export async function commitImplementation(
  git: SimpleGit,
  workItemId: number,
  type: 'feat' | 'fix',
  message: string
): Promise<string> {
  const commitMessage = `${type}(#${workItemId}): ${message}\n\nAB#${workItemId}`;
  await git.add('.');
  const commitResult = await git.commit(commitMessage);
  return commitResult.commit;
}
```

---

### `src/test-runner/executor.ts` (service, subprocess / request-response)

**Analog:** `src/sandbox/runner.ts`

**Imports pattern** (from `src/sandbox/runner.ts`, lines 1-3):
```typescript
import { runCommand } from '../sandbox/runner.js';
import type { CommandResult } from '../sandbox/types.js';
```

**Sandboxed Subprocess Execution pattern** (from `src/sandbox/runner.ts`, lines 84-126):
```typescript
export interface TestRunResult {
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export async function runLocalTests(
  worktreePath: string,
  testCommand = 'npm',
  testArgs = ['test'],
  knownSecrets: string[] = []
): Promise<TestRunResult> {
  const start = Date.now();
  const result: CommandResult = await runCommand(
    testCommand,
    testArgs,
    {
      cwd: worktreePath,
      timeoutMs: 120_000,
    },
    knownSecrets
  );

  return {
    passed: result.exitCode === 0 && !result.timedOut,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
    durationMs: Date.now() - start,
  };
}
```

---

### `src/test-runner/parser.ts` (utility, transform)

**Analog:** `src/sandbox/runner.ts` (regex pattern scrubbing, lines 6-8, 45-62)

**Pruning and Vitest Parsing pattern**:
```typescript
export interface PrunedDiagnostics {
  failingTests: string[];
  assertionErrors: string[];
  prunedStackTrace: string[];
  summary: string;
}

export interface ParsedVitestOutput {
  totalTests: number;
  passed: number;
  failed: number;
  durationMs: number;
}

export function parseVitestSummary(stdout: string, fallbackDurationMs = 0): ParsedVitestOutput {
  // Match: Tests  2 passed | 1 failed (3)
  const passMatch = stdout.match(/(\d+)\s+passed/);
  const failMatch = stdout.match(/(\d+)\s+failed/);
  const totalMatch = stdout.match(/Tests\s+.*\((\d+)\)/);

  const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
  const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
  const totalTests = totalMatch ? parseInt(totalMatch[1], 10) : passed + failed;

  return {
    totalTests,
    passed,
    failed,
    durationMs: fallbackDurationMs,
  };
}

export function pruneTestDiagnostics(stdout: string, stderr: string): PrunedDiagnostics {
  const combined = `${stdout}\n${stderr}`;
  const lines = combined.split('\n');

  const failingTests: string[] = [];
  const assertionErrors: string[] = [];
  const rawFrames: string[] = [];

  for (const line of lines) {
    if (/FAIL\s+([^\n>]+)/.test(line)) {
      failingTests.push(line.trim());
    } else if (/(?:AssertionError|Error|TypeError|ReferenceError):\s*([^\n]+)/.test(line)) {
      assertionErrors.push(line.trim());
    } else if (/^\s*(?:at|❯)\s+(.*)/.test(line)) {
      if (!line.includes('node_modules') && !line.includes('node:internal')) {
        rawFrames.push(line.trim());
      }
    }
  }

  const prunedStackTrace = rawFrames.slice(0, 15);
  return {
    failingTests: Array.from(new Set(failingTests)),
    assertionErrors: Array.from(new Set(assertionErrors)).slice(0, 5),
    prunedStackTrace,
    summary: `${failingTests.length} tests failed`,
  };
}
```

---

### `src/test-runner/immutability.ts` (utility, CLI / file-I/O)

**Analog:** `src/sandbox/worktree.ts` (test scanning regex & normalized path handling, lines 13-41)

**Test Immutability and Assertion Presence pattern**:
```typescript
import { normalizePath } from '../utils/paths.js';

export interface TestImmutabilityResult {
  valid: boolean;
  violations: string[];
  newTestFiles: string[];
}

export function checkTestImmutability(
  nameStatusDiff: string,
  initialProtectedFiles: string[]
): TestImmutabilityResult {
  const normalizedInitial = new Set(
    initialProtectedFiles.map((p) => normalizePath(p).toLowerCase())
  );
  const violations: string[] = [];
  const newTestFiles: string[] = [];

  const lines = nameStatusDiff.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const [status, rawPath] = line.split(/\s+/);
    if (!rawPath) continue;
    const normalized = normalizePath(rawPath).toLowerCase();

    const isBaseline = Array.from(normalizedInitial).some((init) => init.endsWith(normalized));

    if (isBaseline) {
      if (status.startsWith('M') || status.startsWith('D') || status.startsWith('R')) {
        violations.push(`Modified protected baseline test: [${status}] ${rawPath}`);
      }
    } else if (/\.(test|spec)\.(ts|js|tsx|jsx)$/i.test(rawPath)) {
      if (status.startsWith('A')) {
        newTestFiles.push(rawPath);
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    newTestFiles,
  };
}

export function hasValidAssertions(content: string): boolean {
  return /\b(expect|assert)\s*\(|assert\.[a-zA-Z]+/i.test(content);
}
```

---

### `src/execute/repair.ts` (service, loop / event-driven)

**Analog:** `src/execute/worker.ts` & `src/plan/planner.ts`

**Self-Repair Loop with WIP Branch Fallback pattern**:
```typescript
import { SimpleGit } from 'simple-git';
import { runLocalTests } from '../test-runner/executor.js';
import { pruneTestDiagnostics } from '../test-runner/parser.js';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { env } from '../config/env.js';

export interface RepairLoopOptions {
  worktreePath: string;
  git: SimpleGit;
  workItemId: number;
  maxCycles?: number;
  knownSecrets?: string[];
}

export interface RepairLoopResult {
  success: boolean;
  cyclesUsed: number;
  wipBranch?: string;
  diagnostics?: string;
}

export async function executeRepairLoop(options: RepairLoopOptions): Promise<RepairLoopResult> {
  const maxCycles = options.maxCycles ?? 3;
  let cycle = 0;
  let lastStderr = '';
  let lastStdout = '';

  while (cycle < maxCycles) {
    const testResult = await runLocalTests(
      options.worktreePath,
      'npm',
      ['test'],
      options.knownSecrets
    );

    if (testResult.passed) {
      return { success: true, cyclesUsed: cycle };
    }

    lastStdout = testResult.stdout;
    lastStderr = testResult.stderr;
    cycle++;

    if (cycle >= maxCycles) {
      break;
    }

    const diagnostics = pruneTestDiagnostics(lastStdout, lastStderr);

    // ponytail: mock deterministic repair in test env; live LLM repair in staging
    if (env.NODE_ENV === 'test') {
      // Simulate repair attempt
      continue;
    }

    // Call LLM coder with pruned diagnostics to attempt fix
    // ...
  }

  // Budget exhausted: push WIP branch and keep changes for human dev
  const wipBranch = `wip/ticket-${options.workItemId}`;
  try {
    await options.git.checkoutLocalBranch(wipBranch);
    await options.git.add('.');
    await options.git.commit(`wip: repair budget exhausted for ticket ${options.workItemId}\n\nAB#${options.workItemId}`);
  } catch {
    // Ignore commit error if worktree clean
  }

  const pruned = pruneTestDiagnostics(lastStdout, lastStderr);
  return {
    success: false,
    cyclesUsed: cycle,
    wipBranch,
    diagnostics: `${pruned.summary}\n${pruned.assertionErrors.join('\n')}\n${pruned.prunedStackTrace.join('\n')}`,
  };
}
```

---

### `src/test-runner/evidence.ts` (service, CRUD / transform)

**Analog:** `src/plan/formatter.ts` & `src/plan/checkpoint.ts` & `src/ado/work-item.ts`

**Imports pattern**:
```typescript
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { db } from '../db/index.js';
import { l3Evidence, type InsertL3Evidence } from '../db/schema.js';
import { buildTagPatch } from '../ado/work-item.js';
import { Operation, JsonPatchDocument } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
```

**Markdown/HTML Badge Formatting pattern** (from `src/plan/formatter.ts`, lines 17-26):
```typescript
export function formatL3EvidenceComment(evidence: {
  testSuite: string;
  totalTests: number;
  passed: number;
  failed: number;
  durationMs: number;
  gitDiffStat: string;
  coverageSummary?: string;
}): string {
  const md = `### [L3 Evidence] Functional Verification: PASSED

**Test Execution Metrics:**
* **Suite:** \`${evidence.testSuite}\`
* **Total Tests:** ${evidence.totalTests}
* **Passed:** ${evidence.passed}
* **Failed:** ${evidence.failed}
* **Duration:** ${evidence.durationMs}ms
* **Git Diff:** \`${evidence.gitDiffStat}\`
${evidence.coverageSummary ? `* **Coverage:** ${evidence.coverageSummary}` : ''}

*All unit tests executed and passed within isolated worktree sandbox.*
`;

  const rawHtml = marked.parse(md) as string;
  const sanitized = sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'title'],
    },
  });

  return `${sanitized.trim()}\n<!-- [automated-agent] -->`;
}
```

**Persistence & State Transition pattern** (from `src/ado/work-item.ts`, lines 49-62):
```typescript
export async function recordL3Evidence(data: InsertL3Evidence): Promise<void> {
  db.insert(l3Evidence).values(data).run();
}

export function buildDevDonePatch(
  htmlComment: string,
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(currentTags, '[l3-verified]');
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

export function buildRepairExhaustedPatch(
  htmlComment: string,
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(currentTags, '[repair-exhausted]', '[l3-verified]');
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
      value: htmlComment,
    },
  ] as unknown as JsonPatchDocument;
}

export function buildContractConflictPatch(
  htmlComment: string,
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(currentTags, '[contract-conflict]');
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
      value: htmlComment,
    },
  ] as unknown as JsonPatchDocument;
}
```

---

### `src/db/schema.ts` (model, CRUD)

**Analog:** Existing `planCheckpoints` & `auditLogs` in `src/db/schema.ts` (lines 18-60)

**Schema Definition pattern**:
```typescript
export const l3Evidence = sqliteTable(
  'l3_evidence',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workItemId: integer('work_item_id').notNull(),
    revId: integer('rev_id').notNull(),
    testSuite: text('test_suite').notNull(),
    totalTests: integer('total_tests').notNull(),
    passed: integer('passed').notNull(),
    failed: integer('failed').notNull(),
    durationMs: integer('duration_ms').notNull(),
    coverageSummary: text('coverage_summary'),
    gitDiffStat: text('git_diff_stat').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_l3_evidence_lookup').on(table.workItemId, table.revId),
  ]
);

export type L3Evidence = typeof l3Evidence.$inferSelect;
export type InsertL3Evidence = typeof l3Evidence.$inferInsert;
```

---

### `src/db/index.ts` (config, CRUD)

**Analog:** Existing `sqlite.exec` DDL table creation in `src/db/index.ts` (lines 22-62)

**Table Creation pattern**:
```typescript
sqlite.exec(`
CREATE TABLE IF NOT EXISTS l3_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id INTEGER NOT NULL,
  rev_id INTEGER NOT NULL,
  test_suite TEXT NOT NULL,
  total_tests INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  coverage_summary TEXT,
  git_diff_stat TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_l3_evidence_lookup ON l3_evidence(work_item_id, rev_id);
`);
```

---

### `src/ado/work-item.ts` (service, request-response)

**Analog:** Existing `transitionToReadyToDev` and `buildTagPatch` in `src/ado/work-item.ts` (lines 19-47, 134-140)

**Transition to Dev Done and Blocked patterns**:
```typescript
export async function transitionToDevDone(
  workItemId: number,
  htmlComment: string
): Promise<any> {
  const details = await getWorkItemDetails(workItemId);
  const patchDoc = buildDevDonePatch(htmlComment, details.tags);
  return adoClient.updateWorkItem(workItemId, patchDoc);
}

export async function flagTicketBlocked(
  workItemId: number,
  htmlComment: string,
  type: 'contract-conflict' | 'repair-exhausted'
): Promise<any> {
  const details = await getWorkItemDetails(workItemId);
  const patchDoc =
    type === 'contract-conflict'
      ? buildContractConflictPatch(htmlComment, details.tags)
      : buildRepairExhaustedPatch(htmlComment, details.tags);
  return adoClient.updateWorkItem(workItemId, patchDoc);
}
```

---

### `src/execute/worker.ts` (worker, pipeline / event-driven)

**Analog:** Existing `src/execute/worker.ts` (lines 102-225) & `src/auditor/worker.ts` (lines 12-74)

**Implementation and Verification Pipeline pattern**:
```typescript
// After plan is locked or for active ticket in 'In Dev':
// 1. Check diff ceiling (<250 LOC)
// 2. Verify package dependencies
// 3. Verify test assertion immutability (0 modified/deleted baseline tests)
// 4. Verify new test assertions (expect/assert present)
// 5. Run tests -> If failed, run executeRepairLoop
// 6. If pass -> Record L3 evidence -> Transition to 'Dev Done' with [l3-verified]
// 7. If fail -> Flag 'Blocked' with [repair-exhausted] or [contract-conflict]
```

---

### `tests/diff-ceiling.test.ts` (test, request-response)

**Analog:** `tests/worktree.test.ts` (lines 33-80)

**Setup and assertions pattern**:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { simpleGit } from 'simple-git';
import {
  calculateCumulativeDiff,
  assertDiffCeiling,
  verifyPackageDependencies,
} from '../src/execute/diff-guard.js';

describe('Diff Ceiling and Dependency Guard', () => {
  let tempRepo: string;

  beforeEach(async () => {
    tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-guard-test-'));
    const git = simpleGit(tempRepo);
    await git.init();
    await git.addConfig('user.name', 'Tester');
    await git.addConfig('user.email', 'tester@example.com');
    fs.writeFileSync(path.join(tempRepo, 'index.ts'), 'console.log("init");\n');
    await git.add('.');
    await git.commit('Initial');
  });

  afterEach(() => {
    fs.rmSync(tempRepo, { recursive: true, force: true });
  });

  it('calculates cumulative diff and rejects changes exceeding 250 LOC', async () => {
    const git = simpleGit(tempRepo);
    const baseCommit = (await git.revparse(['HEAD'])).trim();

    // Add 260 lines
    const bigFile = Array.from({ length: 260 }, (_, i) => `line ${i}`).join('\n');
    fs.writeFileSync(path.join(tempRepo, 'big.ts'), bigFile);

    const stat = await calculateCumulativeDiff(git, baseCommit);
    expect(stat.totalLoc).toBe(260);

    await expect(assertDiffCeiling(git, baseCommit, 250)).rejects.toThrow(/Diff ceiling exceeded/);
  });

  it('guards package dependencies against unapproved additions', () => {
    const original = JSON.stringify({ dependencies: { express: '^4.0.0' } });
    const updated = JSON.stringify({
      dependencies: { express: '^4.0.0', lodash: '^4.17.21' },
    });

    const result = verifyPackageDependencies(original, updated, 'Add user endpoint');
    expect(result.valid).toBe(false);
    expect(result.unauthorizedPackages).toContain('lodash');
  });
});
```

---

### `tests/test-protection.test.ts` (test, request-response)

**Analog:** `tests/worktree.test.ts` (lines 82-111)

**Immutability and assertion validation pattern**:
```typescript
import { describe, it, expect } from 'vitest';
import {
  checkTestImmutability,
  hasValidAssertions,
} from '../src/test-runner/immutability.js';

describe('Test Immutability and Assertion Presence', () => {
  it('detects and flags modification or deletion of baseline test files', () => {
    const baseline = ['tests/auth.test.ts', 'tests/order.spec.ts'];
    const diff = `M\ttests/auth.test.ts\nA\tsrc/auth.ts`;

    const result = checkTestImmutability(diff, baseline);
    expect(result.valid).toBe(false);
    expect(result.violations[0]).toContain('tests/auth.test.ts');
  });

  it('permits new test files if valid assertions are present', () => {
    const baseline = ['tests/auth.test.ts'];
    const diff = `A\ttests/payment.test.ts\nM\tsrc/payment.ts`;

    const result = checkTestImmutability(diff, baseline);
    expect(result.valid).toBe(true);
    expect(result.newTestFiles).toContain('tests/payment.test.ts');

    expect(hasValidAssertions('test("works", () => { expect(true).toBe(true); });')).toBe(true);
    expect(hasValidAssertions('test("empty", () => {});')).toBe(false);
  });
});
```

---

### `tests/l3-evidence.test.ts` (test, CRUD / request-response)

**Analog:** `tests/plan-checkpoint.test.ts` & `tests/runner.test.ts`

**L3 Evidence persistence and badge formatting pattern**:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { db, sqlite } from '../src/db/index.js';
import { l3Evidence } from '../src/db/schema.js';
import {
  formatL3EvidenceComment,
  recordL3Evidence,
  buildDevDonePatch,
} from '../src/test-runner/evidence.js';
import { parseVitestSummary } from '../src/test-runner/parser.js';

describe('L3 Evidence Capture & ADO Transition', () => {
  beforeEach(() => {
    sqlite.exec('DELETE FROM l3_evidence;');
  });

  it('persists structured evidence to SQLite and formats HTML badge', async () => {
    await recordL3Evidence({
      workItemId: 5001,
      revId: 1,
      testSuite: 'vitest',
      totalTests: 12,
      passed: 12,
      failed: 0,
      durationMs: 450,
      gitDiffStat: '2 files changed, 45 insertions(+)',
    });

    const rows = db.select().from(l3Evidence).all();
    expect(rows.length).toBe(1);
    expect(rows[0].workItemId).toBe(5001);
    expect(rows[0].passed).toBe(12);

    const comment = formatL3EvidenceComment(rows[0]);
    expect(comment).toContain('[L3 Evidence] Functional Verification: PASSED');
    expect(comment).toContain('<!-- [automated-agent] -->');
  });

  it('builds valid ADO patch for Dev Done with [l3-verified] tag', () => {
    const patch = buildDevDonePatch('<div>Comment</div>', 'backend; [awaiting-input]');
    const stateOp = patch.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp?.value).toBe('Dev Done');

    const tagOp = patch.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp?.value).toContain('[l3-verified]');
  });
});
```

---

### `tests/repair-loop.test.ts` (test, pipeline / request-response)

**Analog:** `tests/worker.test.ts` & `tests/runner.test.ts`

**Self-repair capping and WIP fallback pattern**:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { simpleGit } from 'simple-git';
import { executeRepairLoop } from '../src/execute/repair.js';

describe('Self-Repair Loop & Budget Exhaustion', () => {
  let tempRepo: string;

  beforeEach(async () => {
    tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-loop-test-'));
    const git = simpleGit(tempRepo);
    await git.init();
    await git.addConfig('user.name', 'Tester');
    await git.addConfig('user.email', 'tester@example.com');
    fs.writeFileSync(path.join(tempRepo, 'package.json'), '{"name":"mock"}');
    await git.add('.');
    await git.commit('Initial');
  });

  afterEach(() => {
    fs.rmSync(tempRepo, { recursive: true, force: true });
  });

  it('caps iterations at maxCycles and pushes WIP branch on exhaustion', async () => {
    const git = simpleGit(tempRepo);
    const result = await executeRepairLoop({
      worktreePath: tempRepo,
      git,
      workItemId: 6001,
      maxCycles: 2,
    });

    expect(result.success).toBe(false);
    expect(result.cyclesUsed).toBe(2);
    expect(result.wipBranch).toBe('wip/ticket-6001');

    const branches = await git.branchLocal();
    expect(branches.all).toContain('wip/ticket-6001');
  });
});
```

---

## Shared Patterns

### 1. Secret Sanitization and Process Isolation
**Source:** `src/sandbox/runner.ts` (lines 15-40, 45-62, 84-126)  
**Apply to:** `src/test-runner/executor.ts`, `src/execute/repair.ts`, and `src/execute/coder.ts`
```typescript
// Subprocess execution must never inherit untrusted process.env or leak secrets
const safeEnv = sanitizeEnv(options.env);
const result = await execa(file, args, {
  cwd: options.cwd,
  shell: false,
  timeout: timeoutMs,
  killSignal: 'SIGTERM',
  forceKillAfterDelay: 2000,
  env: safeEnv,
  extendEnv: false,
});
```

### 2. Markdown Parsing and HTML Sanitization with Bot Comment Marker
**Source:** `src/plan/formatter.ts` (lines 17-26)  
**Apply to:** `src/test-runner/evidence.ts`
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

### 3. Tag Manipulation and ADO JSON Patch Construction
**Source:** `src/ado/work-item.ts` (lines 19-47)  
**Apply to:** `src/ado/work-item.ts`, `src/test-runner/evidence.ts`, and `src/execute/worker.ts`
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
  if (tagToAdd && !updated.includes(tagToAdd)) updated.push(tagToAdd);
  if (tagToRemove) updated = updated.filter((t) => t !== tagToRemove);
  const tagValue = updated.join('; ');
  return [
    {
      op: currentTags !== undefined ? Operation.Replace : Operation.Add,
      path: '/fields/System.Tags',
      value: tagValue,
    },
  ] as unknown as JsonPatchOperation[] & JsonPatchDocument;
}
```

### 4. Drizzle SQLite WAL Database Persistence
**Source:** `src/db/index.ts` (lines 17-64) & `src/plan/checkpoint.ts` (lines 14-34)  
**Apply to:** `src/db/schema.ts`, `src/db/index.ts`, `src/test-runner/evidence.ts`
```typescript
// Embedded SQLite in WAL mode; microsecond transactional writes
export const db = drizzle(sqlite, { schema });
db.insert(l3Evidence).values(data).run();
```

### 5. Ponytail Technical Debt Comments
**Source:** `src/sandbox/worktree.ts` (line 7), `src/sandbox/runner.ts` (line 4), `src/plan/planner.ts` (line 21), `src/plan/formatter.ts` (line 59)  
**Apply to:** All newly created service and runner files
```typescript
// ponytail: [single-tenant / local feature]; [upgrade path for multi-tenant cloud runner in v2]
```

---

## No Analog Found

None. All 15 files have direct, verified architectural analogs in the existing Phase 1 and Phase 2 codebase.

---

## Metadata

**Analog search scope:** `src/`, `tests/`  
**Files scanned:** 25  
**Pattern extraction date:** 2026-09-08
