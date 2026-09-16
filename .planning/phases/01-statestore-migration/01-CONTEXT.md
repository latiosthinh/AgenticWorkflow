# Phase 1: StateStore Migration - Context

**Gathered:** 2026-09-16
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase detected)

<domain>
## Phase Boundary

v1.0's SQLite/Drizzle persistence is fully replaced by the file-backed `StateStore` — per-ticket markdown+frontmatter files, atomic `wx` dedup, lane-enforced single-writer, crash-atomic writes, v1.0 behavioral parity, and the whole 277-test suite green on a per-test `mkdtemp` harness — with `better-sqlite3`/`drizzle-orm`/`drizzle-kit` gone from `package.json`.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.
- File-backed StateStore under `data/state/tickets/<id>.md` with structured frontmatter and markdown body notes.
- Atomic ingress deduplication using atomic `wx` marker files in `data/state/dedup/<id>-<rev>`.
- Crash-atomic file updates via temp file + atomic rename (rm-then-rename on Windows).
- Lane-serialized ticket writes via `workItemQueueManager.getLane(id)`.
- Watchdog scan via `readdir` + frontmatter parser.
- Full 277 test suite ported from in-memory SQLite to `mkdtemp` file store.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/queue/lane-manager.ts` — concurrency: 1 per work item queue lane
- `src/ingress/routes.ts` — webhook ingress handler and dedup entry point
- `src/db/` — existing schema and db module to be replaced by `src/state/`

### Established Patterns
- Fastify routes, Zod validation, execa subprocess execution, simple-git operations.

### Integration Points
- `src/db/` replacement with `src/state/` across all workers (`src/auditor/worker.ts`, `src/execute/`, `src/qa/`, `src/deploy/`, `src/learn/`).

</code_context>

<specifics>
## Specific Ideas

No specific UI requirements — pure infrastructure migration. Full parity with v1.0 behavior.

</specifics>

<deferred>
## Deferred Ideas

- STORE-01: Multi-instance shared network store (Postgres) deferred to enterprise.

</deferred>
