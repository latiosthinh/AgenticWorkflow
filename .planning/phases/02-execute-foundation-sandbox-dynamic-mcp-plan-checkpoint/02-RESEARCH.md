# Phase 2: EXECUTE Foundation — Sandbox, Dynamic MCP & Plan Checkpoint - Research

**Researched:** 2026-09-08  
**Domain:** Ephemeral Git Worktrees, Subprocess Sandboxing, Dynamic MCP Tool Registration, Interactive Plan Checkpoint State Machine  
**Confidence:** HIGH  

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Ephemeral Git Worktree & Sandbox Lifecycle
- Worktree directory: `.worktrees/ticket-{id}-{slug}` within repository root, ignored by `.gitignore`.
- Branch naming: `task/ticket-{id}-{slug}` branched from latest `origin/main`.
- Cleanup: explicit cleanup on normal completion; startup sweep prunes orphaned worktrees older than 2 hours.
- Test protection: mark existing test directory files read-only (`chmod 444`) prior to agent execution; verify no modifications in pre-PR diff check.

#### Process Runner & Credential Scrubbing
- Process execution via `execa` with parameterized argument arrays (`execa(cmd, args, options)`), strictly disabling `shell: false`.
- Credential scrubbing: strip all variables matching `*PAT*`, `*API_KEY*`, `*TOKEN*`, `*SECRET*` from child process environments; provide sanitized `PATH`, `HOME`, `NODE_ENV`.
- Timeout enforcement: 120s hard timeout with `SIGTERM` followed by `SIGKILL` after a 2-second grace period.
- Output truncation: cap stdout/stderr buffers at 50KB with `[...truncated...]` retention to avoid memory exhaustion and log bloat.

#### Dynamic MCP Tool Registry & Domain Tag Resolver
- Tag resolver registry:
  - `frontend`: mounts DOM, CSS inspection, and browser test tools.
  - `backend`: mounts database schema inspection and API contract validation tools.
  - `infra`: mounts infrastructure linter and cloud resource mock tools.
  - Common: always mounts `git-tools`, `test-runner`, `file-tools`.
- Untagged fallback: defaults to the common toolset without domain-specific extensions.
- Integration: in-process TypeScript MCP definitions consuming `@modelcontextprotocol/sdk` and `@ai-sdk/mcp`.
- Guardrail: cap active tools at maximum 12 per agent run with 1-sentence concise descriptions to protect LLM context windows.

#### Interactive Plan Checkpoint (Q→human) Lifecycle
- Question format: post ADO discussion comment with `[Plan Q&A]` header, structured numbered questions, and tag work item with `[awaiting-input]`.
- Resource release: immediately release ephemeral git worktree and terminate worker process cleanly; store pending question state in SQLite `plan_checkpoints` table.
- Resumption trigger: ADO webhook on `workitem.comment` from non-bot user matching `[awaiting-input]` ticket state incorporates answers, removes tag, locks plan, and enqueues worker.
- Timeout policy: send reminder notification after 24h unanswered; after 72h, mark ticket blocked and notify human tech lead.

### the agent's Discretion
- Exact database schema for `plan_checkpoints` table.
- Helper scripts for worktree creation and cross-platform Windows/POSIX path normalization.

### Deferred Ideas (OUT OF SCOPE)
- Containerized Docker/OCI runner isolation on remote VM cluster (v2 — host process sandbox with execa and worktree for v1).
- Interactive web portal for plan Q&A (ADO work item discussion is sole interface for v1).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAN-01 | Agent formulates implementation plan and posts interactive clarification questions (`Q→human`) to work item discussion when ambiguities exist. | Vercel AI SDK structured planning agent (`generateText` + `Output.object`), ADO comment formatter with `[Plan Q&A]` header, tag patcher adding `[awaiting-input]`. |
| PLAN-02 | Plan checkpoint releases sandbox while awaiting human answers; human comment re-triggers run via webhook; unanswered questions ping after 24h; locked plan persists before code edits begin. | SQLite `plan_checkpoints` persistence table, explicit `cleanupWorktree` invocation on ambiguity detection, webhook router matching non-bot comments on `[awaiting-input]` tickets, periodic reminder/escalation watchdog. |
| DISP-01 | System dynamically resolves domain tags (`frontend`, `backend`, `infra`) to mount matching MCP tools and scoped context. | Tag resolver mapping ADO `System.Tags` to specialized MCP toolsets, in-process `McpServer` registry with `@modelcontextprotocol/sdk` + `@ai-sdk/mcp`, 12-tool cap with 1-sentence descriptions. |
| SAND-01 | Worker provisions ephemeral `git worktree` isolated from host repository for each task run. | `simple-git` worktree driver managing `.worktrees/ticket-{id}-{slug}` and `task/ticket-{id}-{slug}` branch, Windows/POSIX path normalization, test file `chmod 444` write protection, 2h orphan pruner. |
| SAND-02 | Process runner enforces execution timeouts (120s) and scrubs sensitive credentials (PATs, API keys) from environment variables and logs. | `execa` 10 wrapper with `shell: false`, `timeout: 120_000`, `forceKillAfterDelay: 2000`, env whitelist scrubbing `*PAT*|*API_KEY*|*TOKEN*|*SECRET*`, stdout/stderr token redaction filter, 50KB truncation buffer. |
</phase_requirements>

## Project Constraints (from AGENTS.md / CLAUDE.md)

