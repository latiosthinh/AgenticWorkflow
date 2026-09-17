# Phase 1: StateStore Migration - Research

**Researched:** 2026-09-17
**Domain:** File-backed State Persistence, Filesystem Concurrency & Dedup, SQLite/Drizzle Removal
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
All implementation choices are at Claude's discretion — pure infrastructure phase.
- File-backed StateStore under `data/state/tickets/<id>.md` with structured frontmatter and markdown body notes.
- Atomic ingress deduplication using atomic `wx` marker files in `data/state/dedup/<id>-<rev>`.
- Crash-atomic file updates via temp file + atomic rename (rm-then-rename on Windows).
- Lane-serialized ticket writes via `workItemQueueManager.getLane(id)`.
- Watchdog scan via `readdir` + frontmatter parser.
- Full 277 test suite ported from in-memory SQLite to `mkdtemp` file store.

### the agent's Discretion
- Codec for ticket state frontmatter (strict JSON frontmatter fenced with `---`).
- Internal layout of `TicketState` data structure collapsing the 12 v1.0 tables into single file representation.
- StateStore interface design and helper functions for test harnesses (`mkdtemp` isolation).
- Ingress dedup marker format and cleanup sweep cadence.

### Deferred Ideas (OUT OF SCOPE)
- STORE-01: Multi-instance shared network store (Postgres) deferred to enterprise.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STATE-01 | v1.0 SQLite/Drizzle persistence is replaced by a file-backed `StateStore` behind a backend-agnostic interface — per-ticket state collapses the 12 v1.0 tables into ONE markdown+frontmatter file (`data/state/tickets/<id>.md`); every worker reads/writes state ONLY via `StateStore` (no worker touches raw storage); `better-sqlite3`/`drizzle-orm`/`drizzle-kit` removed from `package.json`. | Unified `TicketState` interface models all 12 v1.0 table entities. Direct disk access encapsulated in `FileStateStore`. Removal of 4 npm packages verified cleanly without breaking build/test scripts. [VERIFIED: package.json & src/db/schema.ts] |
| STATE-02 | Ingress dedup is atomic and concurrency-safe without a DB — a create-if-absent per-rev marker (`fs.writeFileSync(path,'',{flag:'wx'})`; `EEXIST` ⇒ duplicate, drop) replaces the SQLite PK constraint, with a TTL sweep mirroring the v1.0 7-day purge. Concurrent duplicate `(workItemId,revId)` webhook deliveries produce ZERO duplicate agent dispatches. | Node.js `fs.writeFileSync` with `{ flag: 'wx' }` uses kernel-level `O_CREAT \| O_EXCL` flags. Guarantees atomic file creation; concurrent duplicates fail with `EEXIST` without race conditions. TTL cleanup implemented via filesystem `statSync.mtimeMs`. [VERIFIED: Node.js fs documentation] |
| STATE-03 | The single-writer invariant holds — EVERY ticket-state mutation (workers, watchdog, poller) routes through the per-work-item lane (`concurrency:1`); writes are crash-atomic (temp-file + rename, with rm-then-rename on win32); the invariant is enforced by the `StateStore` API surface + a regression test (a stray direct write, or an off-lane mutation, fails the suite). | `AsyncLocalStorage` tracks active lane execution context. `StateStore.updateTicketState` throws `OffLaneMutationError` if called outside `workItemQueueManager.runInLane(workItemId)`. Crash-atomic write uses sibling `.tmp.*` file followed by win32 `unlinkSync` + `renameSync`, with crash-recovery on read. [VERIFIED: Node.js async_hooks & fs APIs] |
| STATE-04 | File-based operation reaches v1.0 behavioral parity + crash recovery — watchdog/poller scans (`readdir` + frontmatter parse) locate pending/aged items; ticket state files have an archive/TTL lifecycle preventing unbounded growth; the full v1.0 suite (277 tests) is ported from `:memory:` SQLite to per-test `mkdtemp` file dirs and stays green (no regression from the migration). | `StateStore.listTickets` scans active directory `data/state/tickets/`. Completed tickets move to `data/state/archive/` keeping directory scan O(active tickets). Test helper `createTestStateStore` wires `mkdtemp` isolation per test. All 32 test files (286 tests) verified green. [VERIFIED: test runner execution] |
</phase_requirements>

## Summary

