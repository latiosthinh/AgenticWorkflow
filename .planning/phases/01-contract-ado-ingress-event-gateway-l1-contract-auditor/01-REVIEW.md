---
phase: 01-contract-ado-ingress-event-gateway-l1-contract-auditor
reviewed: 2026-09-08T11:20:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - src/config/env.ts
  - src/db/schema.ts
  - src/db/index.ts
  - src/ingress/hmac.ts
  - src/ingress/bot-shield.ts
  - src/ingress/routes.ts
  - src/ingress/poller.ts
  - src/queue/lane-manager.ts
  - src/auditor/schema.ts
  - src/auditor/prompt.ts
  - src/auditor/evaluator.ts
  - src/ado/client.ts
  - src/ado/formatter.ts
  - src/ado/work-item.ts
  - src/auditor/worker.ts
  - src/index.ts
  - tests/ado-client.test.ts
  - tests/auditor.test.ts
  - tests/bot-shield.test.ts
  - tests/dedup.test.ts
  - tests/ingress.test.ts
  - tests/worker.test.ts
findings:
  critical: 2
  warning: 5
  info: 6
  total: 13
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-09-08T11:20:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Reviewed source files across ADO Ingress, Event Gateway, Deduplication Store, Lane Manager, and L1 Contract Auditor. Architecture cleanly implements atomic SQLite event deduplication, per-work-item queue lanes, and timing-safe HMAC authentication.

Identified 2 Critical security flaws:
1. Prompt injection breakout risk in LLM prompt interpolation due to missing XML closing tag sanitization (`src/auditor/prompt.ts`).
2. Command injection vector via `shell: true` execution in development tunnel spawner (`src/ingress/poller.ts`).

Identified 5 Warnings regarding testability false-positives on question mark URLs, unhandled network errors during ADO retries, `NaN` backoff calculation on HTTP-date headers, missing integer range validation on incoming IDs, and redundant client method duplication.

---

## Critical Issues

### CR-01: Prompt Injection XML Boundary Breakout via Unsanitized Ticket Content

**File:** `src/auditor/prompt.ts:48-52`
**Issue:**
Untrusted external ticket inputs (`ticket.title`, `ticket.description`, `ticket.acceptanceCriteria`) are directly interpolated into XML tags without escaping. An attacker can craft a ticket containing `</acceptanceCriteria></user_ticket_input>` followed by arbitrary instructions, breaking out of the security boundary guard (T-1-04 Elevation of Privilege) and forcing a passing verdict.

```ts
  const prompt = `<user_ticket_input>
<title>${ticket.title}</title>
<description>${ticket.description}</description>
<acceptanceCriteria>${ticket.acceptanceCriteria}</acceptanceCriteria>
</user_ticket_input>`;
```

**Fix:**
Sanitize XML special characters (especially `<` and `>`) or escape delimiter tags before string interpolation:

```ts
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const prompt = `<user_ticket_input>
<title>${escapeXml(ticket.title)}</title>
<description>${escapeXml(ticket.description)}</description>
<acceptanceCriteria>${escapeXml(ticket.acceptanceCriteria)}</acceptanceCriteria>
</user_ticket_input>`;
```

---

### CR-02: Command Injection Risk via Unnecessary Shell Execution in Tunnel Spawner

**File:** `src/ingress/poller.ts:8-11`
**Issue:**
`startTunnel` spawns `cloudflared` with `{ shell: true }` while interpolating `port` into `tunnelUrl`. Because `port` can be passed as an arbitrary parameter to `startTunnel`, executing under `shell: true` enables command injection if non-numeric values are passed. Furthermore, `cloudflared` is a binary executable and does not require a shell wrapper.

```ts
export function startTunnel(port = env.PORT): ChildProcess {
  const tunnelUrl = `http://localhost:${port}`;
  const process = spawn('cloudflared', ['tunnel', '--url', tunnelUrl], {
    stdio: 'inherit',
    shell: true,
  });
