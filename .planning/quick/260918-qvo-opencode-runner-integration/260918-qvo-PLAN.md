---
phase: 260918-qvo-opencode-runner-integration
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/config/env.ts
  - src/ai/provider.ts
  - src/auditor/evaluator.ts
  - src/plan/planner.ts
  - .env.example
  - src/execute/opencode-runner.ts
  - src/execute/worker.ts
  - src/execute/rework-worker.ts
  - tests/opencode-runner.test.ts
  - tests/state-matrix-sync.test.ts
autonomous: true
requirements:
  - OPENCODE-01
  - OPENCODE-02
  - OPENCODE-03

must_haves:
  truths:
    - "Custom LLM API endpoint and credentials can be configured via environment variables and are consumed by AI evaluator and planner"
    - "OpenCode runner executes headless opencode CLI, streams JSONL events, captures sessionId, and handles execution timeouts"
    - "Execution worker and rework worker delegate coding to OpenCode runner when LOCAL_AGENT_TYPE is 'opencode', preserving sessionId for iterative rework loops"
    - "Unit test suite for OpenCode runner passes and entire project passes npm test and npx tsc --noEmit"
  artifacts:
    - path: "src/config/env.ts"
      provides: "Zod env schema extended with API_ENDPOINT, API_KEY, API_MODEL, LOCAL_AGENT_TYPE, OPENCODE_BIN, and OPENCODE_TIMEOUT_MS"
      contains: "LOCAL_AGENT_TYPE"
    - path: "src/ai/provider.ts"
      provides: "OpenAI-compatible AI model provider wrapping createOpenAI with custom stream fetch handler"
      exports: ["getModel", "appModel"]
    - path: "src/execute/opencode-runner.ts"
      provides: "Terminal runner for headless opencode run CLI with JSONL parsing and session ID tracking"
      exports: ["runOpenCode", "parseJsonlEvents"]
    - path: "tests/opencode-runner.test.ts"
      provides: "Unit and integration tests for JSONL parser, session ID extraction, CLI execution, and worker wiring"
      min_lines: 80
  key_links:
    - from: "src/auditor/evaluator.ts"
      to: "src/ai/provider.ts"
      via: "appModel import"
      pattern: "from '\\.\\./ai/provider\\.js'"
    - from: "src/plan/planner.ts"
      to: "src/ai/provider.ts"
      via: "appModel import"
      pattern: "from '\\.\\./ai/provider\\.js'"
    - from: "src/execute/worker.ts"
      to: "src/execute/opencode-runner.ts"
      via: "runOpenCode invocation"
      pattern: "runOpenCode\\("
    - from: "src/execute/rework-worker.ts"
      to: "src/execute/opencode-runner.ts"
      via: "runOpenCode invocation"
      pattern: "runOpenCode\\("
---

<objective>
Integrate local OpenCode agent CLI runner into execution and rework pipelines and configure custom OpenAI-compatible LLM endpoint.

Purpose: Allow orchestrator to delegate code implementation and rework turns to local OpenCode CLI (`opencode run`) while routing LLM evaluation calls to custom endpoints.
Output: `src/config/env.ts`, `src/ai/provider.ts`, `src/execute/opencode-runner.ts`, updated workers, and test suite.
</objective>

<execution_context>
@$HOME/.config/antigravity/get-shit-done/workflows/execute-plan.md
@$HOME/.config/antigravity/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/config/env.ts
@src/auditor/evaluator.ts
@src/plan/planner.ts
@src/execute/worker.ts
@src/execute/rework-worker.ts
@src/sandbox/runner.ts

<interfaces>
From src/config/env.ts:
```typescript
export const EnvSchema: z.ZodObject<...>;
export type Env = z.infer<typeof EnvSchema>;
export const env: Env;
```

