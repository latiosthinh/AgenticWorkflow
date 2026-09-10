# Phase 3: EXECUTE + CHECK — Bounded Implementation & Self-Repair Verification - Research

**Researched:** 2026-09-08  
**Domain:** Autonomous Multi-File Code Generation, Git Diff Ceilings, Test Immutability Guardrails, Subprocess Test Execution, Self-Repair Loops, L3 Evidence Schema  
**Confidence:** HIGH  

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Code Editing & Diff Ceiling (<250 LOC)
- Diff ceiling: compute cumulative `git diff --shortstat` before each commit; abort and flag if additions+deletions exceed 250 LOC.
- Multi-file editing: structured tools (`editFile`, `createFile`, `deleteFile`) powered by Vercel AI SDK and TypeScript file operations in the worktree.
- Dependency guard: only allow package additions (`package.json`) if explicitly listed in ticket acceptance criteria or pre-approved allowlist.
- Commit convention: Conventional Commits (`feat(...)`, `fix(...)`) with work item link trailer `AB#<id>`.

#### Test Protection & Tamper Resistance
- Baseline test immutability: pre-PR diff check enforces 0 modifications or deletions of existing test files (`tests/**`, `*.test.*`).
- New test creation: agent is permitted to create new test files for newly implemented features.
- Assertion presence: new test files must contain valid assertion statements (`expect(...)` or `assert(...)`) to prevent empty test hacking.
- Contract conflict: if existing tests fail due to intentional requirements shift, flag ticket blocked with `[Contract Conflict]` comment and require human intervention.

#### Self-Repair Loop & Failure Diagnostics
- Repair iterations: capped at 3 attempts (configurable up to 5 via `MAX_REPAIR_CYCLES`).
- Diagnostic context: feed pruned test failure output (failing test name, assertion failure message, top 15 application stack trace frames) into the repair prompt.
- Exhaustion handling: on budget exhaustion, push WIP branch `wip/ticket-{id}`, post `[Repair Exhausted]` comment with diagnostics, and flag ticket blocked.

#### L3 Evidence Capture & "Dev Done" Transition
- Evidence schema: structured JSON record (`testSuite`, `totalTests`, `passed`, `failed`, `durationMs`, `coverageSummary`, `gitDiffStat`).
- Persistence: store in SQLite `l3_evidence` table and post formatted HTML comment with `[L3 Evidence]` badge to ADO discussion.
- State transition: patch `System.State` from `In Dev` to `Dev Done` via ADO JSON Patch API.
- Tags: add `[l3-verified]`, retain domain tags (`frontend`, `backend`, `infra`).

### the agent's Discretion
- Exact system prompt phrasing for the coder/repair agent.
- Regex rules for stack trace pruning and Vitest output extraction.

### Deferred Ideas (OUT OF SCOPE)
- Parallel test execution across multiple runners (v2 — single worktree runner for v1).
- Flaky test automated re-try during local unit testing (handled in Phase 6 staging QA gate).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IMPL-01 | Agent executes bounded implementation modifying source files within a maximum diff budget of <250 LOC. | Structured Vercel AI SDK tools (`createFile`, `editFile`, `deleteFile`), cumulative `git diff --shortstat` calculation before commits, dependency guard checking `package.json` modifications against ticket AC. |
| IMPL-02 | System enforces read-only permissions on existing test assertion files and rejects PRs containing test-file modifications. | Git pre-PR diff check via `git diff --name-status` against base commit asserting 0 modified/deleted baseline test files; assertion validator checking new test files for `expect`/`assert`; contract conflict handler triggering `[Contract Conflict]` block. |
| TEST-01 | Agent executes local unit tests against modified code and generates structured test execution reports (L3 Evidence). | Sanitized subprocess execution via `runner.ts` (`execa`), Vitest output extraction, SQLite `l3_evidence` persistence schema, formatted HTML comment generation with `[L3 Evidence]` badge, and ADO state transition to `Dev Done`. |
| TEST-02 | Agent detects test failures and enters an automated self-repair loop (max 3-5 iterations) using failure traces; budget exhaustion posts diagnostics and flags ticket blocked. | Iterative repair loop bounded by `MAX_REPAIR_CYCLES`, stack trace pruning to top 15 application frames (stripping `node_modules`), WIP branch push (`wip/ticket-{id}`), and ADO `[Repair Exhausted]` diagnostic comment. |
</phase_requirements>