- **Tech Stack**: Node.js 24 LTS (`v24.0.2` [VERIFIED: host environment]) and TypeScript 7 (`v7.0.2` [VERIFIED: package.json]). Fastify 5 webhook server, SQLite with Drizzle ORM in WAL mode, `p-queue` concurrency lanes.
- **Forbidden Patterns**:
  - Do NOT execute shell strings with `child_process.exec` or `shell: true` [CITED: CLAUDE.md].
  - Do NOT use external brokers (Redis/BullMQ) in v1 [CITED: CLAUDE.md].
  - Do NOT leak ADO PATs, git tokens, or LLM keys into subprocess environments or logs [CITED: CLAUDE.md].
  - Do NOT allow unbounded autonomous loops without human gates [CITED: REQUIREMENTS.md].
- **Coding Style**: Terse caveman, drop fluff, exact code blocks, stdlib/native first, shortest diff wins.

---

## Summary

Phase 2 establishes the isolated execution foundation and planning checkpoint before any autonomous code edits take place in Phase 3. It bridges Phase 1's validated ticket intake (`Ready to Dev` state) to safe agent execution by provisioning an ephemeral git worktree per ticket, strictly isolating command execution via `execa` with credential scrubbing and a 120-second timeout, and mounting domain-tailored MCP tools based on work item tags (`frontend`, `backend`, `infra`).

The centerpiece of developer alignment in Phase 2 is the non-blocking plan checkpoint (`PLAN-01`, `PLAN-02`). When the planning agent encounters ambiguities in a ticket, it formulates structured questions, posts them to the Azure DevOps discussion thread under `[Plan Q&A]`, tags the ticket `[awaiting-input]`, and immediately tears down the git worktree to release host memory and file handles. When the developer replies, the webhook gateway ingests the comment, resumes the plan with human answers incorporated, locks the plan in SQLite `plan_checkpoints`, and signals readiness for Phase 3 implementation.

**Primary recommendation:** Build sandbox isolation and MCP tooling as modular, in-process TypeScript components, backing the interactive plan checkpoint with atomic SQLite transitions and a lightweight 24h/72h watchdog.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Worktree Lifecycle (`SAND-01`) | Execution Sandbox (Host CLI) | File System / Git | Git worktree creation and teardown requires direct Git CLI access on host disk. |
| Test File Protection (`SAND-01`) | Execution Sandbox | File System (OS Attributes) | OS file permissions (`0o444`) prevent accidental or adversarial edits by LLM code generation. |
| Subprocess Execution (`SAND-02`) | Execution Sandbox (`execa`) | OS Process Tree | Process spawning, signal traps (`SIGTERM`/`SIGKILL`), and memory bounds belong in process runner. |
| Credential Scrubbing (`SAND-02`) | Execution Sandbox (Runner) | Ingress / Logger | Sanitizes environment variables before spawning child and redacts secret tokens from output streams. |
| Tag Resolver & Registry (`DISP-01`) | Dynamic MCP Dispatcher | Agent Runtime (`ai`) | Maps ADO work item tags to discrete tool sets and caps active tools at 12 before passing to LLM. |
| Plan Formulation (`PLAN-01`) | Planning Agent (LLM) | ADO REST Adapter | Evaluates ticket context and repository structure to formulate plan or identify ambiguities. |
| Plan Checkpoint State (`PLAN-02`) | Database (SQLite) | Ingress Webhook Router | Persists pending questions and locked plans; correlates incoming human comments to resume tickets. |
| Checkpoint Watchdog (`PLAN-02`) | Background Poller / Timer | ADO REST Adapter | Scans SQLite checkpoints for overdue human answers to post 24h reminders and 72h blocker alerts. |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **simple-git** | `3.36.0` [VERIFIED: npm registry] | Git worktree driver | Typed, promise-based wrapper over native Git CLI (`git 2.53` [VERIFIED: host environment]). Supports raw worktree commands and branch isolation. |
| **execa** | `10.0.1` [VERIFIED: npm registry] | Safe subprocess runner | Modern ESM process execution with built-in timeouts (`timeout: 120_000`), graceful kill delays (`forceKillAfterDelay: 2000`), signal handling, safe argument arrays, and maxBuffer safeguards. |
| **@modelcontextprotocol/sdk** | `1.30.0` [VERIFIED: npm registry] | MCP server & tool definitions | Official Anthropic MCP specification implementation. Provides `McpServer`, `registerTool`, and `InMemoryTransport` for zero-overhead in-process tool binding. |
| **@ai-sdk/mcp** | `2.0.45` [VERIFIED: npm registry] | Vercel AI SDK MCP bridge | Official adapter converting MCP client sessions and transports directly into Vercel AI SDK model-callable tools. |
| **better-sqlite3** | `13.0.3` [VERIFIED: package.json] | Checkpoint persistence | High-speed, in-process transactional storage for `plan_checkpoints` in WAL mode. |
| **drizzle-orm** | `0.45.2` [VERIFIED: package.json] | Type-safe schema builder | Defines and queries `plan_checkpoints` table with full TypeScript inference. |
| **zod** | `4.5.4` [VERIFIED: package.json] | Schema validation | Runtime validation for tool arguments, MCP configurations, and structured plan output schemas. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **marked** | `18.0.11` [VERIFIED: package.json] | Markdown to HTML parser | Converting plan descriptions and Q&A markdown into ADO discussion HTML. |
| **sanitize-html** | `2.17.7` [VERIFIED: package.json] | HTML sanitizer | Stripping dangerous tags from rendered discussion comments before posting to ADO. |
| **p-queue** | `9.3.3` [VERIFIED: package.json] | Lane queue concurrency | Serializing background plan execution and resumption per work item. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `simple-git` | `isomorphic-git` | `isomorphic-git` lacks git worktree support and native performance. Native Git CLI via `simple-git` is vastly faster and supports full Git 2.53 features. |
| `execa` 10 | `node:child_process` `spawn`/`exec` | Native `exec` uses unsafe shell interpolation vulnerable to command injection and buffers output naively. `execa` provides cross-platform signal termination, strict timeout guarantees, and safe argument passing. |
| In-Process MCP (`InMemoryTransport`) | Stdio Process MCP servers | Spawning separate child processes for every local tool adds 50-200ms startup latency and process handle overhead. In-process `McpServer` with `InMemoryTransport` executes in microseconds with zero IPC serialization cost. |