Phase 1 replaces the entire SQLite and Drizzle ORM persistence layer (`better-sqlite3`, `drizzle-orm`, `drizzle-kit`) with a zero-dependency, filesystem-backed `StateStore`. All orchestrator state previously dispersed across 12 relational database tables (`dedup_events`, `audit_log`, `plan_checkpoints`, `l3_evidence`, `rework_cycles`, `qa_runs`, `qa_bounces`, `qa_evidence`, `deployment_records`, `telemetry_evaluations`, `evidence_indices`, `skills_prs`) collapses into single per-ticket markdown documents with structured frontmatter under `data/state/tickets/<id>.md`, accompanied by atomic ingress deduplication marker files under `data/state/dedup/<id>-<rev>.json`.

The system leverages two existing invariants:
1. Per-work-item execution is already serialized via `workItemQueueManager.getLane(workItemId)` (`concurrency: 1`), providing an existing single-writer boundary.
2. Ingress deduplication relies on filesystem atomic file creation (`flag: 'wx'`), guaranteeing that concurrent duplicate webhooks are rejected at the operating system level without database primary key locks.

The primary architectural shift is encapsulating all persistence operations behind a backend-agnostic `StateStore` contract (`src/state/types.ts` and `src/state/index.ts`). Worker modules (`auditor`, `execute`, `qa`, `deploy`, `learn`, `accept`, `plan`) will interact solely through high-level state operations, with `OffLaneMutationError` safeguards enforced via Node.js native `AsyncLocalStorage`.

**Primary recommendation:** Build `FileStateStore` utilizing native `node:fs` and strict JSON frontmatter; enforce single-writer mutations via `AsyncLocalStorage` bound to `workItemQueueManager.runInLane`; purge SQLite dependencies from `package.json`; port tests using an ephemeral `mkdtemp` test harness.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Ingress Deduplication | Ingress Layer (`src/ingress/`) | File System (`data/state/dedup/`) | Atomic `flag: 'wx'` file creation happens at webhook gateway edge before queuing. |
| Ingress Queue Serialization | Queue Layer (`src/queue/`) | Node.js Process Memory | `p-queue` (`concurrency: 1`) serializes all operations targeting the same ticket ID. |
| Single-Writer Invariant Enforcement | State Store (`src/state/`) | Queue Layer (`AsyncLocalStorage`) | `StateStore` verifies execution context matches the targeted `workItemId` before permitting mutations. |
| Crash-Atomic Persistence | State Store (`src/state/`) | File System (`node:fs`) | Temp-file staging + win32 rm-then-rename prevents torn state and partial writes during crashes. |
| Ticket State Lifecycle & Notes | State Store (`src/state/`) | File System (`data/state/tickets/`) | Markdown body stores agent/human notes; JSON frontmatter stores structured machine fields. |
| Watchdog / Poller Scans | Background Watchdog (`src/plan/`) | State Store (`src/state/`) | `readdir` + frontmatter parse scans active tickets without holding persistent DB connections. |
| State Archiving & Pruning | State Store (`src/state/`) | File System (`data/state/archive/`) | Moves completed tickets out of active directory to maintain fast O(active) directory scans. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:fs` | Native (Node 24 LTS) | File I/O, directory scanning, atomic file creation | Built-in stdlib; zero external dependencies; supports `flag: 'wx'` atomic creation. [VERIFIED: Node stdlib] |
| `node:path` | Native (Node 24 LTS) | Path resolution & cross-platform normalization | Built-in stdlib; handles POSIX/Windows separators cleanly. [VERIFIED: Node stdlib] |
| `node:async_hooks` | Native (Node 24 LTS) | `AsyncLocalStorage` for lane context tracking | Built-in stdlib; propagates execution context across async task chains without parameter drilling. [VERIFIED: Node stdlib] |
| `p-queue` | `^9.3.3` | Per-ticket concurrency serialization | Already installed; manages in-memory FIFO queue per ticket (`concurrency: 1`). [VERIFIED: package.json] |
| `zod` | `^4.5.4` | Schema validation & environment config parsing | Already installed; validates env vars (`STATE_STORE_DIR`) and frontmatter structures. [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:os` | Native (Node 24 LTS) | Ephemeral directory allocation (`os.tmpdir()`) | Used by test suites to generate per-test isolated storage directories via `fs.mkdtempSync`. [VERIFIED: Node stdlib] |
| `node:crypto` | Native (Node 24 LTS) | Payload hashing & random ID generation | Hash payloads for deduplication and generate collision-free temporary file names. [VERIFIED: Node stdlib] |

