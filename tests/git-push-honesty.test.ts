import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { processWorkItemExecute } from '../src/execute/worker.js';
import { processWorkItemRework } from '../src/execute/rework-worker.js';
import { executeRepairLoop } from '../src/execute/repair.js';
import { adoClient } from '../src/ado/client.js';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { simpleGit } from 'simple-git';

// Mock simple-git so we can simulate push failures cleanly
vi.mock('simple-git', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    simpleGit: vi.fn().mockImplementation((baseDir: string, options?: any) => {
      const gitInstance = actual.simpleGit(baseDir, options);
      return gitInstance;
    }),
  };
});

describe('Production Git Push Failure Honesty (SEC-05)', () => {
  let harness: TestStateStoreContext;
  const originalStateDir = env.STATE_STORE_DIR;
  const originalNodeEnv = env.NODE_ENV;
  const rootGit = (simpleGit as any)(process.cwd());

  const mockPassingTestRunner = async () => ({
    passed: true,
    exitCode: 0,
    stdout: 'Tests  1 passed (1)\nDuration 50ms',
    stderr: '',
    timedOut: false,
    durationMs: 50,
  });

  beforeEach(() => {
    harness = createTestStateStore();
    (env as any).STATE_STORE_DIR = harness.tempDir;
    resetStateStore();
    adoClient.setWorkItemTrackingApi(null);
  });

  afterEach(() => {
    harness.cleanup();
    (env as any).STATE_STORE_DIR = originalStateDir;
    (env as any).NODE_ENV = originalNodeEnv;
    resetStateStore();
    vi.restoreAllMocks();
  });

  describe('processWorkItemExecute push failure honesty', () => {
    it('fails closed in production: transitions to Blocked, marks dedup failed, posts alert comment', async () => {
      (env as any).NODE_ENV = 'production';
      const workItemId = 8101;
      const revId = 1;

      let flaggedBlocked = false;
      let blockedTag = '';
      let historyComment = '';

      const mockWitApi = {
        getWorkItem: vi.fn().mockResolvedValue({
          id: workItemId,
          rev: revId,
          fields: {
            'System.Title': 'Feature with failing remote push',
            'System.Description': 'Implementation triggers push error',
            'Microsoft.VSTS.Common.AcceptanceCriteria': 'Push must fail closed',
            'System.State': 'In Dev',
            'System.Tags': 'backend',
          },
        }),
        updateWorkItem: vi.fn().mockImplementation(async (_id: number, patchDoc: any[]) => {
          const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
          if (stateOp?.value === 'Blocked') {
            flaggedBlocked = true;
          }
          const tagOp = patchDoc.find((op: any) => op.path === '/fields/System.Tags');
          if (tagOp?.value?.includes('[contract-conflict]')) {
            blockedTag = '[contract-conflict]';
          }
          const historyOp = patchDoc.find((op: any) => op.path === '/fields/System.History');
          if (historyOp) {
            historyComment = historyOp.value;
          }
          return { id: workItemId };
        }),
      };
      adoClient.setWorkItemTrackingApi(mockWitApi as any);
      stateStore.recordDedupEvent(workItemId, revId, 'hash-8101');

      // Spy on simpleGit to intercept push
      const actualSimpleGit = (await vi.importActual('simple-git')) as any;
      vi.mocked(simpleGit).mockImplementation((baseDir: string, options?: any) => {
        const instance = actualSimpleGit.simpleGit(baseDir, options);
        instance.push = vi.fn().mockRejectedValue(new Error('fatal: remote connection refused'));
        return instance;
      });

      await processWorkItemExecute(workItemId, revId, {
        mockTestRunner: mockPassingTestRunner,
        mockCodeEdit: async (worktreePath) => {
          fs.writeFileSync(path.join(worktreePath, 'feature.ts'), 'export const x = 1;');
        },
      });

      // Verify ticket flagged Blocked
      expect(flaggedBlocked).toBe(true);
      expect(blockedTag).toBe('[contract-conflict]');

      // Verify alert comment has push error details and loop-shield
      expect(historyComment).toContain('[Push Failed] Remote push to origin failed');
      expect(historyComment).toContain('fatal: remote connection refused');
      expect(historyComment).toContain('<!-- [automated-agent] -->');

      // Verify dedup marker is 'failed'
      const markerPath = path.join(harness.tempDir, 'dedup', `${workItemId}-${revId}.json`);
      const dedup = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      expect(dedup.status).toBe('failed');
      expect(dedup.errorMessage).toContain('Git push to origin failed');

      // Verify worktree cleaned up
      const worktreeDir = path.join(
        process.cwd(),
        '.worktrees',
        `ticket-${workItemId}-feature-with-failing-remote-push`
      );
      expect(fs.existsSync(worktreeDir)).toBe(false);
    });

    it('tolerates push failure in test environment for offline execution', async () => {
      (env as any).NODE_ENV = 'test';
      const workItemId = 8102;
      const revId = 1;

      let transitionedToDevDone = false;

      const mockWitApi = {
        getWorkItem: vi.fn().mockResolvedValue({
          id: workItemId,
          rev: revId,
          fields: {
            'System.Title': 'Feature in offline test environment',
            'System.Description': 'Implementation in test env',
            'Microsoft.VSTS.Common.AcceptanceCriteria': 'Push tolerated',
            'System.State': 'In Dev',
            'System.Tags': 'backend',
          },
        }),
        updateWorkItem: vi.fn().mockImplementation(async (_id: number, patchDoc: any[]) => {
          const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
          if (stateOp?.value === 'Dev Done') {
            transitionedToDevDone = true;
          }
          return { id: workItemId };
        }),
      };
      adoClient.setWorkItemTrackingApi(mockWitApi as any);
      stateStore.recordDedupEvent(workItemId, revId, 'hash-8102');

      const actualSimpleGit = (await vi.importActual('simple-git')) as any;
      vi.mocked(simpleGit).mockImplementation((baseDir: string, options?: any) => {
        const instance = actualSimpleGit.simpleGit(baseDir, options);
        instance.push = vi.fn().mockRejectedValue(new Error('fatal: remote connection refused'));
        return instance;
      });

      await processWorkItemExecute(workItemId, revId, {
        mockTestRunner: mockPassingTestRunner,
        mockCodeEdit: async (worktreePath) => {
          fs.writeFileSync(path.join(worktreePath, 'feature.ts'), 'export const x = 2;');
        },
      });

      expect(transitionedToDevDone).toBe(true);

      const markerPath = path.join(harness.tempDir, 'dedup', `${workItemId}-${revId}.json`);
      const dedup = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      expect(dedup.status).toBe('completed');
    });
  });

  describe('processWorkItemRework push failure honesty', () => {
    it('fails closed in production: transitions to Blocked, marks dedup failed, posts alert comment', async () => {
      (env as any).NODE_ENV = 'production';
      const workItemId = 8103;
      const revId = 2;
      const branchName = `task/ticket-${workItemId}-rework-with-failing-remote-push`;

      await rootGit.raw(['branch', '-f', branchName, 'HEAD']);

      try {
        let flaggedBlocked = false;
        let blockedTag = '';
        let historyComment = '';

        const mockWitApi = {
          getWorkItem: vi.fn().mockResolvedValue({
            id: workItemId,
            rev: revId,
            fields: {
              'System.Title': 'Rework with failing remote push',
              'System.Description': 'Rework triggers push error',
              'Microsoft.VSTS.Common.AcceptanceCriteria': 'Rework push must fail closed',
              'System.State': 'In Dev',
              'System.Tags': 'backend',
            },
          }),
          updateWorkItem: vi.fn().mockImplementation(async (_id: number, patchDoc: any[]) => {
            const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
            if (stateOp?.value === 'Blocked') {
              flaggedBlocked = true;
            }
            const tagOp = patchDoc.find((op: any) => op.path === '/fields/System.Tags');
            if (tagOp?.value?.includes('[contract-conflict]')) {
              blockedTag = '[contract-conflict]';
            }
            const historyOp = patchDoc.find((op: any) => op.path === '/fields/System.History');
            if (historyOp) {
              historyComment = historyOp.value;
            }
            return { id: workItemId };
          }),
        };
        adoClient.setWorkItemTrackingApi(mockWitApi as any);
        stateStore.recordDedupEvent(workItemId, revId, 'hash-8103');

        const actualSimpleGit = (await vi.importActual('simple-git')) as any;
        vi.mocked(simpleGit).mockImplementation((baseDir: string, options?: any) => {
          const instance = actualSimpleGit.simpleGit(baseDir, options);
          instance.push = vi.fn().mockRejectedValue(new Error('fatal: remote repository not found'));
          return instance;
        });

        await processWorkItemRework(workItemId, revId, 'Fix the rework push issue', {
          mockTestRunner: mockPassingTestRunner,
          mockCodeEdit: async (worktreePath) => {
            fs.writeFileSync(path.join(worktreePath, 'rework.ts'), 'export const y = 1;');
          },
        });

        expect(flaggedBlocked).toBe(true);
        expect(blockedTag).toBe('[contract-conflict]');
        expect(historyComment).toContain('[Push Failed] Remote push to origin failed');
        expect(historyComment).toContain('fatal: remote repository not found');
        expect(historyComment).toContain('<!-- [automated-agent] -->');

        const markerPath = path.join(harness.tempDir, 'dedup', `${workItemId}-${revId}.json`);
        const dedup = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
        expect(dedup.status).toBe('failed');
        expect(dedup.errorMessage).toContain('Git push to origin failed');
      } finally {
        await rootGit.raw(['branch', '-D', branchName]).catch(() => {});
      }
    });

    it('tolerates push failure in test environment during rework', async () => {
      (env as any).NODE_ENV = 'test';
      const workItemId = 8104;
      const revId = 2;
      const branchName = `task/ticket-${workItemId}-rework-in-test-env`;

      await rootGit.raw(['branch', '-f', branchName, 'HEAD']);

      try {
        let transitionedToDevDone = false;

        const mockWitApi = {
          getWorkItem: vi.fn().mockResolvedValue({
            id: workItemId,
            rev: revId,
            fields: {
              'System.Title': 'Rework in test env',
              'System.Description': 'Rework in test env description',
              'Microsoft.VSTS.Common.AcceptanceCriteria': 'Push tolerated',
              'System.State': 'In Dev',
              'System.Tags': 'backend',
            },
          }),
          updateWorkItem: vi.fn().mockImplementation(async (_id: number, patchDoc: any[]) => {
            const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
            if (stateOp?.value === 'Dev Done') {
              transitionedToDevDone = true;
            }
            return { id: workItemId };
          }),
        };
        adoClient.setWorkItemTrackingApi(mockWitApi as any);
        stateStore.recordDedupEvent(workItemId, revId, 'hash-8104');

        const actualSimpleGit = (await vi.importActual('simple-git')) as any;
        vi.mocked(simpleGit).mockImplementation((baseDir: string, options?: any) => {
          const instance = actualSimpleGit.simpleGit(baseDir, options);
          instance.push = vi.fn().mockRejectedValue(new Error('fatal: remote repository not found'));
          return instance;
        });

        await processWorkItemRework(workItemId, revId, 'Feedback for test env rework', {
          mockTestRunner: mockPassingTestRunner,
          mockCodeEdit: async (worktreePath) => {
            fs.writeFileSync(path.join(worktreePath, 'rework.ts'), 'export const y = 2;');
          },
        });

        expect(transitionedToDevDone).toBe(true);

        const markerPath = path.join(harness.tempDir, 'dedup', `${workItemId}-${revId}.json`);
        const dedup = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
        expect(dedup.status).toBe('completed');
      } finally {
        await rootGit.raw(['branch', '-D', branchName]).catch(() => {});
      }
    });
  });

  describe('executeRepairLoop push failure diagnostics', () => {
    it('appends push failure message to diagnostics in production when WIP push fails', async () => {
      (env as any).NODE_ENV = 'production';
      const workItemId = 8105;

      const mockGit: any = {
        diff: vi.fn().mockResolvedValue('1 file changed, 1 insertion(+)'),
        status: vi.fn().mockResolvedValue({ staged: ['a.ts'], not_added: [], isClean: () => false }),
        checkout: vi.fn().mockResolvedValue(undefined),
        add: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue(undefined),
        push: vi.fn().mockRejectedValue(new Error('fatal: push rejected in prod')),
      };

      const result = await executeRepairLoop({
        worktreePath: process.cwd(),
        git: mockGit,
        workItemId,
        maxCycles: 1,
        mockTestRunner: async () => ({
          passed: false,
          exitCode: 1,
          stdout: 'FAIL tests/sample.test.ts\nAssertionError: expected 1 to be 2',
          stderr: '',
          timedOut: false,
          durationMs: 50,
        }),
      });

      expect(result.success).toBe(false);
      expect(result.diagnostics).toContain('Remote push to WIP branch failed');
    });

    it('does not append push failure to diagnostics in test environment when WIP push fails', async () => {
      (env as any).NODE_ENV = 'test';
      const workItemId = 8106;

      const mockGit: any = {
        diff: vi.fn().mockResolvedValue('1 file changed, 1 insertion(+)'),
        status: vi.fn().mockResolvedValue({ staged: ['a.ts'], not_added: [], isClean: () => false }),
        checkout: vi.fn().mockResolvedValue(undefined),
        add: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue(undefined),
        push: vi.fn().mockRejectedValue(new Error('fatal: push rejected in test')),
      };

      const result = await executeRepairLoop({
        worktreePath: process.cwd(),
        git: mockGit,
        workItemId,
        maxCycles: 1,
        mockTestRunner: async () => ({
          passed: false,
          exitCode: 1,
          stdout: 'FAIL tests/sample.test.ts\nAssertionError: expected 1 to be 2',
          stderr: '',
          timedOut: false,
          durationMs: 50,
        }),
      });

      expect(result.success).toBe(false);
      expect(result.diagnostics).not.toContain('Remote push to WIP branch failed');
    });
  });
});