**Installation:**
```bash
npm install simple-git@^3.36.0 execa@^10.0.1 @modelcontextprotocol/sdk@^1.30.0 @ai-sdk/mcp@^2.0.45
```

---

## Architecture Patterns

### System Architecture Diagram

```
[ADO Webhook: State -> 'In Dev' OR Human Comment]
                       │
                       ▼
         [Fastify Ingress Gateway]
          - verify HMAC signature
          - dedup by (workItemId, revId)
          - filter bot echoes
                       │
                       ▼
       [Work Item Queue Lane (p-queue)]
                       │
                       ▼
       [Execute Worker: Dispatcher Router]
         ├── Ticket State = 'In Dev' & Tag = '[awaiting-input]' & Non-Bot Comment?
         │     ├── YES ──► [Resume Checkpoint]
         │     │             ├── Extract human answers from System.History
         │     │             ├── Remove '[awaiting-input]' tag via ADO patch
         │     │             ├── Update SQLite plan_checkpoints status='locked'
         │     │             └── Post 'Plan Locked' comment to ADO discussion
         │     │
         │     └── NO (Fresh 'In Dev' transition)
         │           │
         │           ▼
         │   [1. Ephemeral Worktree Provisioning]
         │     - create .worktrees/ticket-{id}-{slug}
         │     - branch task/ticket-{id}-{slug} from origin/main
         │     - set test files read-only (chmod 0o444)
         │           │
         │           ▼
         │   [2. Dynamic MCP Tool Resolution]
         │     - inspect System.Tags ('frontend', 'backend', 'infra')
         │     - mount Common tools (git, runner, files)
         │     - mount Domain tools (DOM, DB schema, Infra linter)
         │     - enforce <= 12 active tools guardrail
         │           │
         │           ▼
         │   [3. Planning Agent Reasoning Loop]
         │     - analyze requirements & repo structure
         │     - evaluate ambiguities
         │           │
         │           ├── Ambiguities detected?
         │           │     ├── YES ──► [Enter Plan Checkpoint]
         │           │     │             ├── Post '[Plan Q&A]' comment to ADO discussion
         │           │     │             ├── Patch work item: add '[awaiting-input]' tag
         │           │     │             ├── Persist to SQLite plan_checkpoints (status='pending_human_input')
         │           │     │             └── Cleanup worktree immediately (SANDBOX RELEASED)
         │           │     │
         │           │     └── NO ──► [Lock Plan]
         │           │                   ├── Persist to SQLite plan_checkpoints (status='locked')
         │           │                   ├── Post '[Plan Checkpoint] Implementation Plan Locked' comment
         │           │                   └── Ready for Phase 3 Implementation
                       │
                       ▼
        [Background Watchdog (24h/72h)]
          - scan plan_checkpoints where status='pending_human_input'
          - age >= 24h & remindedAt IS NULL ──► Post reminder comment, set remindedAt
          - age >= 72h & escalatedAt IS NULL ──► Post escalation comment, patch State='Blocked'
```

### Recommended Project Structure
```
src/
├── sandbox/
│   ├── worktree.ts        # Ephemeral worktree create, chmod test protection, prune
│   ├── runner.ts          # Execa process runner, 120s timeout, credential scrubber
│   └── types.ts           # Runner and worktree parameter interfaces
├── mcp/
│   ├── registry.ts        # Dynamic tag resolver (frontend, backend, infra, common)
│   ├── server.ts          # In-process McpServer initialization & InMemory transport pair
│   └── tools/
│       ├── common.ts      # git-tools, test-runner, file-tools (always mounted)
│       ├── frontend.ts    # DOM inspection, CSS inspection, browser tests
│       ├── backend.ts     # DB schema inspection, API contract validation
│       └── infra.ts       # Infrastructure linter, cloud mock validator
├── plan/
│   ├── planner.ts         # Vercel AI SDK planning agent, ambiguity evaluator
│   ├── checkpoint.ts      # SQLite plan_checkpoints persistence and status transitions
│   ├── formatter.ts       # ADO HTML formatters for [Plan Q&A] and [Plan Checkpoint]
│   └── watchdog.ts        # 24h ping reminder and 72h blocked escalation poller
├── execute/
│   ├── worker.ts          # Background execution orchestrator for 'In Dev' items
│   └── router.ts          # Dispatches webhooks to auditor (New) vs execute (In Dev)
├── utils/
│   └── paths.ts           # Cross-platform POSIX/Windows path normalizer and slugify
└── db/
    └── schema.ts          # Drizzle schema extended with planCheckpoints table
```