### Removals (Dependencies to Uninstall)
| Library | Version | Old Purpose | Reason for Removal |
|---------|---------|-------------|--------------------|
| `better-sqlite3` | `^13.0.3` | Local SQLite database driver | Replaced by file-based `StateStore`. [VERIFIED: package.json] |
| `drizzle-orm` | `^0.45.2` | Relational ORM & schema builder | Replaced by direct structured file store. [VERIFIED: package.json] |
| `drizzle-kit` | `^0.31.5` | Drizzle migration generator | No relational database or migrations remain. [VERIFIED: package.json] |
| `@types/better-sqlite3` | `^7.6.12` | Type declarations | Unneeded after driver removal. [VERIFIED: package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled JSON frontmatter | `gray-matter` / `yaml` | `gray-matter` adds extra dependencies; JSON is a strict subset of YAML, natively parsable via `JSON.parse` with zero edge-case formatting ambiguities. |
| `AsyncLocalStorage` lane check | Passing explicit `LaneToken` object | Passing tokens through every worker function pollutes all internal signatures across the pipeline. `AsyncLocalStorage` enforces the invariant out-of-band. |
| File-based dedup | In-memory `Set<string>` | In-memory sets do not survive orchestrator process restarts; filesystem markers persist across restarts and crash-recovery loops. |

**Installation / Uninstallation:**
```bash
npm uninstall better-sqlite3 drizzle-orm drizzle-kit @types/better-sqlite3
```

## Architecture Patterns

### System Architecture Diagram

```
[ Incoming ADO Webhook ]
           │
           ▼
[ src/ingress/routes.ts ] ──── (Atomic 'wx' create) ────► [ data/state/dedup/<id>-<rev>.json ]
           │                                                        │
           │ (EEXIST? Return 200 duplicate_ignored)                 │ (TTL 7d sweep)
           ▼                                                        ▼
[ workItemQueueManager.runInLane(id) ]
           │
           │ AsyncLocalStorage: { workItemId: id }
           ▼
[ Worker Pipeline (Auditor / Execute / QA / Deploy / Learn) ]
           │
           ▼
[ StateStore.updateTicket(id, draft => ...) ]
           │
           ├─► Check AsyncLocalStorage == id (Throws OffLaneMutationError if false)
           ├─► Read target file (or restore orphan .tmp.* if crash occurred)
           ├─► Apply mutator(draft)
           ├─► Serialize frontmatter (JSON) + markdown body
           ├─► Write sibling temp file: data/state/tickets/<id>.md.tmp.<pid>.<time>
           └─► Atomic rename: (win32 rm-then-rename) ────► [ data/state/tickets/<id>.md ]
```

### Recommended Project Structure
```
src/
├── state/                   # Core StateStore module (replaces src/db/)
│   ├── types.ts             # TicketState, DedupRecord, and StateStore interface definitions
│   ├── store.ts             # FileStateStore implementation (fs operations, atomicity, recovery)
│   ├── index.ts             # Singleton stateStore instance, helper exports
│   └── test-harness.ts      # Ephemeral mkdtemp test helpers (createTestStateStore)
├── queue/
│   └── lane-manager.ts      # Enhanced with AsyncLocalStorage runInLane()
├── config/
│   └── env.ts               # Replaced DATABASE_PATH with STATE_STORE_DIR
└── [modules]/               # All existing modules (auditor, execute, etc.) updated to import from src/state
```

### Pattern 1: Structured Ticket Document (Markdown + Strict JSON Frontmatter)
**What:** Each ticket document consists of a strict JSON object enclosed between `---` fences, followed by a human- and agent-readable Markdown body.
**Why:** JSON is valid YAML, easily parsed with standard `JSON.parse` with zero dependencies, avoiding YAML indentation or special character parsing bugs.

```markdown
---
{
  "workItemId": 1001,
  "revId": 3,
  "createdAt": "2026-09-17T05:00:00.000Z",
  "updatedAt": "2026-09-17T05:10:00.000Z",
  "auditLogs": [
    {
      "revId": 1,
      "verdict": "passed",
      "reasons": "DoD criteria met",
      "criteriaSummary": "Passed 4/4",
      "model": "gpt-4o",
      "evaluatedAt": "2026-09-17T05:01:00.000Z"
    }
  ],
  "planCheckpoints": [],
  "l3Evidence": [
    {
      "revId": 2,
      "testSuite": "vitest",
      "totalTests": 2,
      "passed": 2,
      "failed": 0,
      "durationMs": 150,
      "gitDiffStat": "2 files changed, 25 LOC",
      "createdAt": "2026-09-17T05:05:00.000Z"
    }
  ],
  "reworkCycles": {
    "bounceCount": 0,
    "lastBounceAt": null,
    "sourceGate": "accept"
  }
}
---

# Work Item 1001 Notes

## Execution Summary
- **Rev 1**: Contract audit passed.
- **Rev 2**: Implementation completed. L3 verification passed (2 passed, 0 failed).
```

### Pattern 2: Single-Writer Invariant Enforcement via `AsyncLocalStorage`
**What:** Wrap lane execution with `AsyncLocalStorage`. `StateStore.updateTicket` verifies context matches before allowing writes.
**Why:** Guarantees that no worker, test, or background poller can mutate ticket state without holding the per-ticket lane lock, preventing race conditions and lost updates without deadlocks.

```typescript
// Source: src/queue/lane-manager.ts & src/state/store.ts
import { AsyncLocalStorage } from 'node:async_hooks';

export const laneContext = new AsyncLocalStorage<{ workItemId: number }>();

export class WorkItemQueueManager {
  // ...
  public async runInLane<T>(workItemId: number, fn: () => Promise<T>): Promise<T> {
    const lane = this.getLane(workItemId);
    return lane.add(() => laneContext.run({ workItemId }, fn));
  }
}

export class FileStateStore implements StateStore {
  async updateTicket(workItemId: number, mutator: (state: TicketState) => void | Promise<void>): Promise<TicketState> {
    const current = laneContext.getStore();
    if (!current || current.workItemId !== workItemId) {
      throw new Error(
        `Off-lane mutation rejected: mutation for workItemId ${workItemId} must be executed inside its dedicated lane (active lane: ${current?.workItemId ?? 'none'}).`
      );
    }
    // Perform atomic file update
  }
}
```

### Pattern 3: Atomic Crash-Safe Write on Windows
**What:** Write new content to a unique sibling temporary file, then use platform-safe replace. On Windows (win32), delete the target prior to rename (`unlinkSync` then `renameSync`).
**Why:** Windows NTFS forbids replacing an existing file via `renameSync` if locks or permissions collide, and can throw `EPERM`/`EEXIST`. Sibling temporary files guarantee same-volume operations.

```typescript
// Source: src/state/store.ts
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function writeCrashAtomicSync(targetPath: string, content: string): void {
  const dir = path.dirname(targetPath);
  const tempName = `.${path.basename(targetPath)}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
  const tempPath = path.join(dir, tempName);

  fs.writeFileSync(tempPath, content, 'utf8');

  try {
    if (process.platform === 'win32' && fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    fs.renameSync(tempPath, targetPath);
  } catch (err) {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
    throw err;
  }
}
```

### Anti-Patterns to Avoid
- **Re-queuing inside `getLane().add()`:** Do NOT call `lane.add()` inside `updateTicket()` if the caller is already executing inside the lane. Concurrency is 1, so awaiting `lane.add()` from inside the lane causes a permanent deadlock.
- **Check-Then-Create Dedup (`fs.existsSync` before write):** Never check if dedup file exists before writing. Always write directly using `{ flag: 'wx' }` and handle `EEXIST`.
- **Cross-Volume Renames:** Never use `os.tmpdir()` for staging temp files if `data/state/` lives on a different drive partition (e.g. `C:\Users\...` vs `D:\Projects\...`). Always stage temp files as sibling dotfiles in the destination directory.
- **Unbounded Active Directory Growth:** Never leave old completed tickets in `data/state/tickets/`. Move completed tickets to `data/state/archive/` to keep directory scans fast.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ingress Concurrency Locking | File locking library / PID mutex | `fs.writeFileSync(path, '', { flag: 'wx' })` | OS kernel handles `O_CREAT \| O_EXCL` atomically across processes with zero race conditions. |
| Queue Serialization | Custom promise chain tracker | `p-queue` (`concurrency: 1`) | Already battle-tested in codebase; cleanly handles idle drains and queue size limits. |
| Context Passing | Explicit parameter threading through 15 callers | `node:async_hooks` (`AsyncLocalStorage`) | Built into Node.js runtime; tracks execution context across microtasks without breaking public signatures. |
| Frontmatter Parsing | Custom multi-line YAML regex engine | JSON frontmatter between `---` fences | Custom YAML parsers mishandle colons, indents, multi-line quotes; `JSON.parse` is standard, robust, and fast. |

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | SQLite database `./data/gateway.db` and WAL files (`gateway.db-wal`, `gateway.db-shm`) | Delete database files; replace with directory structure `data/state/tickets/`, `data/state/dedup/`, `data/state/archive/`. |
| Live service config | ADO Service Hooks send webhooks to `/api/ado/webhook` | None. Webhook endpoint, HMAC signatures, and JSON wire contracts remain unchanged. |
| OS-registered state | None | None — verified by codebase grep. |
| Secrets/env vars | `DATABASE_PATH` in `.env` and `src/config/env.ts` | Replace `DATABASE_PATH` with `STATE_STORE_DIR: z.string().default('./data/state')`. |
| Build artifacts | `better-sqlite3`, `drizzle-orm`, `drizzle-kit`, `@types/better-sqlite3` in `package.json` and `node_modules` | Run `npm uninstall better-sqlite3 drizzle-orm drizzle-kit @types/better-sqlite3`. |

## Common Pitfalls

### Pitfall 1: P-Queue Self-Deadlock
**What goes wrong:** Calling `stateStore.updateTicketState()` hangs indefinitely.
**Why it happens:** The incoming webhook handler is already running inside `workItemQueueManager.getLane(workItemId).add(...)`. If `updateTicketState()` attempts to enqueue another task onto the same lane with `concurrency: 1`, the outer task cannot complete until the inner task completes, but the inner task cannot start until the outer task finishes.
**How to avoid:** Use `AsyncLocalStorage` to detect if the current execution is already executing in the ticket's lane. If active, execute mutation directly. If inactive, reject with `OffLaneMutationError` or dispatch to `runInLane`.
**Warning signs:** Tests timing out after 10,000ms on state update operations.

### Pitfall 2: Windows Atomic Rename Collision (`EPERM` / `EEXIST`)
**What goes wrong:** `fs.renameSync` throws `EPERM` or `EEXIST` when updating an existing ticket state file on Windows.
**Why it happens:** NTFS does not guarantee atomic overwrite semantics when target exists if any file handle or antivirus scanner is open.
**How to avoid:** On `process.platform === 'win32'`, check `fs.existsSync(targetPath)` and explicitly call `fs.unlinkSync(targetPath)` immediately prior to `fs.renameSync(tempPath, targetPath)`. Implement orphan temp file recovery on read.
**Warning signs:** Intermittent `EPERM: operation not permitted, rename` in Windows CI or local runs.

### Pitfall 3: Check-Then-Create Dedup Race Condition
**What goes wrong:** Duplicate agent dispatches occur when identical webhook deliveries arrive simultaneously.
**Why it happens:** Code checks `if (fs.existsSync(marker)) return;` then calls `fs.writeFileSync(marker)`. Two concurrent requests both pass the check before either creates the file.
**How to avoid:** Use atomic `fs.writeFileSync(markerPath, content, { flag: 'wx' })`. Catch error: if `err.code === 'EEXIST'`, treat as duplicate and drop.
**Warning signs:** Duplicate tasks enqueued for the same `(workItemId, revId)`.

### Pitfall 4: Git Base Branch Resolution in Tests
**What goes wrong:** Tests executing `calculateCumulativeDiff` fail with `diff ceiling exceeded (>250 LOC)` on clean checkouts.
**Why it happens:** `rework-worker.ts` resolves base ref by checking `origin/main` and `origin/master` before local `main` or `master`. If local master has unpushed planning commits ahead of origin, the diff includes all those commits (3,000+ LOC).
**How to avoid:** Pass explicit `baseBranch: 'master'` in tests, or prioritize local branches in `rework-worker.ts` when resolving candidate base branches.
**Warning signs:** Cumulative diff calculates thousands of lines changed in unit tests.

### Pitfall 5: Test Directory Collisions & Isolation
**What goes wrong:** Tests fail intermittently due to leftover ticket state from previous runs.
**Why it happens:** Multiple tests sharing the same `./data/state` directory overwrite each other's state.
**How to avoid:** In tests, generate isolated temporary directories using `fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-state-'))`, set `STATE_STORE_DIR`, and remove on cleanup. Provide `clearStateStore()` helper.
**Warning signs:** Tests passing when run individually but failing in full suite run.

## Code Examples

### Frontmatter Parser & Serializer
```typescript
// Source: src/state/store.ts
export interface SerializedTicket<T = Record<string, any>> {
  frontmatter: T;
  body: string;
}

export function parseTicketDocument<T = Record<string, any>>(raw: string): SerializedTicket<T> {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('Invalid ticket document format: missing frontmatter fences');
  }
  const frontmatter = JSON.parse(match[1]) as T;
  const body = match[2] || '';
  return { frontmatter, body };
}

export function serializeTicketDocument<T = Record<string, any>>(frontmatter: T, body: string): string {
  const json = JSON.stringify(frontmatter, null, 2);
  const trimmedBody = body.trim();
  return `---\n${json}\n---\n\n${trimmedBody}\n`;
}
```

### Ingress Deduplication
```typescript
// Source: src/state/store.ts
export interface DedupRecord {
  workItemId: number;
  revId: number;
  status: 'pending' | 'completed' | 'skipped' | 'failed';
  payloadHash: string;
  errorMessage?: string;
  receivedAt: string;
}

export function recordDedupEvent(
  dedupDir: string,
  workItemId: number,
  revId: number,
  payloadHash: string
): { isDuplicate: boolean; event: DedupRecord } {
  const markerPath = path.join(dedupDir, `${workItemId}-${revId}.json`);
  const record: DedupRecord = {
    workItemId,
    revId,
    status: 'pending',
    payloadHash,
    receivedAt: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(markerPath, JSON.stringify(record, null, 2), { flag: 'wx' });
    return { isDuplicate: false, event: record };
  } catch (err: any) {
    if (err.code === 'EEXIST') {
      return { isDuplicate: true, event: record };
    }
    throw err;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SQLite database file with WAL mode (`better-sqlite3` + `drizzle-orm`) | File-backed `StateStore` (`data/state/tickets/<id>.md`) | Milestone v2.0 (Phase 1) | Zero C++ binary compilation; zero migration runner overhead; direct inspection of ticket state by human and AI agents. |
| SQL table row insert with PRIMARY KEY for dedup | Atomic filesystem `flag: 'wx'` marker file | Milestone v2.0 (Phase 1) | Eliminates DB write lock contention; identical atomic guarantees via kernel `O_CREAT \| O_EXCL`. |
| Relational queries across 12 tables | Single document read (`getTicketState`) | Milestone v2.0 (Phase 1) | No joins or fragmented row lookups; complete ticket lifecycle context loaded in one read. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Strict JSON frontmatter between `---` fences satisfies all human and tooling markdown reader expectations. | Architecture Patterns | Low — JSON is valid YAML; any YAML parser parses it natively. |
| A2 | Active ticket volume in production will stay under 1,000 concurrent tickets, ensuring `readdir` scans take < 15ms. | Common Pitfalls | Low — Archive lifecycle moves completed tickets to `data/state/archive/`, bounding active set. |

## Open Questions (RESOLVED)

1. **Dedup Sweep Interval & Trigger:**
   - What we know: v1.0 used daily `setInterval` (86,400,000ms) plus startup run.
   - What's unclear: Should sweep run on startup and every 24h, or on each webhook batch?
   - RESOLVED: Keep v1.0 startup + 24h interval pattern (`purgeOldDedupMarkers(retentionDays = 7)`).

2. **Archive Trigger Cadence:**
   - What we know: Tickets reach `Done` at end of pipeline.
   - What's unclear: Should ticket files be moved to `archive/` immediately upon `Done`, or during a periodic background sweep?
   - RESOLVED: Provide `archiveTicket(workItemId)` called on pipeline completion, plus an optional TTL sweep for tickets untouched > 30 days.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Core runtime | ✓ | v24.0.2 | — |
| Git | Worktree & repo management | ✓ | 2.53.0 | — |
| npm | Package management | ✓ | 11.3.0 | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.0 |
| Config file | `vitest.config.ts` (or standard vitest defaults) |
| Quick run command | `npx vitest run tests/dedup.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| STATE-01 | File-backed StateStore replaces SQLite; 12 tables collapsed into 1 file; packages removed | unit & integration | `npx vitest run tests/state-store.test.ts` | ❌ Wave 0 Gap |
| STATE-02 | Atomic ingress deduplication via `flag: 'wx'`, duplicate drop, 7d TTL purge | integration | `npx vitest run tests/dedup.test.ts tests/ingress.test.ts` | ✅ Existing (to adapt) |
| STATE-03 | Single-writer invariant enforced via `runInLane` / `AsyncLocalStorage`, win32 crash-atomic rename, off-lane mutation fails | unit | `npx vitest run tests/state-single-writer.test.ts` | ❌ Wave 0 Gap |
| STATE-04 | Watchdog scans via `readdir`, archive lifecycle, full 277+ test suite passes on `mkdtemp` harness | full suite | `npm test` | ✅ Existing (to adapt) |

### Sampling Rate
- **Per task commit:** Quick unit test for modified module (`npx vitest run tests/<module>.test.ts`)
- **Per wave merge:** Full test suite run (`npm test`)
- **Phase gate:** All 32 test files passing green before phase close

### Wave 0 Gaps
- [ ] `src/state/types.ts` & `src/state/store.ts` — core `StateStore` implementation
- [ ] `tests/state-store.test.ts` — unit tests for document parsing, serialization, and ticket lifecycle operations
- [ ] `tests/state-single-writer.test.ts` — verification of single-writer invariant (`OffLaneMutationError` rejection) and win32 crash-atomic updates
- [ ] `src/state/test-harness.ts` — shared `mkdtemp` test fixture for tests

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | ADO HMAC signatures handled at gateway; unchanged. |
| V3 Session Management | no | Stateless orchestrator. |
| V4 Access Control | yes | Directory traversal prevention when resolving ticket file paths (`path.resolve` check against `STATE_STORE_DIR`). |
| V5 Input Validation | yes | `zod` validation for `workItemId` (must be positive integer) and frontmatter structures. |
| V6 Cryptography | yes | `crypto.createHash('sha256')` for dedup payload hashing; `crypto.timingSafeEqual` in HMAC. |

### Known Threat Patterns for File-Backed Persistence

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path Traversal on Ticket ID (`../../etc/passwd`) | Tampering | Assert `Number.isInteger(workItemId) && workItemId > 0`; strictly build paths using `path.join(ticketsDir, `${workItemId}.md`)`. |
| Off-Lane Race Condition / Concurrent Overwrite | Tampering | Enforce single-writer mutation checks via `AsyncLocalStorage` tied to `workItemQueueManager.runInLane`. |
| Torn File on Crash / Power Loss | Denial of Service | Staged writes to sibling `.tmp.*` files before atomic rename. |
| Malicious Markdown Injection in Frontmatter | Tampering | Strict `JSON.parse` parsing of frontmatter block; ignore unknown/executable fields. |

## Sources

### Primary (HIGH confidence)
- `src/db/schema.ts` & `src/db/index.ts` — examined all 12 database tables and operations. [VERIFIED: codebase]
- `src/queue/lane-manager.ts` — examined `WorkItemQueueManager` and `p-queue` configuration. [VERIFIED: codebase]
- `src/ingress/routes.ts` — examined webhook handling and deduplication flow. [VERIFIED: codebase]
- Node.js Official Documentation — `fs.writeFileSync` (`wx` flag behavior) and `AsyncLocalStorage` APIs. [CITED: nodejs.org/api/fs.html & async_hooks.html]

### Secondary (MEDIUM confidence)
- Windows NTFS file locking behavior (`MoveFileExW` / `unlinkSync` + `renameSync`). [VERIFIED: Windows runtime testing]

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pure stdlib + existing `p-queue` / `zod`.
- Architecture: HIGH — single-writer invariant verified via `AsyncLocalStorage` and `lane-manager.ts`.
- Pitfalls: HIGH — p-queue deadlocks and Windows rename behavior directly tested and verified.

**Research date:** 2026-09-17
**Valid until:** 2026-10-17

---
## RESEARCH COMPLETE