```

**Fix:**
Enforce strict numeric port validation and remove `shell: true`:

```ts
export function startTunnel(port: number = env.PORT): ChildProcess {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }
  const tunnelUrl = `http://localhost:${port}`;
  const process = spawn('cloudflared', ['tunnel', '--url', tunnelUrl], {
    stdio: 'inherit',
    shell: false,
  });
  return process;
}
```

---

## Warnings

### WR-01: False-Positive DoD Audit Rejection on Question Marks and Query Parameters

**File:** `src/auditor/evaluator.ts:33-35`
**Issue:**
`placeholderRegex = /\b(tbd|todo|placeholder|see doc|later)\b|\?/i` includes `|\?` without boundary guards. Any ticket description or acceptance criteria with a question mark (e.g. natural language requirements or REST endpoints like `GET /api/users?status=active`) matches the regex, causing `hasPlaceholders = true` and failing valid tickets on completeness.

**Fix:**
Require `?` to be standalone or consecutive placeholder characters:

```ts
const placeholderRegex = /\b(tbd|todo|placeholder|see doc|later)\b|(?:\s|^)\?{2,}(?:\s|$)/i;
```

---

### WR-02: Missing Transient Network Error Handling in ADO API Retry Handler

**File:** `src/ado/client.ts:16-28`
**Issue:**
`withRetry` only checks HTTP status codes (`statusCode === 429` and `500 <= statusCode < 600`). Network-level disconnects (such as `ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, or socket hangs) lack a numeric `statusCode`. As a result, `(!isRateLimited && !isServerError)` evaluates to `true`, causing transient socket failures to abort immediately on attempt 1 without retrying.

**Fix:**
Check for standard network error codes:

```ts
const isNetworkError =
  Boolean(err?.code && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(err.code));

if (attempt >= maxRetries || (!isRateLimited && !isServerError && !isNetworkError)) {
  throw err;
}
```

---

### WR-03: `NaN` Delay When Parsing HTTP-Date in `Retry-After` Header

**File:** `src/ado/client.ts:35-37`
**Issue:**
When handling HTTP 429 rate limits, `retry-after` may contain an HTTP-date string (RFC 7231) instead of seconds. `Number(retryAfterHeader)` yields `NaN`, resulting in `delay = NaN`. In Node.js, `setTimeout(fn, NaN)` executes after 1ms, completely circumventing rate-limit backoff and hammering the service.

**Fix:**
Parse numeric seconds or calculate difference for HTTP-date strings:

```ts
let delayMs: number;
if (retryAfterHeader) {
  const seconds = Number(retryAfterHeader);
  if (!isNaN(seconds)) {
    delayMs = seconds * 1000;
  } else {
    const targetTime = Date.parse(retryAfterHeader);
    delayMs = !isNaN(targetTime) ? Math.max(0, targetTime - Date.now()) : baseDelayMs;
  }
} else {
  delayMs = Math.min(10000, baseDelayMs * 2 ** (attempt - 1) + Math.random() * 200);
}
```

---

### WR-04: Permissive Work Item ID and Revision Number Parsing

**File:** `src/ingress/routes.ts:39-44`
**Issue:**
`Number(resource?.workItemId || resource?.id)` allows negative numbers, non-integers, and floats because `-1` is truthy and not `NaN`. Negative or invalid numbers pass into SQLite `dedup_events` and get enqueued to lane queues.

**Fix:**
Validate positive integers:

```ts
const workItemId = Number(resource?.workItemId || resource?.id);
const revId = Number(resource?.rev || resource?.fields?.['System.Rev']);

if (!Number.isInteger(workItemId) || workItemId <= 0 || !Number.isInteger(revId) || revId <= 0) {
  return reply.code(400).send({ error: 'Missing or invalid workItemId or revId' });
}
```

---