### Pattern 1: Ephemeral Worktree Lifecycle with Test File Guardrails
**What:** Allocates an isolated git worktree directory for a specific ticket, checks out a new task branch, and sets existing test files to read-only (`0o444`) to guarantee assertion integrity.  
**When to use:** On every fresh `In Dev` ticket transition before agent exploration or command execution.  
**Example:**
```typescript
// Source: simple-git + node:fs
import simpleGit from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';
import { normalizePath, slugify } from '../utils/paths.js';

export interface WorktreeResult {
  worktreePath: string;
  branchName: string;
  testFilesProtected: string[];
}

export async function createWorktree(
  repoRoot: string,
  workItemId: number,
  title: string,
  baseBranch = 'origin/main'
): Promise<WorktreeResult> {
  const git = simpleGit(repoRoot);
  const slug = slugify(title);
  const dirName = `ticket-${workItemId}-${slug}`;
  const rawPath = path.join(repoRoot, '.worktrees', dirName);
  const worktreePath = normalizePath(rawPath);
  const branchName = `task/ticket-${workItemId}-${slug}`;

  // Prune any dangling worktrees from previous interrupted runs
  await git.raw(['worktree', 'prune']);

  // Ensure .worktrees parent directory exists
  fs.mkdirSync(path.join(repoRoot, '.worktrees'), { recursive: true });

  // Create worktree and new task branch
  await git.raw(['worktree', 'add', '-b', branchName, worktreePath, baseBranch]);

  // Recursively protect test files with read-only permissions (0o444)
  const testFilesProtected: string[] = [];
  protectTestFiles(worktreePath, testFilesProtected);

  return { worktreePath, branchName, testFilesProtected };
}

export async function cleanupWorktree(
  repoRoot: string,
  worktreePath: string,
  options?: { deleteBranch?: boolean; branchName?: string }
): Promise<void> {
  const git = simpleGit(repoRoot);

  // Unprotect files before removal to avoid Windows EPERM deletion locks
  unprotectFiles(worktreePath);

  try {
    await git.raw(['worktree', 'remove', '--force', worktreePath]);
  } catch (err) {
    // If worktree directory already gone, fallback to prune
  }
  await git.raw(['worktree', 'prune']);

  if (options?.deleteBranch && options?.branchName) {
    try {
      await git.raw(['branch', '-D', options.branchName]);
    } catch {
      // Ignore if branch already deleted
    }
  }
}

function protectTestFiles(dir: string, collected: string[]): void {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
      protectTestFiles(fullPath, collected);
    } else if (entry.isFile() && isTestFile(entry.name)) {
      fs.chmodSync(fullPath, 0o444);
      collected.push(normalizePath(fullPath));
    }
  }
}

function unprotectFiles(dir: string): void {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
      unprotectFiles(fullPath);
    } else if (entry.isFile()) {
      try {
        fs.chmodSync(fullPath, 0o666);
      } catch {}
    }
  }
}

function isTestFile(filename: string): boolean {
  return /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(filename);
}
// ponytail: local worktree isolation; add remote container pool for multi-tenant cloud runners in v2
```

### Pattern 2: Process Runner with 120s Timeout, Signal Cascades, and Redaction
**What:** Runs external commands using `execa` with `shell: false`, stripping sensitive environment variables, trapping execution timeouts (120s SIGTERM -> 2s SIGKILL), redacting secrets from stdout/stderr, and capping output buffers at 50KB.  
**When to use:** All test runs, linting, build checks, and agent tool commands.  
**Example:**
```typescript
// Source: execa 10.0.1 docs
import { execa } from 'execa';

export interface CommandOptions {
  cwd: string;
  env?: Record<string, string>;
  timeoutMs?: number; // default 120_000
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

const SENSITIVE_KEY_PATTERN = /(PAT|API_KEY|TOKEN|SECRET)/i;
const SENSITIVE_VALUE_PATTERN = /(?:ghp_[a-zA-Z0-9]{36}|Bearer\s+[a-zA-Z0-9_\-\.]+)/g;
const MAX_OUTPUT_BYTES = 50 * 1024; // 50KB

export function sanitizeEnv(customEnv?: Record<string, string>): NodeJS.ProcessEnv {
  const safeEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH || '',
    HOME: process.env.HOME || process.env.USERPROFILE || '',
    NODE_ENV: process.env.NODE_ENV || 'development',
    SYSTEMROOT: process.env.SYSTEMROOT || '',
    COMSPEC: process.env.COMSPEC || '',
    PATHEXT: process.env.PATHEXT || '',
    TEMP: process.env.TEMP || '',
    TMP: process.env.TMP || '',
  };

  if (customEnv) {
    for (const [key, value] of Object.entries(customEnv)) {
      if (!SENSITIVE_KEY_PATTERN.test(key)) {
        safeEnv[key] = value;
      }
    }
  }
  return safeEnv;
}

export function scrubOutput(text: string, knownSecrets: string[] = []): string {
  let cleaned = text.replace(SENSITIVE_VALUE_PATTERN, 'Bearer [REDACTED]');
  for (const secret of knownSecrets) {
    if (secret && secret.length >= 4) {
      cleaned = cleaned.replaceAll(secret, '[REDACTED]');
    }
  }
  return cleaned;
}

export function truncateBuffer(text: string, maxBytes = MAX_OUTPUT_BYTES): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
    return text;
  }
  const slicePoint = maxBytes - 40;
  return `${text.slice(0, slicePoint)}\n[...truncated...]`;
}

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
      maxBuffer: 10 * 1024 * 1024, // 10MB memory safety ceiling
    });

    return {
      stdout: truncateBuffer(scrubOutput(result.stdout, knownSecrets)),
      stderr: truncateBuffer(scrubOutput(result.stderr, knownSecrets)),
      exitCode: result.exitCode ?? 0,
      timedOut: false,
    };
  } catch (error: any) {
    const isTimeout = Boolean(error.timedOut);
    const rawStdout = error.stdout || '';
    const rawStderr = error.stderr || error.message || '';

    return {
      stdout: truncateBuffer(scrubOutput(rawStdout, knownSecrets)),
      stderr: truncateBuffer(scrubOutput(rawStderr, knownSecrets)),
      exitCode: error.exitCode ?? (isTimeout ? 124 : 1),
      timedOut: isTimeout,
    };
  }
}
// ponytail: execa host runner with signal cascades; wrap in docker run when running untrusted public repos
```

