---
phase: 01-contract-ado-ingress-event-gateway-l1-contract-auditor
verified: 2026-09-08T13:20:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Live Azure DevOps Service Hook Delivery"
    expected: "Inbound webhook from live ADO organization accepted with HTTP 202 and queued for evaluation"
    why_human: "Requires active ADO project, public endpoint reachability (or Cloudflare Tunnel), and real ADO service hook subscription credentials"
  - test: "Azure Boards Discussion UI Rendering"
    expected: "HTML comment renders formatted [L1 Evidence] badge, criteria checklist, and preserves hidden [automated-agent] marker tag"
    why_human: "Visual styling and layout fidelity in Azure DevOps Boards web interface cannot be validated headlessly"
---

# Phase 1: CONTRACT — ADO Ingress, Event Gateway & L1 Contract Auditor Verification Report

**Phase Goal:** Secure webhook ingress, deduplication, loop protection, and automated L1 contract audit.
**Verified:** 2026-09-08T13:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Valid HMAC webhook accepted (HTTP 202); invalid rejected (HTTP 401) | ✓ VERIFIED | `src/ingress/hmac.ts`, `src/ingress/routes.ts`; timing-safe validation tested in `tests/ingress.test.ts` and `tests/bot-shield.test.ts` |
| 2 | Duplicate `(workItemId, revId)` deliveries dropped | ✓ VERIFIED | `src/db/schema.ts` composite primary key `(work_item_id, rev_id)`; returns HTTP 200 `duplicate_ignored`; verified in `tests/ingress.test.ts` & `tests/dedup.test.ts` |
| 3 | Bot-identity events filtered — no recursive loops | ✓ VERIFIED | `src/ingress/bot-shield.ts` filters `ADO_BOT_ID` and `[automated-agent]` markers; `src/ado/formatter.ts` appends comment marker; verified in `tests/bot-shield.test.ts` |
| 4 | Complete AC → ticket transitions to "Ready to Dev" with L1 audit summary comment | ✓ VERIFIED | `src/auditor/worker.ts`, `src/ado/work-item.ts`, `src/ado/formatter.ts`; JSON patch replaces state and adds HTML comment; verified in `tests/worker.test.ts` (Case 1) |
| 5 | Ambiguous ticket stays "New" with specific missing-info comment | ✓ VERIFIED | `src/auditor/worker.ts` invokes `postFeedbackComment` on DoD failure; ticket state unchanged; verified in `tests/worker.test.ts` (Case 2) |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/config/env.ts` | Zod-validated environment config | ✓ VERIFIED | Validates ADO, database, and OpenAI credentials with runtime checks |
| `src/db/schema.ts` | Drizzle SQLite schema | ✓ VERIFIED | Defines `dedup_events` composite PK and `audit_log` tables |
| `src/db/index.ts` | SQLite connection & TTL purge | ✓ VERIFIED | Configures WAL mode, synchronous NORMAL, and 7-day retention purge function |
| `src/ingress/hmac.ts` | Timing-safe HMAC verification | ✓ VERIFIED | `crypto.timingSafeEqual` with explicit buffer length guard |
| `src/ingress/bot-shield.ts` | Bot identity & echo detector | ✓ VERIFIED | Matches `revisedById` against `ADO_BOT_ID` and checks `[automated-agent]` marker |
| `src/ingress/routes.ts` | Fastify webhook endpoint | ✓ VERIFIED | `/api/ado/webhook` with raw body HMAC verification, dedup check, and HTTP 202 response |
| `src/ingress/poller.ts` | Tunnel & polling helper | ✓ VERIFIED | Validated port bounds and safe child process execution for local development |
| `src/queue/lane-manager.ts` | Concurrency lane manager | ✓ VERIFIED | `PQueue` map serializing tasks per `workItemId` with `concurrency: 1` |
| `src/auditor/schema.ts` | AuditResult Zod schema | ✓ VERIFIED | Structured output format containing `passed`, `reasons`, and `criteria_summary` |
| `src/auditor/prompt.ts` | 4-point DoD rubric & prompt | ✓ VERIFIED | Isolates ticket inputs in `<user_ticket_input>` XML tags with `escapeXml` sanitization |
| `src/auditor/evaluator.ts` | AI contract auditor service | ✓ VERIFIED | Vercel AI SDK `generateText` with deterministic offline fallback in test environment |
| `src/ado/client.ts` | Azure DevOps REST client | ✓ VERIFIED | `azdev.WebApi` wrapper with exponential backoff handling 429, 5xx, and socket errors |
| `src/ado/formatter.ts` | HTML comment generator | ✓ VERIFIED | Renders sanitized HTML with `[L1 Evidence]` badge and `<!-- [automated-agent] -->` marker |
| `src/ado/work-item.ts` | ADO work item operations | ✓ VERIFIED | Implements JSON Patch state transitions and discussion feedback comments |
| `src/auditor/worker.ts` | Background audit orchestrator | ✓ VERIFIED | Pipeline connecting ADO fetch, contract audit, state update, and audit logging |
| `src/index.ts` | Fastify server entry point | ✓ VERIFIED | Server bootstrap, startup 7-day TTL cleanup, daily purge interval, and graceful shutdown |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `src/ingress/routes.ts` | `src/ingress/hmac.ts` | `verifyHmac` call | ✓ WIRED | Validates raw payload against `x-hub-signature-256` header |
| `src/ingress/routes.ts` | `src/db/schema.ts` | `dedupEvents` atomic insert | ✓ WIRED | Enforces single processing of `(workItemId, revId)` |
| `src/ingress/routes.ts` | `src/ingress/bot-shield.ts` | `isBotEcho` loop check | ✓ WIRED | Filters bot-initiated revisions before deduplication and queuing |
| `src/auditor/evaluator.ts` | `src/auditor/schema.ts` | `AuditResultSchema` | ✓ WIRED | Guarantees typed structured output from LLM |
| `src/auditor/evaluator.ts` | `src/auditor/prompt.ts` | `buildAuditorPrompt` | ✓ WIRED | Compiles instructions and XML-escaped ticket payload |
| `src/auditor/worker.ts` | `src/auditor/evaluator.ts` | `auditTicketContract` | ✓ WIRED | Executes Definition of Done evaluation on ticket fields |
| `src/auditor/worker.ts` | `src/ado/work-item.ts` | `transitionToReadyToDev` / `postFeedbackComment` | ✓ WIRED | Mutates work item state and posts discussion comments |
| `src/auditor/worker.ts` | `src/db/schema.ts` | `auditLogs` insert | ✓ WIRED | Persists verdict, reasons, model, and timestamp |
| `src/index.ts` | `src/ingress/routes.ts` | `app.register(webhookRoutes)` | ✓ WIRED | Registers ingress route on Fastify server |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `src/ingress/routes.ts` | `rawBody`, `signature` | HTTP Request payload & headers | Yes, raw HTTP byte buffer verified | ✓ FLOWING |
| `src/ingress/routes.ts` | `workItemId`, `revId` | Parsed ADO webhook resource | Yes, strictly validated positive integers | ✓ FLOWING |
| `src/db/index.ts` | `dedupEvents` | SQLite table | Yes, atomic constraint prevents duplicate delivery | ✓ FLOWING |
| `src/auditor/worker.ts` | `workItem` | `adoClient.getWorkItem(workItemId)` | Yes, queries ADO Work Item Tracking API | ✓ FLOWING |
| `src/auditor/evaluator.ts` | `result` | LLM / deterministic rubric parser | Yes, evaluates testability, completeness, personas, scope | ✓ FLOWING |
| `src/db/index.ts` | `auditLogs` | SQLite table | Yes, persists evaluation results and reasons | ✓ FLOWING |
| `src/ado/work-item.ts` | `patchDoc` | JSON Patch Document | Yes, sends state change & discussion HTML to ADO REST API | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full test suite | `npm test` | 6 test files passed, 50 tests passed in 3.67s | ✓ PASS |
| TypeScript build | `npm run build` | Zero compilation or type errors | ✓ PASS |
| Ingress HMAC rejection | `npx vitest run tests/ingress.test.ts -t "rejects requests"` | 3 tests passed (missing HMAC, invalid HMAC, invalid IDs) | ✓ PASS |
| Deduplication constraint | `npx vitest run tests/dedup.test.ts` | 3 tests passed (insert, composite PK conflict, TTL purge) | ✓ PASS |
| Bot shield loop termination | `npx vitest run tests/bot-shield.test.ts` | 9 tests passed (timing-safe HMAC, bot ID, marker detection) | ✓ PASS |
| Auditor reasoning engine | `npx vitest run tests/auditor.test.ts` | 8 tests passed (DoD rubric, XML escaping, injection defense) | ✓ PASS |
| Worker pipeline end-to-end | `npx vitest run tests/worker.test.ts` | 5 tests passed (pass, fail, skip non-New, error handling, e2e) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| INGEST-01 | 01-01-PLAN.md | System receives and verifies Azure DevOps service hook webhooks using HMAC secret signatures. | ✓ SATISFIED | `src/ingress/hmac.ts`, `src/ingress/routes.ts`, `tests/ingress.test.ts` |
| INGEST-02 | 01-01-PLAN.md | System deduplicates events by `(workItemId, revId)` to prevent duplicate dispatches and race conditions. | ✓ SATISFIED | `src/db/schema.ts`, `src/db/index.ts`, `src/queue/lane-manager.ts`, `tests/dedup.test.ts`, `tests/ingress.test.ts` |
| INGEST-03 | 01-01-PLAN.md | System filters out agent/bot identity actions to prevent recursive webhook loops. | ✓ SATISFIED | `src/ingress/bot-shield.ts`, `src/ado/formatter.ts`, `tests/bot-shield.test.ts`, `tests/ingress.test.ts` |
| CONTR-01 | 01-02-PLAN.md | Auditor agent inspects ticket & AC for Definition of Done clarity, scope completeness, and testability (L1 Evidence). | ✓ SATISFIED | `src/auditor/schema.ts`, `src/auditor/prompt.ts`, `src/auditor/evaluator.ts`, `tests/auditor.test.ts` |
| CONTR-02 | 01-03-PLAN.md | System transitions validated tickets to "Ready to Dev" and posts L1 audit summary in the work item discussion; ambiguous tickets stay in "New" with missing-info comments. | ✓ SATISFIED | `src/ado/client.ts`, `src/ado/formatter.ts`, `src/ado/work-item.ts`, `src/auditor/worker.ts`, `tests/worker.test.ts`, `tests/ado-client.test.ts` |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| None | - | None | None | No blocking anti-patterns or stubs found. Code review findings (CR-01, CR-02, WR-01 through WR-05) fixed and verified. |

### Human Verification Required

### 1. Live Azure DevOps Service Hook Delivery

**Test:** Configure an Azure DevOps service hook subscription (Work item created / updated) targeting the gateway webhook endpoint `/api/ado/webhook` with the shared HMAC secret. Trigger a new work item creation.
**Expected:** Inbound webhook payload accepted with HTTP 202 in <100ms; work item ID and rev ID recorded in SQLite `dedup_events` table.
**Why human:** Requires an active Azure DevOps organization and network routing (or Cloudflare Tunnel) to reach the service instance.

### 2. Azure Boards Discussion UI Rendering

**Test:** Create a work item with complete acceptance criteria, wait for worker completion, and inspect the work item discussion in the Azure DevOps Boards web UI. Repeat with an incomplete ticket containing placeholders.
**Expected:** Passed ticket transitions to "Ready to Dev" with formatted `[L1 Evidence] Contract Audit: PASSED` badge, checklist, and criteria summary. Failed ticket remains in "New" with `[L1 Evidence] Contract Audit: INCOMPLETE (Action Required)` and actionable missing requirements. `<!-- [automated-agent] -->` comment tag remains invisible to human users while preventing recursive webhook triggers.
**Why human:** Visual styling, layout appearance, and native Azure Boards interaction cannot be checked via headless programmatic tests.

### Gaps Summary

No functional code gaps found. All 5 requirements (INGEST-01, INGEST-02, INGEST-03, CONTR-01, CONTR-02) and 5 Roadmap Success Criteria are implemented and verified with 50 automated tests passing. System is ready for live staging verification.

---

_Verified: 2026-09-08T13:20:00Z_
_Verifier: the agent (gsd-verifier)_