From src/sandbox/runner.ts:
```typescript
export interface CommandOptions {
  cwd: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}
export function sanitizeEnv(customEnv?: Record<string, string>): NodeJS.ProcessEnv;
export function scrubOutput(text: string, knownSecrets?: string[]): string;
export function runCommand(file: string, args: string[], options: CommandOptions, knownSecrets?: string[]): Promise<CommandResult>;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Config & AI Provider</name>
  <files>src/config/env.ts, src/ai/provider.ts, src/auditor/evaluator.ts, src/plan/planner.ts, .env.example</files>
  <behavior>
    - EnvSchema parses API_ENDPOINT (optional url), API_KEY (optional string), API_MODEL (default 'gpt-4o'), LOCAL_AGENT_TYPE (enum 'opencode' | 'built-in', default 'built-in'), OPENCODE_BIN (default 'opencode'), OPENCODE_TIMEOUT_MS (number default 180000).
    - src/ai/provider.ts creates OpenAI provider using createOpenAI from @ai-sdk/openai with baseURL configured when API_ENDPOINT is provided, apiKey set from API_KEY or OPENAI_API_KEY, and custom fetch handler.
    - src/auditor/evaluator.ts and src/plan/planner.ts consume provider model instead of direct hardcoded openai('gpt-4o').
  </behavior>
  <action>
    1. Update `src/config/env.ts`:
       - Add `API_ENDPOINT: z.string().url().optional()`.
       - Add `API_KEY: z.string().optional()`.
       - Add `API_MODEL: z.string().default('gpt-4o')`.
       - Add `LOCAL_AGENT_TYPE: z.enum(['opencode', 'built-in']).default('built-in')`.
       - Add `OPENCODE_BIN: z.string().default('opencode')`.
       - Add `OPENCODE_TIMEOUT_MS: z.coerce.number().default(180_000)`.
    2. Create `src/ai/provider.ts`:
       - Import `createOpenAI` from `@ai-sdk/openai` and `env` from `../config/env.js`.
       - Define custom stream fetch wrapper `customStreamFetch(input, init)` that forwards requests with custom headers/logging and preserves streaming response bodies.
       - Instantiate custom provider:
         ```typescript
         export const customOpenAi = createOpenAI({
           baseURL: env.API_ENDPOINT || undefined,
           apiKey: env.API_KEY || env.OPENAI_API_KEY,
           fetch: customStreamFetch,
         });
         ```
       - Export `getModel(modelName?: string)` returning `customOpenAi(modelName || env.API_MODEL || 'gpt-4o')`.
       - Export `appModel = getModel()`.
    3. Update `src/auditor/evaluator.ts`:
       - Replace `import { openai } from '@ai-sdk/openai';` with `import { appModel } from '../ai/provider.js';`.
       - Use `model: appModel` in `generateText` call. Preserve deterministic test fallback.
    4. Update `src/plan/planner.ts`:
       - Replace `import { openai } from '@ai-sdk/openai';` with `import { appModel } from '../ai/provider.js';`.
       - Use `model: appModel` in `generateText` call. Preserve deterministic test fallback.
    5. Update `.env.example` with the new environment variables and defaults.
  </action>
  <verify>
    <automated>npx vitest run tests/auditor.test.ts tests/planner.test.ts</automated>
  </verify>
  <done>EnvSchema validates new vars without breaking existing tests; auditor and planner consume model via src/ai/provider.ts.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: OpenCode Terminal Runner</name>
  <files>src/execute/opencode-runner.ts</files>
  <behavior>
    - parseJsonlEvents parses raw JSONL stream lines, filters invalid or empty lines, and aggregates OpenCode events.
    - extractSessionId extracts session identifier from OpenCode events (checking session_id, sessionId, or nested session object).
    - buildOpenCodeArgs constructs ['run', '--dir', cwd, '--auto', '--format', 'json', '-m', model, ...(sessionId ? ['--session', sessionId] : []), message].
    - runOpenCode executes CLI via execa with shell: false, sanitized env, execution timeout (180s default), parses stdout JSONL, captures sessionId, and handles process termination or failure.
  </behavior>
  <action>
    1. Create `src/execute/opencode-runner.ts`.
    2. Define interfaces:
       ```typescript
       export interface OpenCodeEvent {
         type?: string;
         session_id?: string;
         sessionId?: string;
         data?: any;
         [key: string]: any;
       }
       export interface OpenCodeRunOptions {
         cwd: string;
         message: string;
         model?: string;
         sessionId?: string;
         timeoutMs?: number;
         binPath?: string;
         customEnv?: Record<string, string>;
         mockRunner?: (args: string[], cwd: string) => Promise<{ stdout: string; stderr: string; exitCode: number; timedOut?: boolean }>;
       }
       export interface OpenCodeRunResult {
         success: boolean;
         sessionId?: string;
         output: string;
         events: OpenCodeEvent[];
         exitCode: number;
         timedOut: boolean;
         error?: string;
       }
       ```
    3. Implement helper functions:
       - `parseJsonlEvents(rawText: string): OpenCodeEvent[]`: splits text by newline, attempts JSON.parse on each trimmed line, retains parsed objects.
       - `extractSessionId(events: OpenCodeEvent[]): string | undefined`: scans events for `session_id`, `sessionId`, `session.id`, `session?.session_id`.
       - `buildOpenCodeArgs(options: { cwd: string; message: string; model?: string; sessionId?: string }): string[]`.
    4. Implement `runOpenCode(options: OpenCodeRunOptions): Promise<OpenCodeRunResult>`:
       - Resolve binary (`options.binPath || env.OPENCODE_BIN || 'opencode'`), model (`options.model || env.API_MODEL || 'gpt-4o'`), and timeout (`options.timeoutMs ?? env.OPENCODE_TIMEOUT_MS ?? 180_000`).
       - If `options.mockRunner` is provided, execute mock runner.
       - Else invoke `execa` directly with argument array (`shell: false`, `cwd: options.cwd`, `timeout: timeoutMs`, `killSignal: 'SIGTERM'`, `forceKillAfterDelay: 2000`).
       - Pass environment including `API_KEY`, `OPENAI_API_KEY`, `API_ENDPOINT`, `API_MODEL` sanitized with `sanitizeEnv`.
       - Parse stdout JSONL lines using `parseJsonlEvents`. Extract `sessionId` from events or fallback to `options.sessionId`.
       - Aggregate message text from events into `output`.
       - Handle process errors and timeouts, setting `timedOut: Boolean(err.timedOut)`, `exitCode: err.exitCode ?? 1`, and returning structured `OpenCodeRunResult`.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>src/execute/opencode-runner.ts exports runOpenCode, parseJsonlEvents, and extractSessionId with full type contracts and timeout safety.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Integration & Verification</name>
  <files>src/execute/worker.ts, src/execute/rework-worker.ts, tests/opencode-runner.test.ts, tests/state-matrix-sync.test.ts</files>
  <behavior>
    - worker.ts delegates code editing in worktree to runOpenCode when env.LOCAL_AGENT_TYPE === 'opencode' and mockCodeEdit is not set.
    - rework-worker.ts delegates rework prompt to runOpenCode with existing sessionId when env.LOCAL_AGENT_TYPE === 'opencode' and mockCodeEdit is not set.
    - tests/opencode-runner.test.ts verifies JSONL parsing, session ID capture, CLI args, timeout failure, and worker integration.
    - tests/state-matrix-sync.test.ts passes by checking active ROADMAP.md or archived milestones/v2.0-ROADMAP.md.
    - Entire test suite passes via npm test.
  </behavior>
  <action>
    1. Wire OpenCode runner into `src/execute/worker.ts`:
       - Import `runOpenCode` from `./opencode-runner.js`.
       - In `runExecutionPipeline`:
         ```typescript
         if (options?.mockCodeEdit) {
           await options.mockCodeEdit(worktreeResult.worktreePath);
         } else if (env.LOCAL_AGENT_TYPE === 'opencode') {
           const prompt = `Implement the following requirement:\n\nTitle: ${workItem.title}\n\nDescription: ${workItem.description}\n\nAcceptance Criteria:\n${workItem.acceptanceCriteria}`;
           const runRes = await runOpenCode({
             cwd: worktreeResult.worktreePath,
             message: prompt,
           });
           if (!runRes.success) {
             throw new Error(`OpenCode execution failed (exit ${runRes.exitCode}): ${runRes.error || runRes.output}`);
           }
         }
         ```
    2. Wire OpenCode runner into `src/execute/rework-worker.ts`:
       - Import `runOpenCode` from `./opencode-runner.js`.
       - In `processWorkItemRework`:
         ```typescript
         if (options?.mockCodeEdit) {
           await options.mockCodeEdit(worktreeResult.worktreePath, reworkPrompt);
         } else if (env.LOCAL_AGENT_TYPE === 'opencode') {
           const runRes = await runOpenCode({
             cwd: worktreeResult.worktreePath,
             message: reworkPrompt,
           });
           if (!runRes.success) {
             throw new Error(`OpenCode rework failed (exit ${runRes.exitCode}): ${runRes.error || runRes.output}`);
           }
         }
         ```
    3. Update `tests/state-matrix-sync.test.ts` to locate matrix header in `.planning/ROADMAP.md` or `.planning/milestones/v2.0-ROADMAP.md` to guarantee test suite integrity post-v2.0 milestone archive.
    4. Create `tests/opencode-runner.test.ts`:
       - Test JSONL event parsing with multi-line, malformed, and mixed output.
       - Test `extractSessionId` with diverse event payloads (`session_id`, `sessionId`, `session.id`).
       - Test `buildOpenCodeArgs` flag ordering, `--auto`, `--format json`, `-m`, and `--session` inclusion.
       - Test `runOpenCode` timeout handling with mock runner returning timedOut = true.
       - Test `processWorkItemExecute` and `processWorkItemRework` invoking `runOpenCode` when `LOCAL_AGENT_TYPE === 'opencode'`.
    5. Run verification suite: `npx vitest run tests/opencode-runner.test.ts`, `npx tsc --noEmit`, and full `npm test`.
  </action>
  <verify>
    <automated>npm test</automated>
  </verify>
  <done>All tests pass cleanly, TypeScript compiles with zero errors, and OpenCode runner is wired into worker execution lanes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Ticket Input → OpenCode CLI | Untrusted work item title/description passed as prompt arguments to local CLI |
| Process Execution Sandbox | Subprocess environment variable exposure and potential secret leakage |
| File System Worktree | OpenCode writing files within bounded git worktree directory |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-OPENCODE-01 | Tampering / Command Injection | `src/execute/opencode-runner.ts` | mitigate | Use argument array execution with `shell: false` in execa; avoid shell interpolation for user prompt string |
| T-OPENCODE-02 | Information Disclosure | `src/execute/opencode-runner.ts` | mitigate | Pass only sanitized env vars; scrub PATs and webhook secrets from stdout/stderr using `scrubOutput` |
| T-OPENCODE-03 | Denial of Service | `src/execute/opencode-runner.ts` | mitigate | Enforce bounded timeout (`OPENCODE_TIMEOUT_MS`, default 180s) with SIGTERM cascade and SIGKILL escalation |
| T-OPENCODE-04 | Elevation of Privilege | `src/config/env.ts` | mitigate | Validate endpoint URLs with Zod `z.string().url()` and restrict `LOCAL_AGENT_TYPE` to enum values |
</threat_model>

<verification>
Automated verification commands:
- `npx vitest run tests/opencode-runner.test.ts`
- `npx tsc --noEmit`
- `npm test`
</verification>

<success_criteria>
- `src/config/env.ts` validates custom API endpoint, model, and agent type.
- `src/ai/provider.ts` creates OpenAI-compatible model with custom fetch.
- `src/execute/opencode-runner.ts` parses JSONL, captures sessionId, and executes headless opencode.
- `src/execute/worker.ts` and `src/execute/rework-worker.ts` integrate OpenCode runner under `LOCAL_AGENT_TYPE === 'opencode'`.
- `tests/opencode-runner.test.ts` passes and all 47 test suites pass in `npm test`.
</success_criteria>

<output>
After completion, create `.planning/quick/260918-qvo-opencode-runner-integration/260918-qvo-SUMMARY.md`
</output>
