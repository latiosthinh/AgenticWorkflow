---
phase: 260918-qvo-opencode-runner-integration
plan: 01
subsystem: execute
tags:
  - opencode
  - llm
  - provider
  - ai-sdk
  - jsonl
  - worker
requires:
  - STATE-01
  - TAX-01
provides:
  - OPENCODE-01
  - OPENCODE-02
  - OPENCODE-03
affects:
  - src/config/env.ts
  - src/ai/provider.ts
  - src/auditor/evaluator.ts
  - src/plan/planner.ts
  - src/execute/opencode-runner.ts
  - src/execute/worker.ts
  - src/execute/rework-worker.ts
tech-stack:
  added: []
  patterns:
    - Headless CLI runner with JSONL streaming and event aggregation
    - Custom stream fetch wrapper configuring base URL and provider API keys
    - Session ID preservation across iterative rework turns
key-files:
  created:
    - src/ai/provider.ts
    - src/execute/opencode-runner.ts
    - tests/provider.test.ts
    - tests/opencode-runner.test.ts
  modified:
    - src/config/env.ts
    - src/auditor/evaluator.ts
    - src/plan/planner.ts
    - src/execute/worker.ts
    - src/execute/rework-worker.ts
    - src/qa/runner.ts
    - tests/state-matrix-sync.test.ts
    - .env.example
    - .planning/milestones/v2.0-ROADMAP.md
decisions:
  - "Configured OpenAI provider via createOpenAI with optional custom baseURL and customStreamFetch handler for endpoint rerouting."
  - "Enforced argument array execution with shell: false and bounded timeout (default 180s) in OpenCode CLI runner to mitigate injection and DoS."
  - "Preserved sessionId across iterative rework cycles in rework-worker to allow conversational session continuity in OpenCode."
metrics:
  duration: 12m
  completed_date: "2026-09-18"
---

# Quick Plan 260918-qvo: OpenCode Runner & Custom LLM Endpoint Integration Summary

Custom OpenAI-compatible LLM endpoint provider and local OpenCode agent CLI runner (`opencode run`) integrated into execution and rework pipelines with JSONL streaming and session preservation.

## Key Outcomes

1. **Config & AI Provider (`OPENCODE-01`):**
   - Extended `EnvSchema` in `src/config/env.ts` with `API_ENDPOINT`, `API_KEY`, `API_MODEL`, `LOCAL_AGENT_TYPE`, `OPENCODE_BIN`, and `OPENCODE_TIMEOUT_MS`.
   - Created `src/ai/provider.ts` exporting `customOpenAi`, `getModel`, and `appModel` using `@ai-sdk/openai` with `customStreamFetch`.
   - Wired `appModel` into `src/auditor/evaluator.ts` and `src/plan/planner.ts`.

2. **OpenCode Terminal Runner (`OPENCODE-02`):**
   - Implemented `src/execute/opencode-runner.ts` exporting `runOpenCode`, `parseJsonlEvents`, `extractSessionId`, and `buildOpenCodeArgs`.
   - Structured CLI execution with `shell: false`, argument array splitting, secret scrubbing (`scrubOutput`), bounded timeouts with SIGTERM/SIGKILL cascade, and session ID extraction across diverse JSONL event formats.

3. **Pipeline & Rework Integration (`OPENCODE-03`):**
   - Wired `runOpenCode` into `src/execute/worker.ts` and `src/execute/rework-worker.ts` under `LOCAL_AGENT_TYPE === 'opencode'`.
   - Supported `sessionId` passthrough to resume existing OpenCode sessions during reviewer rework loops.
   - Updated `tests/state-matrix-sync.test.ts` to locate state matrix in `.planning/milestones/v2.0-ROADMAP.md`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 / Rule 3 - Bug / Blocking] Fixed type error TS2322 in QA runner**
- **Found during:** Task 1 verification (`npx tsc --noEmit`)
- **Issue:** `src/qa/runner.ts` passed `[env.ADO_PAT, env.OPENAI_API_KEY, env.ADO_WEBHOOK_SECRET]` where `OPENAI_API_KEY` became `string | undefined`.
- **Fix:** Filtered array with `Boolean` and added `env.API_KEY` to scrub list.
- **Files modified:** `src/qa/runner.ts`
- **Commit:** `34c66b1`

**2. [Rule 1 - Bug] Restored Authoritative ADO State Matrix in archived milestone roadmap**
- **Found during:** Task 3 verification (`npx vitest run tests/state-matrix-sync.test.ts`)
- **Issue:** Milestone v2.0 archiver pruned the state matrix table from `ROADMAP.md` without copying the table into `v2.0-ROADMAP.md`.
- **Fix:** Appended Authoritative ADO State Matrix section to `.planning/milestones/v2.0-ROADMAP.md` and updated `tests/state-matrix-sync.test.ts` to inspect active or archived roadmap.
- **Files modified:** `.planning/milestones/v2.0-ROADMAP.md`, `tests/state-matrix-sync.test.ts`
- **Commit:** `10aad9c`

## Threat Flags

None - all executions use argument arrays with `shell: false`, bounded timeouts, and secret scrubbing.

## Verification

- `npx vitest run tests/provider.test.ts`: Passed (4 tests)
- `npx vitest run tests/opencode-runner.test.ts`: Passed (15 tests)
- `npx vitest run tests/state-matrix-sync.test.ts`: Passed (2 tests)
- `npx tsc --noEmit`: Zero errors
- `npm test`: 48 test files passed (456 tests total)

## Self-Check: PASSED
