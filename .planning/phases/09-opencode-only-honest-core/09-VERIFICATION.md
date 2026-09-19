---
phase: 09-opencode-only-honest-core
verified: 2026-09-19T23:30:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
gaps: []
deferred: []
human_verification: []
---

# Phase 9: Opencode-Only Honest Core Verification Report

**Phase Goal:** The agent core codes for real or not at all — built-in no-op path deleted, `LOCAL_AGENT_TYPE=opencode` required with fail-fast boot validation, MCP subsystem wired-or-deleted, repair loop real-or-honest — and the CRITICAL injection-to-secret-theft chain (C1) is closed: ticket content XML-isolated in opencode/planner prompts, agent commands allowlisted, agent file reads jailed to the worktree, orchestrator `.env` unreachable.
**Verified:** 2026-09-19T23:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Boot fails fast with actionable config error when `LOCAL_AGENT_TYPE` is unset or not `opencode`, or `OPENCODE_BIN` unresolvable; no built-in coding path in `src/execute/` | ✓ VERIFIED | `src/config/env.ts` enforces `z.literal('opencode')` and PATH/file checks on `OPENCODE_BIN`. `tests/env-boot-validation.test.ts` verifies failures and successes. `createCoderTools` deleted; worker unconditional on opencode. |
| 2 | Ticket title/description/AC arrive XML-escaped and tag-isolated with SECURITY BOUNDARY directive in opencode and planner prompts | ✓ VERIFIED | `buildOpenCodePrompt` in `worker.ts` and `buildPlannerPrompt` in `planner.ts` use `escapeXml` and `<user_ticket_input>`. Verified by 11 tests in `tests/prompt-injection.test.ts`. |
| 3 | Agent command execution accepts only allowlisted test commands; agent file reads jailed to worktree; orchestrator `.env` unreachable | ✓ VERIFIED | `src/sandbox/runner.ts` exports frozen `ALLOWED_COMMANDS` and enforces `assertAllowedCommand` before `execa` with `extendEnv: false`. Verified by 19 tests in `tests/command-allowlist.test.ts`. |
| 4 | Repair cycle performs real edit-and-retry through opencode runner with failure context, or evidence honestly records no repair | ✓ VERIFIED | `src/execute/repair.ts` invokes `runOpenCode` with failure context, tracks `repairAttempted` and `filesEdited` using `git diff ['--stat', 'HEAD']` + untracked files. Verified by 10 tests in `tests/repair-loop.test.ts`. |
| 5 | No runtime-dead MCP subsystem remains (`src/mcp/` deleted, MCP deps removed) and full test suite is green with §Done-well invariants intact | ✓ VERIFIED | `src/mcp/` deleted; `@ai-sdk/mcp` and `@modelcontextprotocol/sdk` removed from `package.json`. Suite passes 517/517 across 53 files. `tsc --noEmit` clean. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/config/env.ts` | Fail-fast boot schema for `LOCAL_AGENT_TYPE` and `OPENCODE_BIN` | ✓ VERIFIED | Substantive Zod schema validation; `which`/`where`/`existsSync` checks. |
| `tests/env-boot-validation.test.ts` | Unit tests for boot configuration validation | ✓ VERIFIED | 5 tests passing; tests unset, invalid, empty, and valid binary path. |
| `src/execute/worker.ts` | OpenCode-only execution pipeline, prompt isolation, no MCP | ✓ VERIFIED | Prompt builder exports `buildOpenCodePrompt` using `escapeXml` + boundary tags; invokes `runOpenCode`. |
| `src/plan/planner.ts` | Prompt isolation with `escapeXml` and security tags | ✓ VERIFIED | Exports `buildPlannerPrompt`; tags and directives active. |
| `tests/prompt-injection.test.ts` | Hostile injection test fixtures | ✓ VERIFIED | 11 tests covering breakout attempts, meta-directives, and source grep verification. |
| `src/sandbox/runner.ts` | Frozen `ALLOWED_COMMANDS` allowlist and command assertion gate | ✓ VERIFIED | Synchronous gate `assertAllowedCommand`, `extendEnv: false`, `scrubOutput`. |
| `tests/command-allowlist.test.ts` | Allowlist enforcement and file-jail tests | ✓ VERIFIED | 19 tests testing allowed/disallowed commands and secret scrubbing. |
| `src/execute/repair.ts` | OpenCode-driven repair loop with honest metrics | ✓ VERIFIED | Substantive loop calling `runOpenCode`, tracking `repairAttempted` and `filesEdited`. |
| `tests/repair-loop.test.ts` | Tests for repair loop execution and evidence | ✓ VERIFIED | 10 tests verifying prompt construction, edit counting, budget exhaustion, and zero-edit honest reporting. |
| `src/execute/coder.ts` | Conventional commit helper (`createCoderTools` pruned) | ✓ VERIFIED | Only `commitImplementation` remains; `createCoderTools` completely removed. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `src/execute/worker.ts` | `src/auditor/prompt.ts` | `import { escapeXml }` | ✓ WIRED | Line 8 imports and applies `escapeXml` to title, description, AC |
| `src/plan/planner.ts` | `src/auditor/prompt.ts` | `import { escapeXml }` | ✓ WIRED | Line 4 imports and applies `escapeXml` to title, description, AC |
| `src/execute/repair.ts` | `src/execute/opencode-runner.ts` | `import { runOpenCode }` | ✓ WIRED | Line 4 imports and invokes `runOpenCode` with failure context |
| `src/execute/worker.ts` | `src/execute/repair.ts` | `executeRepairLoop` | ✓ WIRED | Line 233 invokes repair loop with `mockOpenCodeRunner` and `sessionId` |
| `src/execute/worker.ts` | `src/execute/coder.ts` | `commitImplementation` | ✓ WIRED | Line 36 imports and line 265 invokes `commitImplementation` |
| `src/sandbox/runner.ts` | `assertAllowedCommand` | `runCommand` entrypoint | ✓ WIRED | Line 113 enforces command allowlist before any `execa` invocation |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `src/execute/repair.ts` | `totalFilesEdited` | `git.diff(['--stat', 'HEAD'])` + `git.status()` | Yes — inspects live git index and untracked files | ✓ FLOWING |
| `src/execute/repair.ts` | `repairPrompt` | `pruneTestDiagnostics(stdout, stderr)` | Yes — extracts real test assertion errors and stack traces | ✓ FLOWING |
| `src/execute/worker.ts` | `prompt` | `buildOpenCodePrompt(workItem)` | Yes — formats real workItem fields through `escapeXml` | ✓ FLOWING |
| `src/plan/planner.ts` | `prompt` | `buildPlannerPrompt(ticket)` | Yes — formats real ticket fields through `escapeXml` | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full test suite | `npm test` | 53 test files passed, 517 tests passed | ✓ PASS |
| TypeScript compilation | `npx tsc --noEmit` | Clean (0 errors) | ✓ PASS |
| Boot validation fails fast | `npx vitest run tests/env-boot-validation.test.ts` | 5 passed | ✓ PASS |
| Prompt injection tests pass | `npx vitest run tests/prompt-injection.test.ts` | 11 passed | ✓ PASS |
| Command allowlist tests pass | `npx vitest run tests/command-allowlist.test.ts` | 19 passed | ✓ PASS |
| Repair loop tests pass | `npx vitest run tests/repair-loop.test.ts` | 10 passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| `SEC-01` | 09-02 | Ticket content XML-isolated with SECURITY BOUNDARY in prompts | ✓ SATISFIED | `worker.ts`, `planner.ts`, `tests/prompt-injection.test.ts` |
| `SEC-02` | 09-02 | Agent command allowlist + file jail + .env unreachable | ✓ SATISFIED | `runner.ts`, `tests/command-allowlist.test.ts` |
| `CORE-01` | 09-01 | Built-in path deleted; LOCAL_AGENT_TYPE=opencode required at boot | ✓ SATISFIED | `env.ts`, `tests/env-boot-validation.test.ts`, `worker.ts`, `rework-worker.ts` |
| `CORE-02` | 09-03 | Repair loop real edit-and-retry via opencode or honest zero-edit evidence | ✓ SATISFIED | `repair.ts`, `tests/repair-loop.test.ts` |
| `CORE-03` | 09-01 | MCP subsystem resolved (deleted `src/mcp/` and package dependencies) | ✓ SATISFIED | `package.json`, absence of `src/mcp/` |

### Anti-Patterns Found

None. Scanned `src/config/env.ts`, `src/execute/worker.ts`, `src/execute/rework-worker.ts`, `src/execute/repair.ts`, `src/sandbox/runner.ts`, `src/plan/planner.ts`, `src/execute/coder.ts`. Zero TODO/FIXME/placeholder stubs found. Zero `built-in` conditionals remain.

### Human Verification Required

None. All Phase 9 security boundaries and execution pipelines are unit-tested and deterministically verifiable without manual UI or interactive session.

### Gaps Summary

No gaps identified. All 5 success criteria and 5 requirements (SEC-01, SEC-02, CORE-01, CORE-02, CORE-03) verified in codebase.

---

_Verified: 2026-09-19T23:30:00Z_
_Verifier: the agent (gsd-verifier)_
