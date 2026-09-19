# Phase 9: Opencode-Only Honest Core - Context

**Gathered:** 2026-09-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the agent core honest and secure: delete the built-in no-op coding path, require `LOCAL_AGENT_TYPE=opencode` with fail-fast boot validation, close the CRITICAL injection-to-secret-theft chain (C1), delete the runtime-dead MCP subsystem, and make the repair loop real-or-honest. After this phase, no route can record L3/Dev Done with zero edits, no untrusted ticket content reaches a prompt un-isolated, and no agent subprocess can read the orchestrator's `.env`.

Requirements: SEC-01, SEC-02, CORE-01, CORE-02, CORE-03.

</domain>

<decisions>
## Implementation Decisions

### MCP Resolution
- **Delete** the entire `src/mcp/` tree (server.ts, registry.ts, types.ts, tools/{common,frontend,backend,infra}.ts) and `tests/mcp-registry.test.ts`.
- **Remove** `@ai-sdk/mcp` and `@modelcontextprotocol/sdk` from package.json dependencies + `npm install` to update lockfile.
- Remove all MCP references from `src/execute/worker.ts` (session creation at :392-401, close at :440/469) and any other callers.
- Opencode has its own tools — no wiring needed.

### Repair Loop
- Repair loop re-invokes `runOpenCode` with failure context (test output + error stack) appended to the prompt. Each cycle = fresh opencode run with the worktree in its post-failure state. Cycle count tracked in TicketState (existing `repairCycles` field).
- When opencode exits without edits (git diff empty after run): record `repairAttempted: true, filesEdited: 0` in evidence. Never fabricate "repairs made".
- The old stub in `src/execute/repair.ts` that re-runs identical tests ≤5× without edits is deleted or rewritten to delegate to the opencode runner.
- Max repair cycles stay clamped at the existing config (default 3, max 5).

### Injection Chain Closure (CRITICAL)
- **Prompt isolation (SEC-01):** Wrap ticket title/description/AC in `<user_ticket_input>` tags with `escapeXml` + explicit SECURITY BOUNDARY directive in both the opencode execution prompt (`src/execute/worker.ts`) and the planner prompt (`src/plan/planner.ts`). Reuse the auditor's `escapeXml` function from `src/auditor/prompt.ts`.
- **Command allowlist (SEC-02):** Argv[0] allowlist in `src/sandbox/runner.ts` (or opencode-runner): only `npm`, `npx`, `node`, `vitest`, `tsc`, `git` (and their `.cmd`/`.exe` variants on Windows) are permitted. Reject all other commands before exec with a descriptive error. The allowlist is a const array, not configurable (principle of least privilege).
- **File-read jail (SEC-02):** Opencode's cwd is the worktree (already set by `createWorktree`). The orchestrator `.env` is at repo root, outside the worktree. Containment is structural: worktree is a separate git worktree under `.worktrees/<id>/`. A test must prove that attempting to read `../../.env` from the worktree is denied. If opencode has any file-read tools, ensure path containment (resolve + startsWith check against worktree root).

### Built-in Path Deletion (CORE-01)
- Delete all `LOCAL_AGENT_TYPE === 'built-in'` branches from `src/execute/worker.ts` and `src/execute/rework-worker.ts`.
- `src/config/env.ts`: make `LOCAL_AGENT_TYPE` required, validate it equals `'opencode'` (fail-fast at boot). Add `OPENCODE_BIN` required with resolvability check (which/where).
- Delete `src/execute/coder.ts` (createCoderTools — dead export, only built-in path used it).
- Update/delete any tests that exercised the built-in path (they tested a no-op anyway).

### Agent's Discretion
- Exact error message format for boot validation failures.
- Whether to inline the repair-via-opencode logic in `repair.ts` or move it into `opencode-runner.ts`.
- Test fixture design for hostile-prompt and file-jail tests.
- Commit granularity within the phase.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `escapeXml` at `src/auditor/prompt.ts:7` — exact function needed for SEC-01.
- `createWorktree` at `src/sandbox/worktree.ts` — already sets cwd for opencode; worktree path is the jail boundary.
- `runOpenCode` at `src/execute/opencode-runner.ts` — the real coding agent invocation; repair loop will re-invoke this.
- `sanitizeEnv` at `src/sandbox/runner.ts:15-42` — env allowlist model; command allowlist follows same pattern.

### Established Patterns
- Boot validation: `src/config/env.ts` uses Zod schema with `.refine()` for cross-field validation.
- Path containment: quadruple-guarded pattern (store.ts, coder.ts, publisher.ts, common.ts) — resolve + startsWith.
- Test conventions: hostile-input tests exist (e.g., `tests/ingress.test.ts:274` port injection attempt `'3000; rm -rf'`).

### Integration Points
- `src/execute/worker.ts` — biggest edit target: MCP removal, built-in path deletion, prompt isolation, repair rewiring.
- `src/execute/rework-worker.ts` — built-in path deletion mirror.
- `src/execute/repair.ts` — stub replacement with real opencode-driven repair.
- `src/config/env.ts` — LOCAL_AGENT_TYPE + OPENCODE_BIN validation.
- `package.json` — MCP dep removal.

</code_context>

<specifics>
## Specific Ideas

- The command allowlist should be a frozen const array, not env-configurable — follows principle of least privilege.
- File-jail test: create a temp worktree, place a `.env` file outside it, attempt traversal read, assert denial.
- Hostile-prompt test: inject `</user_ticket_input>` and meta-directives in ticket description, verify they arrive escaped in the final prompt string.
- Repair loop test: mock opencode to return no-diff on first call, edits on second — verify evidence records both attempts honestly.

</specifics>

<deferred>
## Deferred Ideas

- Actor authorization on verdict tokens → Phase 10 (SEC-03).
- Inline comment sanitization → Phase 10 (SEC-04).
- Container-based sandboxing (Docker) → future (SBOX-01).

</deferred>