### Pattern 3: In-Process Dynamic MCP Tool Registry with Tag Dispatcher
**What:** Registers domain-specific tools into an in-process `McpServer` session and retrieves Vercel AI SDK tools via `@ai-sdk/mcp`, enforcing a strict 12-tool cap and 1-sentence descriptions.  
**When to use:** Instantiated per agent run based on work item taxonomy tags (`frontend`, `backend`, `infra`).  
**Example:**
```typescript
// Source: @modelcontextprotocol/sdk + @ai-sdk/mcp
import { McpServer } from '@modelcontextprotocol/server';
import { InMemoryTransport } from '@modelcontextprotocol/client';
import { createMCPClient } from '@ai-sdk/mcp';
import { z } from 'zod';

export interface ToolRegistryOptions {
  worktreePath: string;
  tags: string[];
  knownSecrets?: string[];
}

export async function createDynamicMcpTools(options: ToolRegistryOptions) {
  const server = new McpServer({ name: 'sdlc-worker', version: '1.0.0' });
  const registeredToolNames: string[] = [];

  function addTool(name: string, description: string, schema: z.ZodObject<any>, handler: (args: any) => Promise<any>) {
    if (registeredToolNames.length >= 12) {
      return; // Enforce maximum 12 tools guardrail
    }
    server.registerTool(name, { description, inputSchema: schema }, async (args) => {
      const result = await handler(args);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    });
    registeredToolNames.push(name);
  }

  // 1. Common Tools (Always mounted)
  addTool('git_status', 'Inspect git working tree status and active branch.', z.object({}), async () => {
    return { status: 'clean', branch: 'task/active' };
  });

  addTool('read_file', 'Read file contents at specified relative path within worktree.', z.object({ path: z.string() }), async ({ path }) => {
    return { path, content: '...' };
  });

  addTool('run_test', 'Execute test suite commands inside the sandbox under strict timeout.', z.object({ command: z.string(), args: z.array(z.string()) }), async ({ command, args }) => {
    return { exitCode: 0, stdout: 'PASS' };
  });

  // 2. Domain-Specific Tools
  const normalizedTags = options.tags.map((t) => t.toLowerCase().trim());

  if (normalizedTags.includes('frontend')) {
    addTool('inspect_dom_structure', 'Inspect DOM elements and component structure for frontend templates.', z.object({ selector: z.string() }), async () => ({}));
    addTool('inspect_css_styles', 'Inspect CSS selectors and computed styles across frontend assets.', z.object({ file: z.string() }), async () => ({}));
  }

  if (normalizedTags.includes('backend')) {
    addTool('inspect_db_schema', 'Inspect database tables, column types, and schema migrations.', z.object({ table: z.string().optional() }), async () => ({}));
    addTool('validate_api_contract', 'Validate request and response schemas against API route contracts.', z.object({ route: z.string() }), async () => ({}));
  }

  if (normalizedTags.includes('infra')) {
    addTool('lint_infra_config', 'Lint Dockerfiles, CI pipelines, and cloud infrastructure manifests.', z.object({ path: z.string() }), async () => ({}));
    addTool('mock_cloud_resource', 'Validate cloud configuration against local mock resource specifications.', z.object({ resource: z.string() }), async () => ({}));
  }

  // Connect In-Memory Transport pair
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const mcpClient = await createMCPClient({
    transport: clientTransport as any,
  });

  const tools = await mcpClient.tools();

  return {
    tools,
    activeToolCount: registeredToolNames.length,
    activeTools: registeredToolNames,
    close: async () => {
      await mcpClient.close();
    },
  };
}
// ponytail: in-process MCP tools; split into standalone microservices if shared across distributed runners in v2
```

### Anti-Patterns to Avoid
- **Shell Invocation via Strings (`child_process.exec(cmd)`):** Never invoke shell interpreters directly with concatenated strings; user-provided ticket data can execute arbitrary malicious code. Always use `execa(binary, [arg1, arg2], { shell: false })`.
- **Global / Shared Git Working Directory:** Never allow multiple workers to execute `git checkout` or `git commit` on the same directory. Worktrees provide complete working tree isolation while sharing the local `.git` object store.
- **Leaking Host Environment Variables:** Never pass `process.env` unchecked to child processes. Always filter through an explicit allowlist and scrub all tokens matching `*PAT*`, `*API_KEY*`, `*TOKEN*`, and `*SECRET*`.
- **Leaving Sandboxes Running During Human Checkpoints:** Never keep a worker node leased, a worktree allocated, or a timer running while waiting for human clarification. Persist question state in SQLite, delete the worktree, and resume when the webhook delivers the answer.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Process Spawning & Timeouts | Custom `child_process.spawn` with manual `setTimeout` and `process.kill` | `execa` 10.0.1 | Handling process trees, Windows PID killing, grace periods (`forceKillAfterDelay`), and stream buffer limits correctly across OS platforms requires hundreds of fragile lines of code. |
| Git Worktree Management | Custom git clone copies or manual `.git` pointer manipulation | `simple-git` `raw(['worktree', ...])` | Worktree references, prune states, branch detached states, and locked indexes have subtle edge cases handled natively by Git CLI. |
| MCP Protocol & Transports | Custom JSON-RPC 2.0 socket or HTTP protocol | `@modelcontextprotocol/sdk` + `@ai-sdk/mcp` | MCP specification defines standard handshake, tool schema serialization, capability negotiation, and notification events. |
| In-Memory Concurrency | Custom Promise arrays with tracking flags | `p-queue` 9.3.3 | Handles per-lane concurrency, pause/resume, event draining, and priority queuing with zero race conditions. |
| Markdown to ADO HTML | Custom regex-based Markdown replacer | `marked` + `sanitize-html` | ADO Boards require valid, sanitized HTML. Hand-rolled regex fails on nested lists, tables, and code blocks, or leaves XSS attack vectors open. |

---

## Runtime State Inventory

N/A — Phase 2 introduces new greenfield components (`plan_checkpoints` table, `.worktrees/` directory, dynamic MCP registry). No existing database records, OS tasks, or external service configurations require migration.

