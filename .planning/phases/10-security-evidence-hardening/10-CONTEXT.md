# Phase 10: Security & Evidence Hardening - Context

**Gathered:** 2026-09-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate all remaining security leaks and evidence fabrications across the pipeline:
1. Verdict token authorization (SEC-03) via `APPROVER_IDS` allowlist.
2. 100% comment sanitization + loop-shield marker enforcement (SEC-04), covering all inline comments in workers.
3. Production git push honesty (SEC-05) — fail-closed under production.
4. XML escaping of learning prompt context, PR description sanitization, and scope gate feedback/displayName sanitization (SEC-06).
5. Zero fabricated evidence (CORE-04): replace router default 1/1, evidence-index L2/L4 constants, and QA commitSha 'main' with real values or fail-closed `MissingEvidenceError`.
6. Pass `knownSecrets` to `executeRepairLoop` (REL-09).

</domain>

<decisions>
## Implementation Decisions

### Approver Allowlist (SEC-03)
- `APPROVER_IDS` in `src/config/env.ts` (comma-separated ADO IDs/emails/names, optional in dev/test, validated in production).
- When a verdict token (`[approve-scope]`, `[approve-acceptance]`, reject/reset variants) is detected from an actor NOT in allowlist:
  - Reject the verdict.
  - Post sanitized warning comment: `[Unauthorized Verdict] User {actor} is not authorized to approve or reject this gate. Action ignored.` with `<!-- [automated-agent] -->` shield.
  - Log security warning. Do not transition state.

### Comment Sanitization & Push Honesty (SEC-04, SEC-05, SEC-06)
- Provide a centralized helper (e.g. `formatWorkerAlertComment` or expand `src/ado/formatter.ts`) that sanitizes HTML input via `sanitize-html` and always appends `<!-- [automated-agent] -->`.
- Refactor all inline ADO comments in `src/execute/worker.ts` and `src/execute/rework-worker.ts` to route through sanitizing formatters.
- Git push in `src/execute/worker.ts` and `src/execute/repair.ts`: if push fails:
  - If `NODE_ENV === 'test'`, log warning and proceed (for offline testing).
  - Otherwise (production/staging/dev), transition ticket to Blocked, record dedup `failed`, post alert comment with push error details.
- XML containment: in `src/learn/prompt.ts`, escape all inputs inserted into `<learning_source_context>` via `escapeXml`.
- In `src/ado/formatter.ts:formatPrDescription`, sanitize title and acceptanceCriteria.
- In `src/scope/gate.ts`, sanitize feedback and actor displayName before HTML embedding.

### Real Evidence & Secret Scrubbing (CORE-04, REL-09)
- In `src/execute/router.ts` (step 4), retrieve real `state.l3Evidence`. If missing, do NOT fallback to `{suite: 'vitest', totalTests: 1, passed: 1}` — throw `MissingEvidenceError` or route to Blocked.
- In `src/qa/worker.ts`, resolve `commitSha` via `git rev-parse HEAD` inside `worktreePath` (fallback to work item branch rev-parse if clean, never hardcode `'main'`).
- In `src/deploy/evidence-index.ts`, eliminate hardcoded fallback constants for L2/L4/errorRate/p95 when compile options specify `failClosed: true`.
- In `src/execute/worker.ts` and `src/execute/rework-worker.ts`, pass `knownSecrets: getKnownSecrets()` into `executeRepairLoop`.

</decisions>