## Project Constraints (from AGENTS.md / CLAUDE.md)

- **Tech Stack**: Node.js 24 LTS (`v24.0.2` [VERIFIED: host environment]) and TypeScript 7 (`v7.0.2` [VERIFIED: package.json]). Fastify 5 webhook server, SQLite with Drizzle ORM in WAL mode, `p-queue` concurrency lanes.
- **Forbidden Patterns**:
  - Do NOT execute shell strings with `child_process.exec` or `shell: true` [CITED: CLAUDE.md].
  - Do NOT use external brokers (Redis/BullMQ) in v1 [CITED: CLAUDE.md].
  - Do NOT leak ADO PATs, git tokens, or LLM keys into subprocess environments or logs [CITED: CLAUDE.md].
  - Do NOT allow unbounded autonomous loops without human gates [CITED: REQUIREMENTS.md].
- **Coding Conventions**: Terse caveman, drop fluff, exact code blocks, stdlib/native first, shortest diff wins.

---

## Summary

Phase 3 implements the core autonomous coding and verification loop of the Agentic SDLC Workflow. Once Phase 2 locks an implementation plan, the worker executes bounded multi-file code modifications inside an ephemeral git worktree, verifies the changes against local unit tests, automatically attempts self-repair if tests fail (up to 3-5 iterations), and on success compiles structured L3 Functional Evidence, updates the work item tags to `[l3-verified]`, and transitions the ADO ticket from `In Dev` to `Dev Done`.

To prevent developer review fatigue and safeguard system stability, Phase 3 strictly enforces two deterministic guardrails: a hard cumulative diff ceiling (<250 LOC change computed via `git diff --shortstat`) and strict test file immutability. Existing baseline test assertion files (`tests/**`, `*.test.*`) are locked with OS read-only permissions (`0o444`) and verified via `git diff --name-status` prior to commit/PR creation. If an agent attempts to pass tests by deleting or weakening existing assertions, the operation is rejected. If tests fail due to intentional requirements shifts, the system flags a `[Contract Conflict]` and halts for human direction.

When tests fail during implementation, a self-repair agent is invoked with a pruned diagnostic context containing only the failing test names, assertion error messages, and the top 15 application-level stack frames (stripping noisy `node_modules` frames). If the repair loop reaches its cycle budget (default 3 cycles) without passing tests, the runner pushes a WIP branch (`wip/ticket-{id}`), posts a diagnostic comment with `[Repair Exhausted]`, and flags the ticket `Blocked` in ADO Boards to prevent silent failures.

