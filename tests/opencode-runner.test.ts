import { describe, it, expect } from 'vitest';
import {
  parseJsonlEvents,
  extractSessionId,
  buildOpenCodeArgs,
  runOpenCode,
  type OpenCodeEvent,
} from '../src/execute/opencode-runner.js';

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

    it('extracts nested data.session_id', () => {
      expect(extractSessionId([{ data: { session_id: 'ses_mno' } }])).toBe('ses_mno');
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
});
