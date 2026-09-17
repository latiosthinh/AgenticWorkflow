# Phase 5: Prod Smoke Suite - Context

**Gathered:** 2026-09-18
**Status:** Ready for planning
**Mode:** Auto-accepted recommendations (autonomous execution)

<domain>
## Phase Boundary

An automated ⚡ production smoke suite (Release Step 8) runs BEFORE the telemetry window and feeds L6 — release confidence requires smoke PASS **and** telemetry-window PASS, with every run persisted to the ticket's `StateStore` smoke section.

</domain>

<decisions>
## Implementation Decisions

### Smoke Runner Mechanics
- **Fail-Fast Sequencing:** Smoke suite runs before telemetry evaluation. If smoke fails, release bounces without waiting for the 30-minute telemetry window.
- **Fail-Closed on Missing Config:** In production (`NODE_ENV === 'production'`), missing `PRODUCTION_SMOKE_URL` throws and fails closed. In development/test, fallback/mock URLs permitted.
- **Checks Executed:** Health endpoint probe (HTTP 200), deployed version / commit SHA verification (matches release commitSha to detect stale slot swaps), critical-path read checks.
- **2-Strike Flake Filter & Error Classification:** INFRA errors (ECONNRESET, connection timeout, 4xx auth error, harness crash) retry once; if failing twice, tag `[smoke-harness-error]` and keep state untouched for human review. APP errors (test failure, 5xx server error, SHA mismatch) retry once; if reproducible twice with identical fingerprint, bounce to `In Dev` with tag `[deploy-regressed]` and diagnostics.
- **Sandboxed Execution:** Scripted commands executed via `sandbox/runner.ts` (`extendEnv: false`, scrubbed secrets, hard timeout <= 5m, read-only).
- **StateStore Persistence:** Each smoke run appended to `draft.smokeRuns` or updated in `draft.smokeEvidence`.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/sandbox/runner.ts` — sandboxed subprocess execution with timeout and secret redaction.
- `src/qa/fingerprint.ts` — SHA-256 error fingerprint generator for 2-strike flake filtering.
- `src/deploy/telemetry.ts` & `src/deploy/worker.ts` — existing post-deploy telemetry evaluation and deployment worker.
- `src/state/types.ts` — `SmokeRunState`, `SmokeEvidenceState`.

### Established Patterns
- Fastify/node fetch HTTP probing, sanitized HTML comments with `<!-- [automated-agent] -->` shield.

### Integration Points
- `src/deploy/smoke.ts` (NEW): probe HTTP health, version SHA check, run smoke commands, classify INFRA vs APP, 2-strike filter.
- `src/deploy/worker.ts`: sequence smoke execution before telemetry evaluation.
- `src/config/env.ts`: add `PRODUCTION_SMOKE_URL`, `SMOKE_TEST_COMMAND`, `SMOKE_TIMEOUT_MS`.

</code_context>

<specifics>
## Specific Ideas

- INFRA vs APP classification using `qa/fingerprint.ts` pattern.
- Formatted alert comment on regression with rollback command.

</specifics>

<deferred>
## Deferred Ideas

- GOV-01: Automated canary traffic shifting with instant rollback.

</deferred>