**Primary recommendation:** Implement bounded code generation and self-repair as a structured state machine with strict pre-commit diff checks and regex-based stack trace compaction, persisting execution metrics in SQLite `l3_evidence` before updating ADO work item state to `Dev Done`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Multi-File Editing (`IMPL-01`) | Agent Reasoning / AI SDK | Ephemeral Worktree Disk | LLM issues structured file operations (`createFile`, `editFile`, `deleteFile`); changes are applied to isolated worktree filesystem. |
| Diff Ceiling Guard (`IMPL-01`) | Guardrail / Validator Engine | Git CLI (`simple-git`) | Policy engine queries `git diff --shortstat` to reject changes exceeding 250 LOC before committing. |
| Dependency Guard (`IMPL-01`) | Guardrail / Validator Engine | `package.json` Parser | Inspects manifest diffs to reject hallucinated or unapproved package additions. |
| Test Immutability Check (`IMPL-02`) | Test Integrity Guardrail | Git CLI (`git diff --name-status`) | Verifies 0 modifications or deletions to baseline test assertion files; permits new test additions with valid assertions. |
| Contract Conflict Detection (`IMPL-02`) | Repair Orchestrator | ADO REST Adapter | Detects when existing unmodified tests fail due to requirement changes; flags ticket `Blocked` with `[Contract Conflict]`. |
| Local Test Execution (`TEST-01`) | Execution Sandbox (`runner.ts`) | OS Process Tree (`execa`) | Runs test commands (`npm test`) with 120s timeout, credential scrubbing, and output truncation. |
| Stack Trace Pruning (`TEST-02`) | Diagnostic Extractor | Regex Parser | Filters raw Vitest stderr to extract failing assertions and prune `node_modules` frames to top 15 app lines. |
| Self-Repair Loop (`TEST-02`) | Repair Orchestrator / FSM | Agent Runtime (`ai`) | Governs repair iteration counter (max 3-5); triggers WIP branch push and diagnostic comment on budget exhaustion. |
| L3 Evidence Recording (`TEST-01`) | Persistence Layer (SQLite) | ADO Discussion Formatter | Persists test metrics to SQLite `l3_evidence` and formats HTML comment with `[L3 Evidence]` badge. |
| ADO State Transition (`TEST-01`) | ADO REST Client | ADO Boards (Work Items) | Transitions work item state from `In Dev` to `Dev Done` and adds `[l3-verified]` tag via JSON Patch. |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **ai** | `7.0.93` [VERIFIED: npm registry] | LLM agent loop & tool orchestration | Lean functional agent loop (`generateText`, `tool`), native tool calling, and typed multi-step execution. |
| **@ai-sdk/openai** | `4.0.60` [VERIFIED: npm registry] | Model provider for coding/repair agent | GPT-4o / GPT-4o-mini structured reasoning and code generation. |
| **simple-git** | `3.36.0` [VERIFIED: npm registry] | Git diff calculation, commit & push | Programmatic wrapper for native Git 2.53 (`git diff --shortstat`, `git diff --name-status`, `git commit`). |
| **execa** | `10.0.1` [VERIFIED: npm registry] | Sandboxed subprocess test execution | Subprocess execution with hard 120s timeout, sanitized env, signal traps, and buffer safety. |
| **better-sqlite3** | `13.0.3` [VERIFIED: npm registry] | Persistent storage for L3 evidence | Embedded SQLite in WAL mode; microsecond transactional writes without external daemon. |
| **drizzle-orm** | `0.45.2` [VERIFIED: npm registry] | SQL schema & query builder | Type-safe schema for `l3_evidence` table with compile-time type inference. |
| **azure-devops-node-api** | `17.0.0` [VERIFIED: npm registry] | ADO REST client | Typed updates for work item state (`Dev Done`, `Blocked`), tags (`[l3-verified]`), and discussion comments. |
| **zod** | `4.5.4` [VERIFIED: npm registry] | Schema validation for tool params & evidence | Validates file editing tool inputs, repair options, and L3 evidence payloads. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **marked** | `18.0.11` [VERIFIED: npm registry] | Markdown to HTML renderer | Formats L3 evidence markdown tables into HTML for ADO discussion comments. |
| **sanitize-html** | `2.17.7` [VERIFIED: npm registry] | HTML sanitizer | Strips dangerous script tags from generated discussion comments. |
| **vitest** | `5.0.0` [VERIFIED: npm registry] | Test runner engine | Executes local unit tests inside ephemeral worktree during verification and repair. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `git diff --shortstat` | In-memory line counting (`diff` npm pkg) | In-memory counting misses git CRLF normalizations, whitespace flags, and untracked files; native git CLI is exact. |
| OS `0o444` + Git diff check | Container read-only mounts | Read-only mounts require container daemon overhead; OS chmod + pre-PR git diff check provides dual-layer protection on host runner. |
| Regex stack trace pruning | AST/source-map parser (`stacktrace-parser`) | Overkill for error formatting; regex effectively filters `node_modules` and extracts top 15 application frames with zero runtime overhead. |

