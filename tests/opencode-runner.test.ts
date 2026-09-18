import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import {
  parseJsonlEvents,
  extractSessionId,
  buildOpenCodeArgs,
  runOpenCode,
  type OpenCodeEvent,
} from '../src/execute/opencode-runner.js';
import { processWorkItemExecute } from '../src/execute/worker.js';
import { processWorkItemRework } from '../src/execute/rework-worker.js';
import { cleanupWorktree } from '../src/sandbox/worktree.js';
import { adoClient } from '../src/ado/client.js';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';

describe('OpenCode Runner', () => {
  describe('parseJsonlEvents', () => {
    it('parses valid JSONL stream lines and ignores invalid/empty lines', () => {
      const raw = `
{"type":"init","session_id":"ses_123"}
malformed non-json line
{"type":"message","content":"Created file src/index.ts"}

{"type":"complete","status":"done"}
`;
      const events = parseJsonlEvents(raw);
      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: 'init', session_id: 'ses_123' });
      expect(events[1]).toEqual({ type: 'message', content: 'Created file src/index.ts' });
      expect(events[2]).toEqual({ type: 'complete', status: 'done' });
    });

    it('returns empty array on empty or whitespace string', () => {
      expect(parseJsonlEvents('')).toEqual([]);
      expect(parseJsonlEvents('   \n\n  ')).toEqual([]);
    });
  });

  describe('extractSessionId', () => {
    it('extracts session_id field', () => {
      const events: OpenCodeEvent[] = [{ type: 'start', session_id: 'ses_abc' }];
      expect(extractSessionId(events)).toBe('ses_abc');
    });

    it('extracts sessionId field', () => {
      const events: OpenCodeEvent[] = [{ type: 'start', sessionId: 'ses_def' }];
      expect(extractSessionId(events)).toBe('ses_def');
    });

    it('extracts nested session.id and session.session_id', () => {
      expect(extractSessionId([{ session: { id: 'ses_ghi' } }])).toBe('ses_ghi');
      expect(extractSessionId([{ session: { session_id: 'ses_jkl' } }])).toBe('ses_jkl');
    });

    it('extracts nested data.session_id and data.sessionId', () => {
      expect(extractSessionId([{ data: { session_id: 'ses_mno' } }])).toBe('ses_mno');
      expect(extractSessionId([{ data: { sessionId: 'ses_pqr' } }])).toBe('ses_pqr');
    });

    it('returns undefined when no session identifier is found', () => {
      expect(extractSessionId([{ type: 'log', message: 'hello' }])).toBeUndefined();
    });
  });

  describe('buildOpenCodeArgs', () => {
    it('constructs correct CLI argument array without session', () => {
      const args = buildOpenCodeArgs({
        cwd: '/worktree/dir',
        message: 'Implement feature',
        model: 'gpt-4o',
      });

      expect(args).toEqual([
        'run',
        '--dir',
        '/worktree/dir',
        '--auto',
        '--format',
        'json',
        '-m',
        'gpt-4o',
        'Implement feature',
      ]);
    });

    it('includes --session flag when sessionId is provided', () => {
      const args = buildOpenCodeArgs({
        cwd: '/worktree/dir',
        message: 'Fix review feedback',
        model: 'custom-model',
        sessionId: 'ses_999',
      });

      expect(args).toEqual([
        'run',
        '--dir',
        '/worktree/dir',
        '--auto',
        '--format',
        'json',
        '-m',
        'custom-model',
        '--session',
        'ses_999',
        'Fix review feedback',
      ]);
    });
  });

  describe('runOpenCode execution with mock runner', () => {
    it('executes successfully and captures sessionId and events', async () => {
      const mock = async (args: string[], cwd: string) => {
        expect(args[0]).toBe('run');
        expect(cwd).toBe('/test/cwd');
        return {
          stdout: '{"type":"session","session_id":"ses_456"}\n{"type":"text","message":"All done"}',
          stderr: '',
          exitCode: 0,
        };
      };

      const result = await runOpenCode({
        cwd: '/test/cwd',
        message: 'Write code',
        mockRunner: mock,
      });

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('ses_456');
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
      expect(result.events).toHaveLength(2);
      expect(result.output).toContain('All done');
    });

    it('scrubs sensitive tokens and keys from output and errors', async () => {
      const originalKey = env.API_KEY;
      (env as any).API_KEY = 'super-secret-api-key-999';
      try {
        const mock = async () => ({
          stdout: 'Loaded key super-secret-api-key-999 successfully',
          stderr: 'Failure with super-secret-api-key-999',
          exitCode: 1,
        });

        const result = await runOpenCode({
          cwd: '/test/cwd',
          message: 'Do not leak keys',
          mockRunner: mock,
        });

        expect(result.output).not.toContain('super-secret-api-key-999');
        expect(result.output).toContain('[REDACTED]');
        expect(result.error).not.toContain('super-secret-api-key-999');
        expect(result.error).toContain('[REDACTED]');
      } finally {
        (env as any).API_KEY = originalKey;
      }
    });

    it('scrubs options.customEnv secrets from output and errors', async () => {
      const mock = async () => ({
        stdout: 'Used custom-api-secret-123 and custom-openai-secret-456 in run',
        stderr: 'Failed with custom-api-secret-123',
        exitCode: 1,
      });

      const result = await runOpenCode({
        cwd: '/test/cwd',
        message: 'Do not leak custom secrets',
        customEnv: {
          API_KEY: 'custom-api-secret-123',
          OPENAI_API_KEY: 'custom-openai-secret-456',
        },
        mockRunner: mock,
      });

      expect(result.output).not.toContain('custom-api-secret-123');
      expect(result.output).not.toContain('custom-openai-secret-456');
      expect(result.output).toContain('[REDACTED]');
      expect(result.error).not.toContain('custom-api-secret-123');
      expect(result.error).toContain('[REDACTED]');
    });

    it('maps OPENAI_BASE_URL and OPENAI_API_KEY when API_ENDPOINT and API_KEY are provided', async () => {
      let capturedEnv: any;
      const mock = async (_args: string[], _cwd: string, envPassed?: any) => {
        capturedEnv = envPassed;
        return {
          stdout: '{"type":"message","content":"ok"}',
          stderr: '',
          exitCode: 0,
        };
      };

      await runOpenCode({
        cwd: '/test/cwd',
        message: 'test env mapping',
        customEnv: {
          API_ENDPOINT: 'https://llm.custom.local/v1',
          API_KEY: 'secret-custom-key',
        },
        mockRunner: mock,
      });

      expect(capturedEnv.API_ENDPOINT).toBe('https://llm.custom.local/v1');
      expect(capturedEnv.API_KEY).toBe('secret-custom-key');
      expect(capturedEnv.OPENAI_BASE_URL).toBe('https://llm.custom.local/v1');
      expect(capturedEnv.OPENAI_API_KEY).toBe('secret-custom-key');
    });

    it('handles process failure and captures error output', async () => {
      const mock = async () => ({
        stdout: '',
        stderr: 'Error: invalid model specified',
        exitCode: 1,
      });

      const result = await runOpenCode({
        cwd: '/test/cwd',
        message: 'Bad run',
        mockRunner: mock,
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('Error: invalid model specified');
    });

    it('handles timeout correctly', async () => {
      const mock = async () => ({
        stdout: '',
        stderr: 'Process terminated due to timeout',
        exitCode: 124,
        timedOut: true,
      });

      const result = await runOpenCode({
        cwd: '/test/cwd',
        message: 'Hung run',
        mockRunner: mock,
      });

      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(124);
    });
  });

  describe('Worker Integration with OpenCode runner', () => {
    let harness: TestStateStoreContext;
    const originalStateDir = env.STATE_STORE_DIR;
    const originalAgentType = env.LOCAL_AGENT_TYPE;
    const rootGit = simpleGit();

    beforeEach(() => {
      harness = createTestStateStore();
      (env as any).STATE_STORE_DIR = harness.tempDir;
      resetStateStore();
      adoClient.setWorkItemTrackingApi(null);
    });

    afterEach(async () => {
      (env as any).LOCAL_AGENT_TYPE = originalAgentType;
      harness.cleanup();
      (env as any).STATE_STORE_DIR = originalStateDir;
      resetStateStore();

      const worktreeDir = path.join(process.cwd(), '.worktrees');
      if (fs.existsSync(worktreeDir)) {
        const entries = fs.readdirSync(worktreeDir);
        for (const entry of entries) {
          if (entry.startsWith('ticket-')) {
            const fullPath = path.join(worktreeDir, entry);
            await cleanupWorktree(process.cwd(), fullPath, { deleteBranch: true }).catch(
              () => {}
            );
          }
        }
      }
      const branches = await rootGit.branchLocal();
      for (const b of branches.all) {
        if (b.startsWith('task/ticket-990') || b.startsWith('task/ticket-991')) {
          await rootGit.raw(['branch', '-D', b]).catch(() => {});
        }
      }
    });

    it('processWorkItemExecute invokes OpenCode runner when LOCAL_AGENT_TYPE is opencode', async () => {
      (env as any).LOCAL_AGENT_TYPE = 'opencode';
      const workItemId = 9901;
      const revId = 1;

      let opencodeCalled = false;
      let capturedArgs: string[] = [];

      const mockWitApi = {
        getWorkItem: vi.fn().mockResolvedValue({
          id: workItemId,
          rev: revId,
          fields: {
            'System.Title': 'OpenCode Worker Integration',
            'System.Description': 'Implement feature with opencode',
            'Microsoft.VSTS.Common.AcceptanceCriteria': 'Feature works and returns 200 OK.',
            'System.State': 'In Dev',
            'System.Tags': 'backend',
          },
        }),
        updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
      };
      adoClient.setWorkItemTrackingApi(mockWitApi as any);
      stateStore.recordDedupEvent(workItemId, revId, 'hash-9901');

      await workItemQueueManager.runInLane(workItemId, () =>
        processWorkItemExecute(workItemId, revId, {
          mockOpenCodeRunner: async (args, cwd) => {
            opencodeCalled = true;
            capturedArgs = args;
            fs.writeFileSync(path.join(cwd, 'opencode_output.ts'), 'export const ready = true;\n');
            return {
              stdout: '{"type":"session","session_id":"ses_exec_01"}\n{"type":"message","content":"Created opencode_output.ts"}',
              stderr: '',
              exitCode: 0,
            };
          },
          mockTestRunner: async () => ({
            passed: true,
            exitCode: 0,
            stdout: 'Tests 1 passed (1)\nDuration 100ms',
            stderr: '',
            timedOut: false,
            durationMs: 100,
          }),
        })
      );

      expect(opencodeCalled).toBe(true);
      expect(capturedArgs[0]).toBe('run');
      expect(capturedArgs).toContain('--auto');
      expect(capturedArgs).toContain('json');

      const ticket = await stateStore.getTicketState(workItemId);
      expect(ticket?.l3Evidence).toHaveLength(1);
    });

    it('processWorkItemRework preserves sessionId and invokes OpenCode runner', async () => {
      (env as any).LOCAL_AGENT_TYPE = 'opencode';
      const workItemId = 9911;
      const revId = 2;
      const branchName = `task/ticket-${workItemId}-opencode-rework-feature`;

      try {
        await rootGit.raw(['branch', branchName, 'HEAD']);
      } catch {
        // ignore if exists
      }

      let opencodeReworkCalled = false;
      let reworkArgs: string[] = [];

      const mockWitApi = {
        getWorkItem: vi.fn().mockResolvedValue({
          id: workItemId,
          rev: revId,
          fields: {
            'System.Title': 'OpenCode Rework Feature',
            'System.Description': 'Initial pass missing edge case.',
            'Microsoft.VSTS.Common.AcceptanceCriteria': 'Handle edge case.',
            'System.State': 'In Dev',
            'System.Tags': 'backend; [awaiting-acceptance]',
            'System.History': 'Add validation for null input. [reject-acceptance]',
          },
        }),
        updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
      };
      adoClient.setWorkItemTrackingApi(mockWitApi as any);
      stateStore.recordDedupEvent(workItemId, revId, 'hash-9911');

      await workItemQueueManager.runInLane(workItemId, () =>
        processWorkItemRework(workItemId, revId, 'Add validation for null input.', {
          openCodeSessionId: 'ses_prior_888',
          mockOpenCodeRunner: async (args, cwd) => {
            opencodeReworkCalled = true;
            reworkArgs = args;
            fs.writeFileSync(path.join(cwd, 'rework_fix.ts'), 'export const edgeCaseHandled = true;\n');
            return {
              stdout: '{"type":"session","session_id":"ses_prior_888"}\n{"type":"message","content":"Applied rework fix"}',
              stderr: '',
              exitCode: 0,
            };
          },
          mockTestRunner: async () => ({
            passed: true,
            exitCode: 0,
            stdout: 'Tests 2 passed (2)\nDuration 120ms',
            stderr: '',
            timedOut: false,
            durationMs: 120,
          }),
        })
      );

      expect(opencodeReworkCalled).toBe(true);
      expect(reworkArgs).toContain('--session');
      expect(reworkArgs).toContain('ses_prior_888');
    });
  });
});
