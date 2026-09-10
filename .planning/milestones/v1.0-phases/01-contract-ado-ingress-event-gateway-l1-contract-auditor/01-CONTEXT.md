# Phase 1: CONTRACT — ADO Ingress, Event Gateway & L1 Contract Auditor - Context

**Gathered:** 2026-09-07
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous batch tables accepted)

<domain>
## Phase Boundary

Secure webhook ingress, HMAC verification, SQLite deduplication lock, bot echo loop protection, official Azure DevOps REST client wrapper, and automated L1 requirements audit evaluating Definition of Done to transition tickets from `New` to `Ready to Dev`.

</domain>

<decisions>
## Implementation Decisions

### Ingress & Webhook Security
- Endpoint path: `/api/ado/webhook` on configurable `PORT` (default `3000`).
- HMAC SHA256 signature verification comparing `x-hub-signature-256` header against raw request body using `crypto.timingSafeEqual`.
- Immediate HTTP `202 Accepted` response with event/job ID returned within <100ms before asynchronous processing begins.
- Support local development via `--tunnel` CLI flag or webhook polling fallback when public URL is unavailable.

### Deduplication & Idempotency Store
- SQLite table schema keyed on primary composite `(work_item_id, rev_id)` storing `status`, `received_at`, `payload_hash`, and error messages.
- Duplicate deliveries return HTTP `200 OK` with `{ status: "duplicate_ignored" }`, log warning, and drop duplicate background task execution.
- 7-day retention TTL on event deduplication records with automated purge sweep on startup and daily interval.
- Concurrency control: in-memory queue lanes (via `p-queue`) keyed by `work_item_id` to serialize multiple rapid edits on the same work item.

### ADO Client Integration & Bot Echo Shield
- Personal Access Token authentication configured via `ADO_PAT` and `ADO_ORG_URL` environment variables, consuming `azure-devops-node-api`.
- Bot echo shield: verify `event.resource.revisedBy.id` does not match configured `ADO_BOT_ID` / service principal, and ignore comments containing `[automated-agent]` marker.
- Resilient API client: exponential backoff with jitter on HTTP 429 and 5xx network errors (max 3 retries, base delay 1000ms).
- Discussion comments formatted from Markdown to ADO-safe HTML with structured badge headers (`[L1 Evidence]`) and collapsible details.

### Requirements Auditor & L1 Evidence Gate
- LLM reasoning using Vercel AI SDK with structured Zod schema output (`passed: boolean`, `reasons: string[]`, `criteria_summary: string`).
- Evaluation rubric: testability (verifiable outcomes), unambiguous scope boundaries, clear user personas/actions, and absence of placeholders ("TBD").
- On Audit Pass: patch `System.State` to `Ready to Dev` via JSON Patch, append structured checklist comment with `[L1 Evidence]` badge.
- On Audit Fail: retain ticket in `New`, post clear bulleted list of missing requirements to work item discussion.
- Audit persistence: record all audit decisions in SQLite `audit_log` table `(work_item_id, rev_id, verdict, reasons, model, timestamp)` for auditable L1 traceability.

### Claude's Discretion
- Exact Fastify plugin structure, middleware registration order, and SQLite migration tooling (Drizzle ORM schema definitions).
- Specific system prompt phrasing for the Requirements Auditor.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Greenfield codebase. Standard Node.js 24 LTS and TypeScript 7 environment.

### Established Patterns
- Asynchronous decoupled webhook ingestion with SQLite WAL transaction leasing and p-queue concurrency control.

### Integration Points
- Receives inbound Azure DevOps Service Hooks for `workitem.created` and `workitem.updated`.
- Outbound calls to Azure DevOps REST API v7.1 (Work Item Tracking).

</code_context>

<specifics>
## Specific Ideas
- Maintain strict separation between the Fastify HTTP receiver and the background processing worker.
- Output clean JSON responses and maintain structured logs for debugging webhook deliveries.

</specifics>

<deferred>
## Deferred Ideas
- Multi-tenant token rotation or Azure Key Vault secrets provider (v2).
- Dynamic webhook subscription creation via API (manual Service Hook configuration in ADO for v1).

</deferred>