---

## Common Pitfalls

### Pitfall 1: Windows Path Separators in Git Worktree CLI
**What goes wrong:** On Windows hosts, `path.resolve` produces backslashes (e.g. `D:\Projects\.worktrees\ticket-101`). Passing this to `git worktree add` can cause path escaping bugs or failed checkouts.  
**Why it happens:** Git's internal CLI parser expects POSIX-style forward slashes or escaped backslashes.  
**How to avoid:** Normalize all worktree directory paths to forward slashes (`path.replace(/\\/g, '/')`) before invoking `git worktree add`.  
**Warning signs:** `fatal: could not create work tree dir ... Invalid argument` in worker logs.

### Pitfall 2: Git Worktree or Branch Collisions on Re-Triggered Tickets
**What goes wrong:** A work item transitions to `In Dev`, creates a worktree, hits an error, and transitions again. Git fails with `fatal: A branch named 'task/ticket-101-...' already exists` or `fatal: '...' is already a worktree`.  
**Why it happens:** Prior run did not execute cleanup or crashed before removal.  
**How to avoid:** Always run `git worktree prune` before creation. Check if the branch exists (`git branch --list <branchName>`). If exists and worktree is missing, attach to existing branch without `-b`, or delete the stale branch before recreating.  
**Warning signs:** Worker crashes immediately during worktree initialization with `fatal: already exists`.

### Pitfall 3: Subprocess Secret Leakage via Environment Variables or Unhandled Error Messages
**What goes wrong:** A test suite or compiler error dumps `process.env` or prints a command line containing the ADO PAT or OpenAI API key. The raw string gets posted to the ADO work item discussion or logged to disk.  
**Why it happens:** Child process inherits orchestrator environment, or error message contains credentials.  
**How to avoid:**
1. Build sanitized environment with explicit allowlist (`PATH`, `HOME`, `NODE_ENV`, `SYSTEMROOT`).
2. Run output scrubber on both `stdout` and `stderr` matching sensitive patterns before saving or posting to ADO.  
**Warning signs:** Long alphanumeric tokens visible in ADO discussion history or Vitest stdout.

### Pitfall 4: Orphaned Worktrees and Stale Worker Processes on Sudden Process Crashes
**What goes wrong:** Orchestrator crashes or server restarts (SIGKILL) while tickets are in progress. Dozens of worktree directories linger on disk, consuming storage and locking branches.  
**Why it happens:** Process exit interrupts cleanup handlers.  
**How to avoid:** Implement a startup cleanup sweep (`pruneOrphanedWorktrees`) that inspects `.worktrees/`, detects directories with modification timestamps older than 2 hours, removes them, and runs `git worktree prune`.  
**Warning signs:** Disk space growing in `.worktrees/` with branches that cannot be deleted.

### Pitfall 5: MCP Tool Schema Explosion and Context Saturation
**What goes wrong:** Agent is given 30+ tools with long, verbose descriptions. Planning latency spikes, token cost doubles, and the LLM hallucinates non-existent arguments.  
**Why it happens:** "Kitchen sink" tool registration dumping all potential capabilities into the agent prompt.  
**How to avoid:** Enforce hard limit of 12 tools per run. Use single-sentence, concise tool descriptions. Mount only tools corresponding to the work item's domain tags (`frontend`, `backend`, `infra`).  
**Warning signs:** Prompt token count exceeding 20,000 tokens before file exploration even begins.

### Pitfall 6: Infinite Webhook Loops on Plan Q&A Comments
**What goes wrong:** Agent posts `[Plan Q&A]` comment to ADO discussion. ADO Service Hook sends `workitem.updated` webhook. Orchestrator treats it as a new run and re-triggers the agent, posting another question.  
**Why it happens:** Webhook handler fails to detect that the comment originated from the bot itself.  
**How to avoid:**
1. Always append `<!-- [automated-agent] -->` to every comment posted by the orchestrator.
2. `isBotEcho` in `src/ingress/bot-shield.ts` inspects `System.History` and drops events containing `[automated-agent]`.
3. Only non-bot comments without the marker resume `[awaiting-input]` checkpoints.  
**Warning signs:** Rapid flood of identical comments on the work item within seconds.

---

## Code Examples

### Plan Checkpoint Drizzle Schema
```typescript
// Source: drizzle-orm/sqlite-core
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const planCheckpoints = sqliteTable('plan_checkpoints', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workItemId: integer('work_item_id').notNull(),
  revId: integer('rev_id').notNull(),
  status: text('status', {
    enum: ['pending_human_input', 'resumed', 'locked', 'blocked', 'expired'],
  }).notNull().default('pending_human_input'),
  questions: text('questions').notNull(), // JSON array of questions
  answers: text('answers'),              // JSON array or text of developer answers
  planMarkdown: text('plan_markdown'),   // Generated implementation plan
  estimatedFiles: text('estimated_files'), // JSON array of target file paths
  testStrategy: text('test_strategy'),   // Unit/integration test strategy
  remindedAt: integer('reminded_at', { mode: 'timestamp' }),
  escalatedAt: integer('escalated_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type PlanCheckpoint = typeof planCheckpoints.$inferSelect;
export type InsertPlanCheckpoint = typeof planCheckpoints.$inferInsert;
```

### Plan Q&A and Locked Plan Comment Formatting
```typescript
// Source: marked + sanitize-html
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

export function formatPlanQuestionsComment(questions: string[]): string {
  const listItems = questions.map((q, idx) => `${idx + 1}. ${q}`).join('\n');
  const md = `### [Plan Q&A] Implementation Clarification Required

The autonomous agent formulated an initial implementation plan but detected the following ambiguities:

${listItems}

