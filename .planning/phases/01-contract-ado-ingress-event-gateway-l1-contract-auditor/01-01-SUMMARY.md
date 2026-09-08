---
phase: 01-contract-ado-ingress-event-gateway-l1-contract-auditor
plan: 01
subsystem: ingress
tags:
  - fastify
  - hmac
  - sqlite
  - deduplication
  - bot-shield
  - p-queue
dependency_graph:
  requires: []
  provides:
    - Fastify HMAC webhook ingress endpoint (/api/ado/webhook)
    - SQLite WAL deduplication store with 7-day retention sweep
    - Timing-safe HMAC SHA256 verification with length checks
    - Bot echo shield filtering automated agent events
    - Per-work-item p-queue serialization lane manager
    - Local dev ingress helper (cloudflared tunnel & WIQL poller)
  affects:
    - 01-02 (L1 contract auditor will process enqueued events)
    - 01-03 (ADO client will post comments with automated-agent marker)
tech_stack:
  added:
    - fastify@^5.12.3
    - fastify-raw-body@^6.0.1
    - better-sqlite3@^13.0.3
    - drizzle-orm@^0.45.2
    - zod@^4.5.4
    - p-queue@^9.3.3
    - vitest@^5.0.0
    - typescript@^7.0.2
  patterns:
    - Raw body HMAC SHA256 timing-safe verification
    - SQLite composite primary key (workItemId, revId) atomic deduplication
    - Per-work-item serialization queue via p-queue (concurrency 1)
key_files:
  created:
    - package.json
    - tsconfig.json
    - vitest.config.ts
    - src/config/env.ts
    - src/db/schema.ts
    - src/db/index.ts
    - src/ingress/hmac.ts
    - src/ingress/bot-shield.ts
    - src/ingress/routes.ts
    - src/ingress/poller.ts
    - src/queue/lane-manager.ts
    - tests/dedup.test.ts
    - tests/bot-shield.test.ts
    - tests/ingress.test.ts
  modified: []
decisions:
  - "Configured SQLite in WAL mode with synchronous=NORMAL for concurrent non-blocking reads and sub-millisecond writes"
  - "Configured 7-day TTL cleanup function for dedup_events to prevent unbounded table growth"
  - "Guarded crypto.timingSafeEqual with explicit buffer length check to prevent RangeError crashes on malformed signatures"
  - "Employed per-work-item concurrency=1 p-queue lanes to serialize rapid revisions on the same ticket without Redis"
metrics:
  duration: 6m
  completed_date: "2026-09-08"
  tasks: 3
  files: 14
---

# Phase 01 Plan 01: Greenfield Ingress, Persistence & Idempotency Gateway Summary

Substantive achievement: Established hardened, timing-safe HMAC SHA256 Fastify webhook ingress with SQLite WAL composite primary key deduplication, bot feedback loop prevention, and per-work-item p-queue serialization.

## Key Changes

1. **Project Scaffolding & Configuration:**
   - Initialized Node.js 24 LTS ESM project with TypeScript 7, Vitest 5, Fastify 5, and Drizzle ORM.
   - Built strict runtime Zod schema (`EnvSchema`) in `src/config/env.ts` validating ADO credentials, webhook secret, database path, and OpenAI API key.

2. **Database Persistence & Deduplication:**
   - Defined `dedup_events` and `audit_log` tables in `src/db/schema.ts` using Drizzle ORM with composite primary key `(work_item_id, rev_id)`.
   - Initialized `better-sqlite3` in WAL mode (`journal_mode = WAL`, `synchronous = NORMAL`) with automated table creation on boot.
   - Implemented `purgeOldDedupEvents(retentionDays = 7)` deleting historical events older than 7 days.

3. **Cryptographic Verification & Bot Loop Prevention:**
   - Implemented `verifyHmac` in `src/ingress/hmac.ts` using Node.js `crypto.timingSafeEqual` with explicit buffer length guards against timing side-channel attacks and RangeError crashes.
   - Built `isBotEcho` in `src/ingress/bot-shield.ts` detecting matching bot identity GUIDs and `[automated-agent]` markers in update history.

4. **Fastify Webhook Ingress & Queue Lanes:**
   - Created POST `/api/ado/webhook` route in `src/ingress/routes.ts` with `fastify-raw-body` plugin.
   - Rejects missing/invalid HMAC signatures with HTTP 401.
   - Drops duplicate deliveries via SQLite `SQLITE_CONSTRAINT_PRIMARYKEY` with HTTP 200 `duplicate_ignored`.
   - Drops bot echo loops with HTTP 200 `bot_echo_ignored`.
   - Acknowledges valid new events in <100ms with HTTP 202 `accepted`.
   - Created `WorkItemQueueManager` in `src/queue/lane-manager.ts` serializing execution per `workItemId` using `p-queue` with `concurrency: 1`.
   - Built `src/ingress/poller.ts` providing local development tunneling (`cloudflared`) and WIQL fallback polling.

## Verification Results

Full automated test suite executed via `npx vitest run`:
- `tests/dedup.test.ts`: 3 tests passed (atomic insert, duplicate primary key constraint, 7-day retention purge).
- `tests/bot-shield.test.ts`: 9 tests passed (valid signature, tampered body, wrong secret, buffer length mismatch, bot ID match, automated-agent marker, human edits).
- `tests/ingress.test.ts`: 7 tests passed (missing HMAC 401, invalid HMAC 401, valid HMAC 202 + DB insert, duplicate delivery 200 duplicate_ignored, bot echo 200 bot_echo_ignored, queue lane concurrency 1).
- Type check: `npx tsc --noEmit` passed with 0 errors.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: package.json
- FOUND: tsconfig.json
- FOUND: vitest.config.ts
- FOUND: src/config/env.ts
- FOUND: src/db/schema.ts
- FOUND: src/db/index.ts
- FOUND: src/ingress/hmac.ts
- FOUND: src/ingress/bot-shield.ts
- FOUND: src/ingress/routes.ts
- FOUND: src/ingress/poller.ts
- FOUND: src/queue/lane-manager.ts
- FOUND: tests/dedup.test.ts
- FOUND: tests/bot-shield.test.ts
- FOUND: tests/ingress.test.ts
- FOUND commit b26c312: feat(01-01): project scaffolding, environment config, and SQLite deduplication store
- FOUND commit 83162d3: feat(01-01): timing-safe HMAC SHA256 verification and bot echo shield
- FOUND commit ed2b80c: feat(01-01): Fastify ingress route, concurrency queue lanes, and local poller bridge
