import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sqlite } from '../src/db/index.js';
import {
  checkStagingHealth,
  runQaSuite,
  executeTwoStrikeQaFilter,
  type QaRunResult,
} from '../src/qa/runner.js';
import { extractFailureFingerprints } from '../src/qa/fingerprint.js';

describe('QA Test Runner and 2-Strike Sequential Filter', () => {
  beforeEach(() => {
    sqlite.exec('DELETE FROM qa_runs;');
    vi.restoreAllMocks();
  });

  describe('checkStagingHealth', () => {
    it('returns healthy when no health URL is configured', async () => {
      const result = await checkStagingHealth(undefined);
      expect(result.healthy).toBe(true);
    });

    it('returns healthy when staging endpoint returns 200', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        status: 200,
      } as any);

      const result = await checkStagingHealth('https://staging.example.com/health');
      expect(fetchSpy).toHaveBeenCalled();
      expect(result.healthy).toBe(true);
      expect(result.status).toBe(200);
    });

    it('returns unhealthy when staging endpoint returns 503', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        status: 503,
      } as any);

      const result = await checkStagingHealth('https://staging.example.com/health');
      expect(result.healthy).toBe(false);
      expect(result.status).toBe(503);
      expect(result.error).toContain('HTTP 503');
    });

    it('returns unhealthy when network request fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await checkStagingHealth('https://staging.example.com/health');
      expect(result.healthy).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
    });
  });

  describe('runQaSuite', () => {
    it('parses successful test execution', async () => {
      const mockRunCommand = vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: '✓ tests/integration/api.test.ts (2 passed)\nTests 2 passed (2)',
        stderr: '',
        timedOut: false,
      });

      const result = await runQaSuite('/tmp/worktree', 'npm run test:integration', mockRunCommand as any);

      expect(result.passed).toBe(true);
      expect(result.parsedSummary.passed).toBe(2);
      expect(result.failures).toHaveLength(0);
    });

    it('parses failed test execution and extracts failure fingerprints', async () => {
      const mockRunCommand = vi.fn().mockResolvedValue({
        exitCode: 1,
        stdout: 'FAIL tests/integration/api.test.ts > POST /api/items > returns 201\nAssertionError: expected 500 to be 201',
        stderr: '',
        timedOut: false,
      });

      const result = await runQaSuite('/tmp/worktree', 'npm run test:integration', mockRunCommand as any);

      expect(result.passed).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.failures[0].testFile).toContain('tests/integration/api.test.ts');
    });
  });

  describe('executeTwoStrikeQaFilter', () => {
    it('returns passed on first run without second run execution', async () => {
      const mockPassedRun: QaRunResult = {
        passed: true,
        exitCode: 0,
        stdout: 'Tests 5 passed (5)',
        stderr: '',
        durationMs: 1200,
        failures: [],
        parsedSummary: { totalTests: 5, passed: 5, failed: 0 },
      };

      const runnerFn = vi.fn().mockResolvedValue(mockPassedRun);

      const result = await executeTwoStrikeQaFilter({
        workItemId: 3001,
        commitSha: 'c0ffee1',
        worktreePath: '/tmp/worktree',
        runnerFn,
      });

      expect(runnerFn).toHaveBeenCalledTimes(1);
      expect(result.outcome).toBe('passed');
      expect(result.flakeCleared).toBe(false);
      expect(result.identicalFailures).toBe(false);
    });

    it('clears flake when Run 1 fails but Run 2 passes', async () => {
      const mockFailRun: QaRunResult = {
        passed: false,
        exitCode: 1,
        stdout: 'FAIL tests/integration/db.test.ts > pool connection\nError: Connection timeout',
        stderr: '',
        durationMs: 2500,
        failures: extractFailureFingerprints([
          {
            testFile: 'tests/integration/db.test.ts',
            testName: 'pool connection',
            errorMessage: 'Error: Connection timeout',
          },
        ]),
        parsedSummary: { totalTests: 5, passed: 4, failed: 1 },
      };

      const mockPassRun: QaRunResult = {
        passed: true,
        exitCode: 0,
        stdout: 'Tests 5 passed (5)',
        stderr: '',
        durationMs: 1100,
        failures: [],
        parsedSummary: { totalTests: 5, passed: 5, failed: 0 },
      };

      const runnerFn = vi
        .fn()
        .mockResolvedValueOnce(mockFailRun)
        .mockResolvedValueOnce(mockPassRun);

      const result = await executeTwoStrikeQaFilter({
        workItemId: 3002,
        commitSha: 'c0ffee2',
        worktreePath: '/tmp/worktree',
        runnerFn,
      });

      expect(runnerFn).toHaveBeenCalledTimes(2);
      expect(result.outcome).toBe('flaked');
      expect(result.flakeCleared).toBe(true);
      expect(result.identicalFailures).toBe(false);
    });

    it('confirms genuine regression when Run 1 and Run 2 fail with identical signatures', async () => {
      const failures = [
        {
          testFile: 'tests/integration/checkout.test.ts',
          testName: 'calculateTax',
          errorMessage: 'AssertionError: expected 10 to equal 15 at 2026-09-09T10:00:00Z',
        },
      ];

      const mockFailRun1: QaRunResult = {
        passed: false,
        exitCode: 1,
        stdout: 'FAIL tests/integration/checkout.test.ts',
        stderr: '',
        durationMs: 1500,
        failures: extractFailureFingerprints(failures),
        parsedSummary: { totalTests: 10, passed: 9, failed: 1 },
      };

      const mockFailRun2: QaRunResult = {
        passed: false,
        exitCode: 1,
        stdout: 'FAIL tests/integration/checkout.test.ts',
        stderr: '',
        durationMs: 1600,
        failures: extractFailureFingerprints(failures),
        parsedSummary: { totalTests: 10, passed: 9, failed: 1 },
      };

      const runnerFn = vi
        .fn()
        .mockResolvedValueOnce(mockFailRun1)
        .mockResolvedValueOnce(mockFailRun2);

      const result = await executeTwoStrikeQaFilter({
        workItemId: 3003,
        commitSha: 'c0ffee3',
        worktreePath: '/tmp/worktree',
        runnerFn,
      });

      expect(runnerFn).toHaveBeenCalledTimes(2);
      expect(result.outcome).toBe('failed');
      expect(result.flakeCleared).toBe(false);
      expect(result.identicalFailures).toBe(true);
    });

    it('detects non-identical failures when Run 1 and Run 2 fail on different tests', async () => {
      const mockFailRun1: QaRunResult = {
        passed: false,
        exitCode: 1,
        stdout: 'FAIL tests/integration/a.test.ts',
        stderr: '',
        durationMs: 1500,
        failures: extractFailureFingerprints([
          { testFile: 'tests/a.test.ts', testName: 'test A', errorMessage: 'Fail A' },
        ]),
        parsedSummary: { totalTests: 10, passed: 9, failed: 1 },
      };

      const mockFailRun2: QaRunResult = {
        passed: false,
        exitCode: 1,
        stdout: 'FAIL tests/integration/b.test.ts',
        stderr: '',
        durationMs: 1600,
        failures: extractFailureFingerprints([
          { testFile: 'tests/b.test.ts', testName: 'test B', errorMessage: 'Fail B' },
        ]),
        parsedSummary: { totalTests: 10, passed: 9, failed: 1 },
      };

      const runnerFn = vi
        .fn()
        .mockResolvedValueOnce(mockFailRun1)
        .mockResolvedValueOnce(mockFailRun2);

      const result = await executeTwoStrikeQaFilter({
        workItemId: 3004,
        commitSha: 'c0ffee4',
        worktreePath: '/tmp/worktree',
        runnerFn,
      });

      expect(result.outcome).toBe('failed');
      expect(result.identicalFailures).toBe(false);
      expect(result.diff.length).toBeGreaterThan(0);
    });
  });
});