**Installation:**
```bash
npm install ai@^7.0.93 @ai-sdk/openai@^4.0.60 simple-git@^3.36.0 execa@^10.0.1 better-sqlite3@^13.0.3 drizzle-orm@^0.45.2 azure-devops-node-api@^17.0.0 zod@^4.5.4 marked@^18.0.11 sanitize-html@^2.17.7
```

---

## Architecture Patterns

### System Architecture Diagram

```
                              [Locked Plan & Ticket in 'In Dev']
                                              │
                                              ▼
                             ┌──────────────────────────────────┐
                             │    Provision Ephemeral Worktree  │
                             │  - task/ticket-{id}-{slug}       │
                             │  - protectTestFiles() (chmod 444)│
                             │  - capture baseCommit hash       │
                             └────────────────┬─────────────────┘
                                              │
                                              ▼
                             ┌──────────────────────────────────┐
                             │       Coding Agent Loop (ai)     │
                             │  - createFile, editFile, delete  │
                             │  - dependency guard on pkg.json  │
                             └────────────────┬─────────────────┘
                                              │
                                              ▼
                                   [Pre-Commit Diff Guard]
                                  Is diff < 250 LOC?
                                    /           \
                           (No / >250)         (Yes)
                                 /                \
                                ▼                  ▼
                    ┌──────────────────────┐  ┌───────────────────────────┐
                    │ Abort & Flag Blocked │  │  Git Commit: feat(AB#id)  │
                    │ [Diff Ceiling Exceed]│  │  Check Test Immutability  │
                    └──────────────────────┘  └─────────────┬─────────────┘
                                                            │
                                                            ▼
                                              ┌───────────────────────────┐
                                              │ Run Local Unit Tests      │
                                              │ (runner.ts: npm test 120s)│
                                              └─────────────┬─────────────┘
                                                            │
                                                   [Did tests pass?]
                                                     /            \
                                                 (No)             (Yes)
                                                  /                  \
                                                 ▼                    ▼
                                     [Repair Loop Capped 3-5]   ┌──────────────────────────┐
                                     Iterate <= MAX_CYCLES?     │ Record SQLite l3_evidence│
                                      /                   \     │ Post [L3 Evidence] HTML  │
                                   (Yes)                  (No)  │ Tag [l3-verified]        │
                                    /                       \   │ Transition -> 'Dev Done' │
                                   ▼                         ▼  └──────────────────────────┘
                        ┌─────────────────────┐   ┌────────────────────────┐
                        │ Prune Diagnostics   │   │ Push WIP: wip/ticket-id│
                        │ - top 15 app frames │   │ Post [Repair Exhausted]│
                        │ Re-invoke LLM Repair│   │ Flag ticket 'Blocked'  │
                        └──────────┬──────────┘   └────────────────────────┘
                                   │
                                   └─────────▶ (Re-run Tests)
```

### Recommended Project Structure

```
src/
├── execute/
│   ├── worker.ts             # Orchestrates execute flow: plan check -> implement -> test -> dev done
│   ├── coder.ts              # Vercel AI SDK coding agent with bounded file tools
│   ├── repair.ts             # Self-repair loop coordinator (max 3-5 iterations)
│   └── diff-guard.ts         # Cumulative diff calculator (<250 LOC) & package dependency guard
├── test-runner/
│   ├── executor.ts           # Executes local tests via runner.ts and captures results
│   ├── parser.ts             # Regex parser for Vitest output, failure traces & stack trace pruning
│   ├── immutability.ts       # Validates 0 modifications to baseline tests & assertion presence
│   └── evidence.ts           # L3 Evidence schema, SQLite persistence, and HTML formatter
├── sandbox/
│   ├── worktree.ts           # Worktree lifecycle & chmod 444 test locker
│   └── runner.ts             # Execa subprocess runner with timeout & secret scrubbing
└── db/
    ├── schema.ts             # Added l3_evidence Drizzle table definition
    └── index.ts              # SQLite database connection & migrations
```