### WR-05: Redundant Boilerplate and Leaky Abstraction in Work Item Mutations

**File:** `src/ado/work-item.ts:38-80` vs `src/ado/client.ts:72-88`
**Issue:**
`adoClient` provides `getWorkItem` and `updateWorkItem` methods with automated retry. However, `src/ado/work-item.ts` bypasses both, directly fetching `adoClient.getWorkItemTrackingApi()` and duplicating the `withRetry` wrapper, parameter inspection (`length === 2`), and retry logic across `getWorkItemDetails`, `transitionToReadyToDev`, and `postFeedbackComment`. This leaves `adoClient.getWorkItem` and `adoClient.updateWorkItem` as dead code.

**Fix:**
Delegate mutations to `adoClient`:

```ts
export async function transitionToReadyToDev(workItemId: number, htmlComment: string): Promise<any> {
  const patchDoc = buildReadyToDevPatch(htmlComment);
  return adoClient.updateWorkItem(workItemId, patchDoc);
}

export async function postFeedbackComment(workItemId: number, htmlComment: string): Promise<any> {
  const patchDoc = buildFeedbackPatch(htmlComment);
  return adoClient.updateWorkItem(workItemId, patchDoc);
}
```

---

## Info

### IN-01: Lax HMAC Hex String Length and Format Verification

**File:** `src/ingress/hmac.ts:12-24`
**Issue:**
`Buffer.from(cleanSig, 'hex')` ignores non-hex characters and trailing odd nibbles. Signatures with trailing garbage or non-hex padding can still decode to 32 bytes and pass `timingSafeEqual`.
**Fix:** Validate `cleanSig` against `/^[0-9a-fA-F]{64}$/` before buffer creation.

---

### IN-02: Global Mutable Module State for Work Item Handler

**File:** `src/ingress/routes.ts:13-17`
**Issue:**
`let activeHandler: WorkItemHandler | undefined = processWorkItemAudit;` is module-level mutable singleton state. Overriding it in tests leaked state across test suites, forcing serialized test runs.
**Fix:** Inject handler via Fastify decorators (`fastify.decorate('workItemHandler', ...)`).

---

### IN-03: Asynchronous `request.log` Call After HTTP Response Completion

**File:** `src/ingress/routes.ts:100`
**Issue:**
`request.log.error` is called inside an unawaited background queue worker after `reply.send(202)` has finished. Fastify request context may be detached.
**Fix:** Use `fastify.log.error` instead of `request.log.error` for background tasks.

---

### IN-04: Unreferenced Daily Interval and Missing Listener Cleanup in Server Lifecycle

**File:** `src/index.ts:42-49, 85-86`
**Issue:**
`purgeInterval` is created before `buildApp()`. If `buildApp()` fails during initialization, `purgeInterval` keeps the process alive. In addition, `process.on` listeners are not removed during shutdown.
**Fix:** Call `purgeInterval.unref()` and create it only after successful server listen.

---

### IN-05: Uncalled `clearLane` Causing Unbounded Map Growth

**File:** `src/queue/lane-manager.ts:15-20`
**Issue:**
`clearLane(workItemId)` is implemented but never called. As thousands of unique tickets are processed, empty `PQueue` objects accumulate in `this.lanes`.
**Fix:** Invoke `workItemQueueManager.clearLane(workItemId)` inside queue `idle` event or after task completion.

---

### IN-06: Permissive Bot Shield Substring Matching for Human Comments

**File:** `src/ingress/bot-shield.ts:12-14`
**Issue:**
`input.historyComment.includes('[automated-agent]')` checks a simple substring. A human engineer referencing `[automated-agent]` in a discussion comment causes their revision to be dropped as a bot echo.
**Fix:** Match specifically on `<!-- [automated-agent] -->` comment tag.

---

_Reviewed: 2026-09-08T11:20:00Z_
_Reviewer: gsd-code-reviewer_
_Depth: standard_
