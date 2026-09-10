---
phase: 01-contract-ado-ingress-event-gateway-l1-contract-auditor
fixed_at: 2026-09-08T13:10:00Z
review_path: .planning/phases/01-contract-ado-ingress-event-gateway-l1-contract-auditor/01-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-09-08T13:10:00Z
**Source review:** .planning/phases/01-contract-ado-ingress-event-gateway-l1-contract-auditor/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7
- Fixed: 7
- Skipped: 0

## Fixed Issues

### CR-01: Prompt Injection XML Boundary Breakout via Unsanitized Ticket Content

**Files modified:** `src/auditor/prompt.ts`, `tests/auditor.test.ts`
**Commit:** 32ce93c
**Applied fix:** Added `escapeXml` sanitization function escaping `&`, `<`, `>`, `"`, `'` when interpolating ticket fields into XML tags.

### CR-02: Command Injection Risk via Unnecessary Shell Execution in Tunnel Spawner

**Files modified:** `src/ingress/poller.ts`, `tests/ingress.test.ts`
**Commit:** 1630b1a
**Applied fix:** Enforced positive integer port range check (1-65535) and set `shell: false` in `spawn('cloudflared', ...)` call.

### WR-01: False-Positive DoD Audit Rejection on Question Marks and Query Parameters

**Files modified:** `src/auditor/evaluator.ts`, `tests/auditor.test.ts`
**Commit:** 02b6b4b
**Applied fix:** Replaced unconstrained `|\?` in placeholder regex with `|(?:\s|^)\?{2,}(?:\s|$)` to allow natural question marks and URL query parameters.

### WR-02: Missing Transient Network Error Handling in ADO API Retry Handler

**Files modified:** `src/ado/client.ts`, `tests/ado-client.test.ts`
**Commit:** 8047646
**Applied fix:** Added transient network error detection for socket error codes (`ECONNRESET`, `ETIMEDOUT`, `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`) in `withRetry`.

### WR-03: `NaN` Delay When Parsing HTTP-Date in `Retry-After` Header

**Files modified:** `src/ado/client.ts`, `tests/ado-client.test.ts`
**Commit:** 47d4dcd
**Applied fix:** Handled non-numeric `Retry-After` headers by parsing HTTP-date strings via `Date.parse()` and calculating remaining delta ms.

### WR-04: Permissive Work Item ID and Revision Number Parsing

**Files modified:** `src/ingress/routes.ts`, `tests/ingress.test.ts`
**Commit:** fdffadb
**Applied fix:** Replaced loose truthiness checks with `Number.isInteger(id) && id > 0` validation for both `workItemId` and `revId`.

### WR-05: Redundant Boilerplate and Leaky Abstraction in Work Item Mutations

**Files modified:** `src/ado/work-item.ts`
**Commit:** 148aaff
**Applied fix:** Refactored `getWorkItemDetails`, `transitionToReadyToDev`, and `postFeedbackComment` to delegate directly to `adoClient.getWorkItem` and `adoClient.updateWorkItem`.

---

_Fixed: 2026-09-08T13:10:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