### Pattern 1: Bounded Multi-File Editing with Diff Budget Enforcement (<250 LOC)
**What:** Structured tools (`createFile`, `editFile`, `deleteFile`) perform edits in the worktree while a pre-commit diff validator computes cumulative changes against the branch `baseCommit`. If `additions + deletions > 250`, the edit is rejected and rolled back.
**When to use:** Every time the agent creates or modifies files during implementation.
**Example:**
```typescript
// Source: src/execute/diff-guard.ts
import { SimpleGit } from 'simple-git';

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

### Pattern 2: Pre-PR Test Assertion Immutability & Contract Conflict Detection
**What:** Verifies baseline test assertion files are never modified or deleted (`git diff --name-status`). Permits new test files only if they contain valid assertion statements (`expect(...)` or `assert(...)`). Detects contract conflicts if existing tests cannot pass without test changes.
**When to use:** Pre-commit and pre-PR verification steps.
**Example:**
```typescript
// Source: src/test-runner/immutability.ts
export interface TestImmutabilityResult {
  valid: boolean;
  violations: string[];
  newTestFiles: string[];
}

export function checkTestImmutability(
  nameStatusDiff: string,
  initialTestFiles: string[]
): TestImmutabilityResult {
  const normalizedInitial = new Set(initialTestFiles.map((p) => p.replace(/\\/g, '/')));
  const violations: string[] = [];
  const newTestFiles: string[] = [];

  const lines = nameStatusDiff.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const [status, filePath] = line.split(/\s+/);
    const normalizedPath = filePath.replace(/\\/g, '/');

    if (normalizedInitial.has(normalizedPath)) {
      if (status.startsWith('M') || status.startsWith('D') || status.startsWith('R')) {
        violations.push(`Modified protected baseline test: [${status}] ${normalizedPath}`);
      }
    } else if (/\.(test|spec)\.(ts|js|tsx|jsx)$/i.test(normalizedPath)) {
      if (status.startsWith('A')) {
        newTestFiles.push(normalizedPath);
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

### Pattern 3: Diagnostic Extraction & Automated Self-Repair Loop
**What:** Compacts raw test runner output into a targeted repair context containing failing test names, assertion errors, and the top 15 application stack frames (excluding `node_modules`). Runs up to `MAX_REPAIR_CYCLES` (3-5). On exhaustion, pushes WIP branch and marks ticket blocked.
**When to use:** Whenever local tests exit with a non-zero code.
**Example:**
```typescript
// Source: src/test-runner/parser.ts
export interface PrunedDiagnostics {
  failingTests: string[];
  assertionErrors: string[];
  prunedStackTrace: string[];
  summary: string;
}

export function pruneTestDiagnostics(stdout: string, stderr: string): PrunedDiagnostics {
  const combined = `${stdout}\n${stderr}`;
  const lines = combined.split('\n');

  const failingTests: string[] = [];
  const assertionErrors: string[] = [];
  const rawFrames: string[] = [];

  for (const line of lines) {
    // Vitest failure lines
    if (/FAIL\s+([^\n>]+)/.test(line)) {
      failingTests.push(line.trim());
    } else if (/(?:AssertionError|Error|TypeError|ReferenceError):\s*([^\n]+)/.test(line)) {
      assertionErrors.push(line.trim());
    } else if (/^\s*(?:at|❯)\s+(.*)/.test(line)) {
      // Ignore node_modules and internal Node frames
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

### Pattern 4: Structured L3 Evidence Capture & ADO Transition
**What:** Stores test execution results and diff metrics in SQLite `l3_evidence` table, formats an ADO discussion HTML comment with `[L3 Evidence]` badge, and patches `System.State` to `Dev Done` with `[l3-verified]` tag.
**When to use:** After unit tests pass cleanly.
**Example:**
```typescript
// Source: src/test-runner/evidence.ts
import { db } from '../db/index.js';
import { l3Evidence } from '../db/schema.js';
import { buildTagPatch } from '../ado/work-item.js';
import { Operation, JsonPatchDocument } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

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
```

### Anti-Patterns to Avoid
- **Hacking tests to pass:** Allowing the agent to edit failing test files. Always maintain immutable baseline tests; reject any modification pre-PR.
- **Unbounded self-repair:** Allowing the agent to loop indefinitely on failed tests, burning hundreds of dollars in tokens. Cap strictly at 3 attempts (max 5).
- **Dumping entire 10,000-line test outputs to prompt:** Floods LLM context window with irrelevant `node_modules` frames. Always prune to top 15 application frames.
- **Silent failure on exhaustion:** Dropping execution when repair budget is exceeded without pushing WIP commits or updating ADO. Always push `wip/ticket-{id}` and flag `Blocked`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git diff calculation | Custom line scanner | `simple-git` CLI (`git diff --shortstat`, `git diff --numstat`) | Git natively handles line endings (CRLF/LF), rename detection, binary files, and submodules. |
| Process termination & timeouts | `child_process.exec` | `execa` 10 (`runner.ts`) | Hand-rolled process runners leak zombie child processes, fail to handle tree signals, and buffer output unsafely into memory. |
| Agent reasoning & tool loop | Custom prompt loop with while(true) | Vercel AI SDK `generateText` with `tools` & `isStepCount` | Handles schema validation, streaming, tool call execution, and state propagation cleanly. |
| HTML comment formatting | String concatenation | `marked` + `sanitize-html` | ADO Boards strictly renders HTML; hand-rolled HTML strings risk malformed tags and XSS vulnerabilities. |

**Key insight:** Git CLI and process isolation have decades of edge-case handling. Using `simple-git` and `execa` guarantees that diff budgets, timeouts, and process terminations behave deterministically across Windows and Linux runners.

---

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | SQLite schema needs `l3_evidence` table | Code edit: Add table definition in `src/db/schema.ts` and `CREATE TABLE IF NOT EXISTS` in `src/db/index.ts`. |
| Live service config | ADO Board states: `In Dev`, `Dev Done`, `Blocked` | Code edit: ADO JSON Patch transitions work item state; no manual ADO UI configuration needed. |
| OS-registered state | None — verified by ephemeral worktrees in `.worktrees/` | Normal cleanup: `cleanupWorktree` removes ephemeral directories and branches. |
| Secrets/env vars | `ADO_PAT`, `OPENAI_API_KEY`, `ADO_WEBHOOK_SECRET` | None — already scrubbed by `runner.ts` and loaded via `dotenv`. |
| Build artifacts | None — clean worktree per task | Ephemeral worktrees are isolated under `.worktrees/`. |

---

## Common Pitfalls

### Pitfall 1: Autonomous Self-Repair "Test Hacking" (Assertion Erasure)
**What goes wrong:** The agent modifies or deletes failing test assertions in `tests/` instead of fixing application code bugs, achieving 100% test pass rate on broken code.  
**Why it happens:** The LLM optimizes for zero exit code (`exit 0`). The path of least resistance is deleting the failing assertion.  
**How to avoid:** Lock baseline test files with `0o444` read-only permissions; run `git diff --name-status baseCommit` before commit/PR; reject any modification or deletion to baseline test files.  
**Warning signs:** Negative assertion count or diffs touching `tests/` on bugfix tickets.

### Pitfall 2: Hallucinated Package Dependencies
**What goes wrong:** The agent executes `npm install <convenience-package>` or modifies `package.json` to solve an unfamiliar problem, contaminating the dependency tree.  
**Why it happens:** LLMs default to popular external packages rather than project utilities.  
**How to avoid:** Dependency guard: compare before/after `package.json` dependencies; reject additions unless package name is explicitly mentioned in ticket acceptance criteria or allowlist.  
**Warning signs:** `package.json` modified when ticket only specified business logic changes.

### Pitfall 3: Context Saturation from Unpruned Test Traces
**What goes wrong:** Feeding raw 50KB Vitest stderr with deeply nested `node_modules` frames into the repair prompt causes LLM confusion and token waste.  
**Why it happens:** Passing raw subprocess output without filtering.  
**How to avoid:** Diagnostic pruning: extract failing test names, assertion failure strings, and top 15 application frames matching `src/` or `tests/`.  
**Warning signs:** Token usage spiking past 40k tokens on turn 2 of repair loop.

### Pitfall 4: Diff Budget Creep & Massive Refactors
**What goes wrong:** The agent refactors unrelated files or adds sprawling boilerplate, creating 600 LOC diffs that developers rubber-stamp without reading.  
**Why it happens:** Lack of pre-commit diff constraint.  
**How to avoid:** Enforce < 250 LOC cumulative diff budget (`git diff --shortstat`); abort and flag ticket blocked if exceeded.  
**Warning signs:** Multi-file edits touching utility files not listed in the plan.

---

## Code Examples

### 1. Dependency Guard & Package Modification Checker
```typescript
// Source: src/execute/diff-guard.ts
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

### 2. Self-Repair Loop with WIP Branch Fallback
```typescript
// Source: src/execute/repair.ts
import { SimpleGit } from 'simple-git';
import { runCommand } from '../sandbox/runner.js';
import { pruneTestDiagnostics } from '../test-runner/parser.js';

export interface RepairLoopOptions {
  worktreePath: string;
  git: SimpleGit;
  workItemId: number;
  maxCycles?: number;
  runTestCommand?: string[];
}

export async function executeRepairLoop(options: RepairLoopOptions) {
  const maxCycles = options.maxCycles ?? 3;
  let cycle = 0;

  while (cycle < maxCycles) {
    const testResult = await runCommand('npm', ['test'], { cwd: options.worktreePath });
    if (testResult.exitCode === 0) {
      return { success: true, cyclesUsed: cycle, testResult };
    }

    cycle++;
    if (cycle >= maxCycles) {
      break;
    }

    const diagnostics = pruneTestDiagnostics(testResult.stdout, testResult.stderr);
    // Invoke AI repair agent with pruned diagnostics...
  }

  // Budget exhausted: push WIP branch
  const wipBranch = `wip/ticket-${options.workItemId}`;
  await options.git.raw(['checkout', '-b', wipBranch]);
  // Push WIP branch without deleting worktree
  return { success: false, cyclesUsed: cycle, wipBranch };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Unconstrained multi-file generation (500+ LOC) | Strict diff ceiling (<250 LOC) | Industry standard 2025/2026 | Prevents reviewer fatigue and unreviewable AI PRs. |
| Overwriting or skipping failing tests | Immutable baseline tests (chmod 444 + git diff check) | SWE-bench best practices | Eliminates test hacking and false-positive passes. |
| Dumping raw stderr stack traces to prompt | Pruned top 15 application frames | Context engineering standard | Conserves context window and speeds up LLM diagnosis. |
| In-memory or lost WIP on failure | Push `wip/ticket-{id}` + ADO `Blocked` | Golden Path standard 2026 | Preserves developer time; provides actionable debugging context. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ADO Board accepts `Blocked` as a valid transition state or tag | Summary / Common Pitfalls | Low: if board configuration lacks 'Blocked' state, ticket remains 'In Dev' with `[blocked]` tag. |

*(All other claims verified via package.json, npm registry, and existing codebase implementations).*

---

## Open Questions (RESOLVED)

1. **Handling test files with multiple runners (e.g. backend vs frontend):**
   - RESOLVED: Run project default unit test command (`npm test`), which finishes in <10 seconds for unit suites.
   - What we know: Vitest runs all unit tests in the project.
   - What's unclear: If a ticket touches only frontend code, should it run only frontend tests or full suite?
   - Recommendation: Run the project default unit test command (`npm test`), which finishes in <10 seconds for unit suites.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| **Node.js** | Host runtime | ✓ | `v24.0.2` [VERIFIED] | None (mandatory) |
| **npm** | Package execution | ✓ | `11.19.1` [VERIFIED] | None (mandatory) |
| **Git** | Worktree, diff & commit | ✓ | `2.53.0.windows.2` [VERIFIED] | None (mandatory) |
| **Vitest** | Unit test runner | ✓ | `5.0.0` [VERIFIED] | None (in devDependencies) |
| **SQLite (better-sqlite3)** | Persistence | ✓ | `13.0.3` [VERIFIED] | In-memory SQLite during test |

**Missing dependencies:** None. All tools verified on host machine.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.0 [VERIFIED: package.json] |
| Config file | `vitest.config.ts` (or default package.json `test: vitest run`) |
| Quick run command | `npx vitest run tests/diff-ceiling.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| IMPL-01 | Bounded implementation respecting <250 LOC diff ceiling & package dependency guard | Unit | `npx vitest run tests/diff-ceiling.test.ts` | ❌ Wave 0 Gap |
| IMPL-02 | Test assertion immutability check, new test assertion validator, and contract conflict detection | Unit | `npx vitest run tests/test-protection.test.ts` | ❌ Wave 0 Gap |
| TEST-01 | Local unit test execution, diagnostic parsing, L3 evidence SQLite recording & ADO patch | Unit | `npx vitest run tests/l3-evidence.test.ts` | ❌ Wave 0 Gap |
| TEST-02 | Automated self-repair loop (capped at 3-5 iterations) & WIP branch push on exhaustion | Unit / Integration | `npx vitest run tests/repair-loop.test.ts` | ❌ Wave 0 Gap |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/{file}.test.ts`
- **Per wave merge:** `npm test` (all 91+ tests green)
- **Phase gate:** Full test suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/diff-ceiling.test.ts` — covers IMPL-01 diff calculation (<250 LOC) and dependency guard.
- [ ] `tests/test-protection.test.ts` — covers IMPL-02 test file immutability, assertion presence check, and contract conflicts.
- [ ] `tests/l3-evidence.test.ts` — covers TEST-01 diagnostics parsing, SQLite persistence, and `[L3 Evidence]` HTML formatting.
- [ ] `tests/repair-loop.test.ts` — covers TEST-02 iteration capping, failure trace passing, and WIP branch exhaustion fallback.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| **V5 Input Validation** | Yes | Path traversal protection (`path.resolve` + `path.relative` within worktree); dependency allowlist guarding `package.json`. |
| **V6 Cryptography** | Yes | HMAC webhook signature verification (retained from Phase 1). |
| **V14 Configuration & Token Scrubbing** | Yes | Sanitized child process environments (`extendEnv: false`) and secret redaction filters in `runner.ts`. |

### Known Threat Patterns for Autonomous Coder Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path Traversal in File Tools | Elevation of Privilege / Tampering | Validate relative path against `worktreePath` root; deny paths starting with `..`. |
| Malicious Package Injection in `package.json` | Supply Chain Tampering | Reject dependency additions unless explicitly present in ticket acceptance criteria or allowlist. |
| Assertion Erasure ("Test Hacking") | Tampering | Set `chmod 444` on baseline tests; enforce `git diff --name-status` check rejecting changes to existing test files. |
| Secret Leaks in Test Traces / Git Diffs | Information Disclosure | Scrub PATs and API keys from stdout/stderr before feeding into LLM repair prompts or ADO comments. |

---

## Sources

### Primary (HIGH confidence)
- `package.json` & Node.js environment: Verified Node 24.0.2, Git 2.53.0, npm 11.19.1.
- npm registry: `ai@7.0.93`, `@ai-sdk/openai@4.0.60`, `vitest@5.0.0`, `simple-git@3.36.0`, `execa@10.0.1`, `better-sqlite3@13.0.3`, `drizzle-orm@0.45.2`.
- `03-CONTEXT.md`: Locked decisions on diff ceiling (<250 LOC), test immutability, self-repair loop (3-5 cycles), and L3 evidence.

### Secondary (MEDIUM confidence)
- SWE-bench and autonomous agent benchmarks: Empirical patterns for test hacking prevention and stack trace pruning.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified on host machine and npm registry.
- Architecture: HIGH — patterns directly address locked decisions and requirements with clear tier separation.
- Pitfalls: HIGH — covers test hacking, context saturation, and diff creep with concrete mitigations.

**Research date:** 2026-09-08  
**Valid until:** 2026-10-08
