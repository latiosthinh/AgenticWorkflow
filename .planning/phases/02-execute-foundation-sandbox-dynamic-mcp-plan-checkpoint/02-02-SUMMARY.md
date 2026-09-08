---
phase: 02-execute-foundation-sandbox-dynamic-mcp-plan-checkpoint
plan: 02
subsystem: mcp
tags:
  - mcp
  - modelcontextprotocol
  - ai-sdk
  - dynamic-dispatch
  - context-guardrail
  - tool-registry
dependency_graph:
  requires:
    - 02-01 (subprocess runner used by common tools git_status and run_test)
  provides:
    - In-process McpServer bootstrap with InMemoryTransport linked pair (src/mcp/server.ts)
    - Baseline common toolset with path-traversal safe read_file (src/mcp/tools/common.ts)
    - Domain toolsets for frontend, backend, and infra (src/mcp/tools/*.ts)
    - Dynamic tag dispatcher resolving domain tags with 12-tool cap (src/mcp/registry.ts)
  affects:
    - 02-03 (Planning agent queries dynamic MCP tools based on ticket tags)
    - Phase 03 (Autonomous code executor uses dynamically scoped tool sessions)
tech_stack:
  added:
    - "@modelcontextprotocol/sdk@^1.30.0"
    - "@ai-sdk/mcp@^2.0.45"
  patterns:
    - In-process MCP server connected via InMemoryTransport linked pair
    - Dynamic tag dispatching (frontend, backend, infra) defaulting safely to common tools
    - Hard limit of 12 active tools per run with concise descriptions (<=150 chars)
    - Path traversal boundary validation protecting sandbox worktree
key_files:
  created:
    - src/mcp/types.ts
    - src/mcp/server.ts
    - src/mcp/tools/common.ts
    - src/mcp/tools/frontend.ts
    - src/mcp/tools/backend.ts
    - src/mcp/tools/infra.ts
    - src/mcp/registry.ts
    - tests/mcp-registry.test.ts
  modified:
    - package.json
    - package-lock.json
decisions:
  - "Initialized tool request handlers on McpServer prior to connecting InMemoryTransport to permit dynamic runtime tool registration"
  - "Enforced 12-tool ceiling and single-sentence descriptions (<=150 chars) across all tool registrations to prevent LLM prompt pollution and context saturation"
  - "Guarded read_file against path traversal by checking relative resolution against worktreePath root"
  - "Defaulted untagged work items safely to baseline common toolset (git_status, read_file, run_test)"
metrics:
  duration: 6m
  completed_date: "2026-09-08"
  tasks: 2
  files: 10
---

# Phase 02 Plan 02: Dynamic MCP Tool Registry & Tag Dispatcher Summary

Substantive achievement: Implemented in-process Model Context Protocol (MCP) server harness and dynamic domain tag dispatcher mounting tailored toolsets (`frontend`, `backend`, `infra`) with strict 12-tool context limit and path-traversal boundary protection.

## Key Changes

1. **MCP Core Types & Server Harness (`DISP-01`):**
   - Defined `McpToolDefinition`, `ToolRegistryOptions`, `DynamicMcpSession`, and `ToolRegistrationHelper` in `src/mcp/types.ts`.
   - Implemented `createInProcessMcpServer` in `src/mcp/server.ts` utilizing `McpServer` and `InMemoryTransport.createLinkedPair()`.

2. **Common Baseline Tools (`DISP-01`):**
   - Implemented `registerCommonTools` in `src/mcp/tools/common.ts`:
     - `git_status`: Inspects git branch and working tree status via `runCommand`.
     - `read_file`: Reads relative file contents with path traversal boundary check (`path.relative`).
     - `run_test`: Executes test runner commands under 120s timeout sandbox.

3. **Domain Tool Extensions (`DISP-01`):**
   - `src/mcp/tools/frontend.ts`: `inspect_dom_structure`, `inspect_css_styles`.
   - `src/mcp/tools/backend.ts`: `inspect_db_schema`, `validate_api_contract`.
   - `src/mcp/tools/infra.ts`: `lint_infra_config`, `mock_cloud_resource`.

4. **Dynamic Tag Dispatcher & Context Guardrail (`DISP-01`):**
   - Implemented `createDynamicMcpTools` in `src/mcp/registry.ts`:
     - Resolves ADO work item tags (`frontend`, `backend`, `infra`).
     - Safely falls back to common tools when tags are empty or unmatched.
     - Enforces hard 12-tool maximum (`activeToolCount <= 12`), dropping additional tools with warning.
     - Enforces single-sentence concise tool descriptions (<=150 characters).
     - Bridges in-memory transport to Vercel AI SDK tools via `@ai-sdk/mcp`'s `createMCPClient`.
     - Provides clean `close()` method releasing client session.

## Verification Results

Automated test suite via Vitest:
- `tests/mcp-registry.test.ts`: 8 passed (untagged run defaults to 3 common tools; `frontend`, `backend`, `infra` tags mount 5 tools each; multi-tag mounts 9 tools; over-subscription caps at 12 tools; path traversal denied on `../../etc/passwd`; clean session close).
- Full suite (`npm test`): 9 test files, 70 passed.
- Typecheck (`npx tsc --noEmit`): Clean, 0 errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Initialized tool request handlers before connecting InMemoryTransport**
- **Found during:** Task 2 (testing dynamic tool registration on McpServer)
- **Issue:** `@modelcontextprotocol/sdk` throws `"Cannot register capabilities after connecting to transport"` if tools are registered on `McpServer` after `server.connect()` when tool handlers were not initialized.
- **Fix:** Invoked `(server as any).setToolRequestHandlers?.()` during server creation before `server.connect(serverTransport)`, permitting runtime tool additions.
- **Files modified:** `src/mcp/server.ts`
- **Commit:** 1c2bb5f

**2. [Rule 2 - Missing Critical Functionality] Added `extraTools` to `ToolRegistryOptions`**
- **Found during:** Task 2 (testing artificial over-subscription)
- **Issue:** Testing 12-tool cap required a mechanism to simulate over-subscription without fabricating artificial domains in production domain files.
- **Fix:** Added optional `extraTools?: McpToolDefinition[]` to `ToolRegistryOptions` to permit test harnesses to inject mock tools for over-subscription validation.
- **Files modified:** `src/mcp/types.ts`, `src/mcp/registry.ts`
- **Commit:** 1c2bb5f

## Self-Check: PASSED

- FOUND: src/mcp/types.ts
- FOUND: src/mcp/server.ts
- FOUND: src/mcp/tools/common.ts
- FOUND: src/mcp/tools/frontend.ts
- FOUND: src/mcp/tools/backend.ts
- FOUND: src/mcp/tools/infra.ts
- FOUND: src/mcp/registry.ts
- FOUND: tests/mcp-registry.test.ts
- FOUND commit 17981aa: feat(02-02): implement in-process McpServer harness and common toolset
- FOUND commit 1c2bb5f: feat(02-02): implement domain tool extensions and dynamic tag dispatcher
