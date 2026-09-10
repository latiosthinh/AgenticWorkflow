import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, sqlite } from '../src/db/index.js';
import { qaEvidence, qaBounces, qaRuns } from '../src/db/schema.js';
import { adoClient } from '../src/ado/client.js';
import {
  formatQaEvidenceComment,
  formatQaDiagnosticsComment,
  formatQaEscalationComment,
} from '../src/qa/formatter.js';
import { processQaVerification } from '../src/qa/worker.js';
import { routeWorkItemEvent } from '../src/execute/router.js';
import { extractFailureFingerprints } from '../src/qa/fingerprint.js';
import { eq } from 'drizzle-orm';

describe('QA Orchestrator, Formatters & State Transitions', () => {
  beforeEach(() => {
    sqlite.exec('DELETE FROM qa_evidence;');
    sqlite.exec('DELETE FROM qa_bounces;');
    sqlite.exec('DELETE FROM qa_runs;');
    vi.restoreAllMocks();
  });

  describe('Formatters', () => {
    it('formats QA evidence comment with loop shield and metrics', () => {
      const comment = formatQaEvidenceComment({
        totalTests: 25,
        passedCount: 25,
        failedCount: 0,
        durationMs: 4200,
        commitSha: 'abcdef1234567890',
        stagingUrl: 'https://staging.internal.net',
        flakeCleared: false,
      });

      expect(comment).toContain('[QA Passed]');
      expect(comment).toContain('25');
      expect(comment).toContain('4.20s');
      expect(comment).toContain('abcdef12');
      expect(comment).toContain('https://staging.internal.net');
      expect(comment).toContain('<!-- [automated-agent] -->');
    });

    it('formats QA diagnostics comment with reproduction command and collapsible logs', () => {
      const failures = extractFailureFingerprints([
        {
          testFile: 'tests/integration/cart.test.ts',
          testName: 'checkout flow',
          errorMessage: 'StagingApiError: 504 Gateway Timeout',
        },
      ]);

      const comment = formatQaDiagnosticsComment({
        workItemId: 4001,
        commitSha: '9876543210fedcba',
        failures,
        stdoutTail: 'running integration test suite...',
        stderrTail: 'StagingApiError: 504 Gateway Timeout',
        currentBounce: 1,
        maxBounces: 2,
      });

      expect(comment).toContain('[QA Failure Diagnostic]');
      expect(comment).toContain('1 of 2');
      expect(comment).toContain('git checkout 9876543210fedcba');
      expect(comment).toContain('npm run test:integration');
      expect(comment).toContain('<details>');
      expect(comment).toContain('<summary>');
      expect(comment).toContain('<!-- [automated-agent] -->');
    });

    it('formats QA escalation comment when bounce cap is tripped', () => {
      const comment = formatQaEscalationComment({
        workItemId: 4002,
        bounceCount: 2,
        maxBounces: 2,
        failureSummary: 'Database migration connection timeout',
      });

      expect(comment).toContain('QA Rework Breaker Tripped');
      expect(comment).toContain('[qa-escalated]');
      expect(comment).toContain('<!-- [automated-agent] -->');
    });
  });

  describe('processQaVerification', () => {
    it('transitions passing QA verification to Ready to Deploy with [qa-verified]', async () => {
      const workItemId = 4101;

      vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
        id: workItemId,
        rev: 2,
        fields: {
          'System.Title': 'Implement feature X',
          'System.State': 'Ready for QA',
          'System.Tags': '[pr-merged]',
        },
      } as any);

      const updateSpy = vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({
        id: workItemId,
      } as any);

      const mockRunner = vi.fn().mockResolvedValue({
        passed: true,
        exitCode: 0,
        stdout: 'Tests 10 passed (10)',
        stderr: '',
        durationMs: 3000,
        failures: [],
        parsedSummary: { totalTests: 10, passed: 10, failed: 0 },
      });

      const result = await processQaVerification(workItemId, {
        mockRunner,
        stagingUrl: 'https://staging.test.local',
      });

      expect(result?.outcome).toBe('passed');
      expect(updateSpy).toHaveBeenCalledWith(
        workItemId,
        expect.arrayContaining([
          expect.objectContaining({ path: '/fields/System.State', value: 'Ready to Deploy' }),
          expect.objectContaining({
            path: '/fields/System.Tags',
            value: expect.stringContaining('[qa-verified]'),
          }),
        ])
      );

      const evidence = db
        .select()
        .from(qaEvidence)
        .where(eq(qaEvidence.workItemId, workItemId))
        .get();

      expect(evidence).toBeDefined();
      expect(evidence?.totalTests).toBe(10);
      expect(evidence?.passedCount).toBe(10);
      expect(evidence?.flakeCleared).toBe(0);
    });

    it('transitions flaked QA verification to Ready to Deploy with flake notice', async () => {
      const workItemId = 4102;

      vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
        id: workItemId,
        rev: 3,
        fields: {
          'System.Title': 'Implement feature Y',
          'System.State': 'Ready for QA',
          'System.Tags': '[pr-merged]',
        },
      } as any);

      const updateSpy = vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({
        id: workItemId,
      } as any);

      const mockRunner = vi
        .fn()
        .mockResolvedValueOnce({
          passed: false,
          exitCode: 1,
          stdout: 'FAIL test',
          stderr: 'Network error',
          durationMs: 2000,
          failures: extractFailureFingerprints([
            { testFile: 't.ts', testName: 'net', errorMessage: 'Network error' },
          ]),
          parsedSummary: { totalTests: 8, passed: 7, failed: 1 },
        })
        .mockResolvedValueOnce({
          passed: true,
          exitCode: 0,
          stdout: 'Tests 8 passed (8)',
          stderr: '',
          durationMs: 1500,
          failures: [],
          parsedSummary: { totalTests: 8, passed: 8, failed: 0 },
        });

      const result = await processQaVerification(workItemId, {
        mockRunner,
      });

      expect(result?.outcome).toBe('flaked');
      expect(result?.flakeCleared).toBe(true);

      expect(updateSpy).toHaveBeenCalledWith(
        workItemId,
        expect.arrayContaining([
          expect.objectContaining({ path: '/fields/System.State', value: 'Ready to Deploy' }),
          expect.objectContaining({
            path: '/fields/System.History',
            value: expect.stringContaining('[QA Flake Cleared]'),
          }),
        ])
      );

      const evidence = db
        .select()
        .from(qaEvidence)
        .where(eq(qaEvidence.workItemId, workItemId))
        .get();

      expect(evidence?.flakeCleared).toBe(1);
    });

    it('bounces failing QA verification back to In Dev with [qa-failed] on first bounce', async () => {
      const workItemId = 4103;

      vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
        id: workItemId,
        rev: 4,
        fields: {
          'System.Title': 'Implement feature Z',
          'System.State': 'Ready for QA',
          'System.Tags': '[pr-merged]',
        },
      } as any);

      const updateSpy = vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({
        id: workItemId,
      } as any);

      const failures = extractFailureFingerprints([
        {
          testFile: 'tests/auth.test.ts',
          testName: 'login token verify',
          errorMessage: 'AuthFailedError: invalid signature',
        },
      ]);

      const mockFailRun = {
        passed: false,
        exitCode: 1,
        stdout: 'FAIL tests/auth.test.ts',
        stderr: 'AuthFailedError: invalid signature',
        durationMs: 1800,
        failures,
        parsedSummary: { totalTests: 12, passed: 11, failed: 1 },
      };

      const mockRunner = vi
        .fn()
        .mockResolvedValueOnce(mockFailRun)
        .mockResolvedValueOnce(mockFailRun);

      const result = await processQaVerification(workItemId, {
        mockRunner,
        autoRetriggerRework: false, // test routing without spawning git worktree rework loop
      });

      expect(result?.outcome).toBe('failed');
      expect(result?.identicalFailures).toBe(true);

      expect(updateSpy).toHaveBeenCalledWith(
        workItemId,
        expect.arrayContaining([
          expect.objectContaining({ path: '/fields/System.State', value: 'In Dev' }),
          expect.objectContaining({
            path: '/fields/System.Tags',
            value: expect.stringContaining('[qa-failed]'),
          }),
          expect.objectContaining({
            path: '/fields/System.History',
            value: expect.stringContaining('[QA Failure Diagnostic]'),
          }),
        ])
      );

      const bounceRecord = db
        .select()
        .from(qaBounces)
        .where(eq(qaBounces.workItemId, workItemId))
        .get();

      expect(bounceRecord?.bounceCount).toBe(1);
    });

    it('escalates to Blocked with [qa-escalated] when QA bounce cap of 2 is exceeded', async () => {
      const workItemId = 4104;

      // Seed 2 existing bounces in DB
      sqlite.exec(`INSERT INTO qa_bounces (work_item_id, bounce_count, escalated) VALUES (${workItemId}, 2, 0);`);

      vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
        id: workItemId,
        rev: 6,
        fields: {
          'System.Title': 'Implement feature Escalated',
          'System.State': 'Ready for QA',
          'System.Tags': '[qa-failed]',
        },
      } as any);

      const updateSpy = vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({
        id: workItemId,
      } as any);

      const failures = extractFailureFingerprints([
        {
          testFile: 'tests/deadlock.test.ts',
          testName: 'deadlock',
          errorMessage: 'FatalTimeout',
        },
      ]);

      const mockFailRun = {
        passed: false,
        exitCode: 1,
        stdout: 'FAIL deadlock',
        stderr: 'FatalTimeout',
        durationMs: 5000,
        failures,
        parsedSummary: { totalTests: 1, passed: 0, failed: 1 },
      };

      const mockRunner = vi
        .fn()
        .mockResolvedValueOnce(mockFailRun)
        .mockResolvedValueOnce(mockFailRun);

      const result = await processQaVerification(workItemId, {
        mockRunner,
        autoRetriggerRework: false,
      });

      expect(result?.outcome).toBe('failed');
      expect(updateSpy).toHaveBeenCalledWith(
        workItemId,
        expect.arrayContaining([
          expect.objectContaining({ path: '/fields/System.State', value: 'Blocked' }),
          expect.objectContaining({
            path: '/fields/System.Tags',
            value: expect.stringContaining('[qa-escalated]'),
          }),
        ])
      );

      const bounceRecord = db
        .select()
        .from(qaBounces)
        .where(eq(qaBounces.workItemId, workItemId))
        .get();

      expect(bounceRecord?.escalated).toBe(1);
    });
  });

  describe('routeWorkItemEvent integration', () => {
    it('routes Ready for QA work items to processQaVerification', async () => {
      const workItemId = 4201;

      vi.spyOn(adoClient, 'getRevision').mockResolvedValue({
        id: workItemId,
        rev: 2,
        fields: {
          'System.Title': 'Feature in Ready for QA',
          'System.State': 'Ready for QA',
        },
      } as any);

      vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
        id: workItemId,
        rev: 2,
        fields: {
          'System.Title': 'Feature in Ready for QA',
          'System.State': 'Ready for QA',
        },
      } as any);

      vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({ id: workItemId } as any);

      const mockRunner = vi.fn().mockResolvedValue({
        passed: true,
        exitCode: 0,
        stdout: 'Tests 2 passed (2)',
        stderr: '',
        durationMs: 500,
        failures: [],
        parsedSummary: { totalTests: 2, passed: 2, failed: 0 },
      });

      // Route event
      await routeWorkItemEvent(workItemId, 2, { mockRunner });

      expect(mockRunner).toHaveBeenCalled();
    });
  });
});