**Action Required:**
Reply directly to this discussion with your clarifications. Work item is tagged \`[awaiting-input]\`. Sandbox execution resources have been released while awaiting your reply.
`;

  return renderSanitizedAdoHtml(md);
}

export function formatPlanLockedComment(planMarkdown: string, estimatedFiles: string[]): string {
  const fileList = estimatedFiles.map((f) => `* \`${f}\``).join('\n');
  const md = `### [Plan Checkpoint] Implementation Plan Locked

The implementation plan has been verified and locked.

**Estimated Files to Modify:**
${fileList}

**Implementation Plan:**
${planMarkdown}

*Proceeding to bounded implementation.*
`;

  return renderSanitizedAdoHtml(md);
}

function renderSanitizedAdoHtml(markdown: string): string {
  const rawHtml = marked.parse(markdown) as string;
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

### Checkpoint Watchdog (24h Reminder / 72h Escalation)
```typescript
// Source: drizzle-orm + better-sqlite3
import { db } from '../db/index.js';
import { planCheckpoints } from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { postFeedbackComment } from '../ado/work-item.js';
import { adoClient } from '../ado/client.js';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

export async function checkPlanCheckpointTimeouts(): Promise<{ reminded: number; escalated: number }> {
  const now = Date.now();
  let reminded = 0;
  let escalated = 0;

  const pendingCheckpoints = db
    .select()
    .from(planCheckpoints)
    .where(eq(planCheckpoints.status, 'pending_human_input'))
    .all();

  for (const cp of pendingCheckpoints) {
    const elapsed = now - cp.createdAt.getTime();

    // 72h Escalation: mark ticket Blocked and notify tech lead
    if (elapsed >= SEVENTY_TWO_HOURS_MS && !cp.escalatedAt) {
      await postFeedbackComment(
        cp.workItemId,
        `<strong>[Plan Checkpoint] Escalation: Work Item Blocked</strong><p>Clarification questions have been unanswered for over 72 hours. Marking work item Blocked.</p><!-- [automated-agent] -->`
      );

      // Update ADO work item state to Blocked
      await adoClient.updateWorkItem(cp.workItemId, [
        { op: Operation.Replace, path: '/fields/System.State', value: 'Blocked' },
      ]);

      db.update(planCheckpoints)
        .set({ status: 'blocked', escalatedAt: new Date(), updatedAt: new Date() })
        .where(eq(planCheckpoints.id, cp.id))
        .run();

      escalated++;
      continue;
    }

    // 24h Reminder: ping discussion
    if (elapsed >= TWENTY_FOUR_HOURS_MS && !cp.remindedAt) {
      await postFeedbackComment(
        cp.workItemId,
        `<strong>[Plan Reminder] Action Required: Unanswered Questions</strong><p>The implementation plan is awaiting your reply. Please respond to the questions above to resume work.</p><!-- [automated-agent] -->`
      );

      db.update(planCheckpoints)
        .set({ remindedAt: new Date(), updatedAt: new Date() })
        .where(eq(planCheckpoints.id, cp.id))
        .run();

      reminded++;
    }
  }

  return { reminded, escalated };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Shared repo clone for all agent runs | Ephemeral `git worktree` per ticket | 2024 / SWE-bench | Eliminates git index collisions and dirty state leaking between tickets. |
| In-memory agent wait loop (busy wait) | Sandbox release + SQLite state + webhook resumption | 2025 / Production agents | Zero CPU/memory held while human thinks; server can restart cleanly without dropping questions. |
| Kitchen-sink MCP server registration | Dynamic tag-scoped tool registry with 12-tool cap | 2025 / MCP standard | Prevents context window saturation and reduces LLM tool hallucination rates. |
| Unconstrained `child_process.exec` | Parameterized `execa` with signal cascades | Standard practice | Completely neutralizes prompt injection shell escapes and infinite loop hangs. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Marking test files read-only (`chmod 0o444`) on Windows NTFS prevents Node file writes with `EPERM`. | Ephemeral Git Worktree Lifecycle | [VERIFIED: host environment] Verified via Node script; Windows NTFS enforces read-only attribute causing `EPERM`. |
| A2 | In ADO, human discussion replies fire `workitem.updated` with `System.History` containing comment text and distinct `rev`. | Interactive Plan Checkpoint Lifecycle | [VERIFIED: Phase 1 & ADO API] ADO increments `System.Rev` on every comment and populates `System.History`. |
| A3 | InMemoryTransport allows in-process MCP server/client execution without spawning stdio processes. | Dynamic MCP Tool Registry | [VERIFIED: @modelcontextprotocol/sdk docs] `InMemoryTransport.createLinkedPair()` connects client and server in-memory. |

---

## Open Questions

1. **Tag formatting in Azure DevOps REST API**
   - What we know: `System.Tags` is returned as a semicolon-separated string (e.g. `"frontend; bug; awaiting-input"`).
   - What's unclear: If `System.Tags` is null on a new ticket, does patching require `add` or `replace`?
   - Recommendation: Use conditional patch: check if `fields['System.Tags']` exists; if missing, use `add`; if present, use `replace`.

2. **Base branch for worktree creation in local dev vs production**
   - What we know: Production uses `origin/main`. In local dev/testing, git remote might not be set or could be `master`.
   - Recommendation: Fall back to `HEAD` if `origin/main` is not resolvable in the local git repository.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Core runtime | ✓ | 24.0.2 [VERIFIED: host environment] | — |
| Git CLI | Worktree isolation | ✓ | 2.53.0.windows.2 [VERIFIED: host environment] | — |
| SQLite / C++ bindings | Persistence (`better-sqlite3`) | ✓ | 13.0.3 [VERIFIED: package.json] | — |
| `execa` | Process runner | ✓ (npm) | 10.0.1 [VERIFIED: npm registry] | Node `child_process.spawn` |
| `simple-git` | Git wrapper | ✓ (npm) | 3.36.0 [VERIFIED: npm registry] | Node `child_process` git exec |
| `@modelcontextprotocol/sdk` | MCP server | ✓ (npm) | 1.30.0 [VERIFIED: npm registry] | In-memory tool map |
| `@ai-sdk/mcp` | MCP tool bridge | ✓ (npm) | 2.0.45 [VERIFIED: npm registry] | Direct Vercel AI SDK `tool()` |

**Missing dependencies with no fallback:**
- None. All required dependencies are available on the host or in npm registry.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.0 [VERIFIED: package.json] |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/worktree.test.ts tests/runner.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SAND-01 | Ephemeral worktree created at `.worktrees/ticket-{id}-{slug}`, branch `task/ticket-{id}-{slug}`, test files set `0o444`, cleaned on completion, 2h prune | unit / integration | `npx vitest run tests/worktree.test.ts` | ❌ Wave 0 |
| SAND-02 | Execa runs parameterized commands (`shell: false`), scrubs credentials from env/logs, terminates on 120s timeout, truncates output at 50KB | unit / integration | `npx vitest run tests/runner.test.ts` | ❌ Wave 0 |
| DISP-01 | Dynamic MCP tool registry resolves `frontend`, `backend`, `infra` tags, mounts common tools, enforces <=12 tool guardrail with 1-sentence descriptions | unit | `npx vitest run tests/mcp-registry.test.ts` | ❌ Wave 0 |
| PLAN-01 | Agent formulates implementation plan, detects ambiguities, formats `[Plan Q&A]` comment, tags work item `[awaiting-input]` | unit / integration | `npx vitest run tests/planner.test.ts` | ❌ Wave 0 |
| PLAN-02 | Worktree released on Q&A, state stored in `plan_checkpoints`, resumed on non-bot comment webhook, answers incorporated, plan locked, 24h/72h watchdog | unit / integration | `npx vitest run tests/plan-checkpoint.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/<relevant-test>.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** All tests green before phase completion.

### Wave 0 Gaps
- [ ] `tests/worktree.test.ts` — covers `SAND-01` (worktree creation, test protection, cleanup, orphan prune)
- [ ] `tests/runner.test.ts` — covers `SAND-02` (execa timeouts, env scrubbing, secret redaction, 50KB buffer truncate)
- [ ] `tests/mcp-registry.test.ts` — covers `DISP-01` (tag resolver, MCP tool registration, 12-tool cap)
- [ ] `tests/planner.test.ts` — covers `PLAN-01` (plan generation, ambiguity questions, ADO comment formatting)
- [ ] `tests/plan-checkpoint.test.ts` — covers `PLAN-02` (checkpoint lifecycle, worktree release, webhook resumption, watchdog)
- [ ] Install missing dependencies: `npm install simple-git@^3.36.0 execa@^10.0.1 @modelcontextprotocol/sdk@^1.30.0 @ai-sdk/mcp@^2.0.45`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Azure DevOps HMAC webhook signature verification + PAT authorization. |
| V4 Access Control | yes | Ephemeral git worktree boundary; test files locked with `0o444` read-only permissions. |
| V5 Input Validation | yes | Zod schemas for all tool parameters, MCP tool definitions, and ticket inputs. |
| V6 Cryptography | yes | Constant-time comparison (`timingSafeEqual`) for HMAC tokens; cryptographically random slugs. |
| V14 Configuration | yes | Strict environment variable filtering scrubbing `*PAT*`, `*API_KEY*`, `*TOKEN*`, `*SECRET*`. |

### Known Threat Patterns for Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Subprocess Command Injection | Tampering / Elevation of Privilege | Enforce `shell: false` and strictly parameterized argument arrays in `execa`. |
| Credential Leakage in Subprocess Logs | Information Disclosure | Filter child process `env` via strict allowlist; redact PATs and tokens from `stdout`/`stderr` via regex replace. |
| Malicious Test File Modification | Tampering | Recursively mark test files `0o444` read-only before agent execution; fail pre-PR verification if tests modified. |
| Infinite Loop / Resource Starvation | Denial of Service | Enforce 120s hard timeout with `SIGTERM` followed by `forceKillAfterDelay: 2000` (`SIGKILL`); cap output buffer at 50KB. |
| Webhook Loop from Plan Q&A Comments | Denial of Service | Append `<!-- [automated-agent] -->` to all posted comments; filter in `isBotEcho`. |

---

## Sources

### Primary (HIGH confidence)
- `execa` GitHub & Context7 Documentation (`/sindresorhus/execa`) — [VERIFIED: npm registry 10.0.1]
- `@modelcontextprotocol/sdk` TypeScript Documentation (`/websites/ts_sdk_modelcontextprotocol_io_v2`) — [VERIFIED: npm registry 1.30.0]
- `@ai-sdk/mcp` Vercel AI SDK Documentation (`/websites/ai-sdk_dev`) — [VERIFIED: npm registry 2.0.45]
- `simple-git` Documentation (`simple-git` 3.36.0) — [VERIFIED: npm registry 3.36.0]
- Azure DevOps Services REST API Reference (v7.1) — Work Item Tracking & Comments
- Local host environment (`node v24.0.2`, `git 2.53.0.windows.2`) — [VERIFIED: host environment]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified on npm registry and compatible with Node 24 ESM.
- Architecture: HIGH — decouples long-running human alignment from sandbox execution via SQLite state machine.
- Pitfalls: HIGH — addressed Windows worktree paths, secret scrubbing, test file tampering, and webhook feedback loops.

**Research date:** 2026-09-08  
**Valid until:** 2026-10-08 (30 days)
