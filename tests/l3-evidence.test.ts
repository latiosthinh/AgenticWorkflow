import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { adoClient } from '../src/ado/client.js';
import {
  formatL3EvidenceComment,
  recordL3Evidence,
  buildDevDonePatch,
  buildRepairExhaustedPatch,
  buildContractConflictPatch,
} from '../src/test-runner/evidence.js';
import {
  transitionToDevDone,
  flagTicketBlocked,
} from '../src/ado/work-item.js';
import { processWorkItemExecute } from '../src/execute/worker.js';
import { cleanupWorktree } from '../src/sandbox/worktree.js';
import { createPlanCheckpoint } from '../src/plan/checkpoint.js';

afterEach(async () => {
  const worktreeDir = path.join(process.cwd(), '.worktrees');
  if (fs.existsSync(worktreeDir)) {
    const entries = fs.readdirSync(worktreeDir);
    for (const entry of entries) {
      if (entry.startsWith('ticket-')) {
        const fullPath = path.join(worktreeDir, entry);
        await cleanupWorktree(process.cwd(), fullPath, { deleteBranch: true }).catch(() => {});
      }
    }
  }
});

describe('L3 Evidence Persistence & Patch Builders', () => {
  let harness: TestStateStoreContext;
  const originalStateDir = env.STATE_STORE_DIR;

  beforeEach(() => {
    harness = createTestStateStore();
    (env as any).STATE_STORE_DIR = harness.tempDir;
    resetStateStore();
  });

  afterEach(() => {
    harness.cleanup();
    (env as any).STATE_STORE_DIR = originalStateDir;
    resetStateStore();
  });

  it('persists structured L3 evidence into StateStore and queries successfully', async () => {
    await recordL3Evidence({
      workItemId: 7001,
      revId: 1,
      testSuite: 'vitest',
      totalTests: 15,
      passed: 15,
      failed: 0,
      durationMs: 320,
      coverageSummary: '92% statements',
      gitDiffStat: '3 files changed, 85 insertions(+)',
    });

    const ticket = await stateStore.getTicketState(7001);
    expect(ticket).toBeDefined();
    const rows = ticket?.l3Evidence || [];
    expect(rows).toHaveLength(1);
    expect(rows[0].revId).toBe(1);
    expect(rows[0].testSuite).toBe('vitest');
    expect(rows[0].totalTests).toBe(15);
    expect(rows[0].passed).toBe(15);
    expect(rows[0].failed).toBe(0);
    expect(rows[0].durationMs).toBe(320);
    expect(rows[0].coverageSummary).toBe('92% statements');
    expect(rows[0].gitDiffStat).toBe('3 files changed, 85 insertions(+)');
  });

  it('formats sanitized HTML comment with [L3 Evidence] badge and automated-agent comment marker', () => {
    const comment = formatL3EvidenceComment({
      testSuite: 'vitest',
      totalTests: 10,
      passed: 10,
      failed: 0,
      durationMs: 250,
      gitDiffStat: '2 files changed, 40 insertions(+)',
      coverageSummary: '88% statements',
    });

    expect(comment).toContain('<h3>[L3 Evidence] Functional Verification: PASSED</h3>');
    expect(comment).toContain('<strong>Suite:</strong> <code>vitest</code>');
    expect(comment).toContain('<strong>Total Tests:</strong> 10');
    expect(comment).toContain('<strong>Passed:</strong> 10');
    expect(comment).toContain('<strong>Failed:</strong> 0');
    expect(comment).toContain('<strong>Duration:</strong> 250ms');
    expect(comment).toContain('<strong>Git Diff:</strong> <code>2 files changed, 40 insertions(+)</code>');
    expect(comment).toContain('<strong>Coverage:</strong> 88% statements');
    expect(comment).toContain('<!-- [automated-agent] -->');
  });

  it('formats failed evidence comment when failed > 0', () => {
    const comment = formatL3EvidenceComment({
      testSuite: 'vitest',
      totalTests: 10,
      passed: 8,
      failed: 2,
      durationMs: 310,
      gitDiffStat: { rawStat: '1 file changed', totalLoc: 5, filesChanged: 1 },
    });

    expect(comment).toContain('<h3>[L3 Evidence] Functional Verification: FAILED</h3>');
    expect(comment).toContain('<strong>Failed:</strong> 2');
    expect(comment).toContain('<!-- [automated-agent] -->');
  });

  it('builds valid ADO patch for Dev Done with [l3-verified] tag', () => {
    const patch = buildDevDonePatch('<div>Evidence comment</div>', 'backend; [awaiting-input]');

    const stateOp = patch.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp).toEqual({
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Dev Done',
    });

    const tagOp = patch.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp).toBeDefined();
    expect(tagOp?.value).toContain('[l3-verified]');
    expect(tagOp?.value).not.toContain('[awaiting-input]');
    expect(tagOp?.value).toContain('backend');

    const historyOp = patch.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp?.value).toBe('<div>Evidence comment</div>');
  });

  it('builds valid ADO patch for repair exhausted with [repair-exhausted] tag and Blocked state', () => {
    const patch = buildRepairExhaustedPatch('<div>Diagnostics</div>', 'infra; [awaiting-input]');

    const stateOp = patch.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp).toEqual({
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Blocked',
    });

    const tagOp = patch.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp).toBeDefined();
    expect(tagOp?.value).toContain('[repair-exhausted]');
    expect(tagOp?.value).not.toContain('[awaiting-input]');
    expect(tagOp?.value).toContain('infra');
  });

  it('builds valid ADO patch for contract conflict with [contract-conflict] tag and Blocked state', () => {
    const patch = buildContractConflictPatch('<div>Contract mismatch</div>', 'frontend');

    const stateOp = patch.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp).toEqual({
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Blocked',
    });

    const tagOp = patch.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp).toBeDefined();
    expect(tagOp?.value).toContain('[contract-conflict]');
    expect(tagOp?.value).toContain('frontend');
  });
});

describe('ADO REST Transition Helpers', () => {
  beforeEach(() => {
    adoClient.setWorkItemTrackingApi(null);
  });

  it('transitionToDevDone updates ADO work item with Dev Done state and [l3-verified] tag', async () => {
    const workItemId = 8001;
    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        fields: {
          'System.State': 'In Dev',
          'System.Tags': 'backend; infra',
        },
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    await transitionToDevDone(workItemId, '<div>Verification PASSED</div>');

    expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
    const updateArgs = mockWitApi.updateWorkItem.mock.calls[0];
    const patchDoc = updateArgs.find((a: any) => Array.isArray(a));
    expect(patchDoc).toBeDefined();

    const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp.value).toBe('Dev Done');

    const tagOp = patchDoc.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp.value).toContain('[l3-verified]');
    expect(tagOp.value).toContain('backend');
  });

  it('flagTicketBlocked updates ADO work item to Blocked for contract-conflict', async () => {
    const workItemId = 8002;
    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        fields: {
          'System.State': 'In Dev',
          'System.Tags': 'frontend',
        },
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    await flagTicketBlocked(workItemId, '<div>Conflict</div>', 'contract-conflict');

    const updateArgs = mockWitApi.updateWorkItem.mock.calls[0];
    const patchDoc = updateArgs.find((a: any) => Array.isArray(a));
    const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp.value).toBe('Blocked');

    const tagOp = patchDoc.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp.value).toContain('[contract-conflict]');
  });

  it('flagTicketBlocked updates ADO work item to Blocked for diff-ceiling', async () => {
    const workItemId = 8003;
    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        fields: {
          'System.State': 'In Dev',
          'System.Tags': 'backend',
        },
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    await flagTicketBlocked(workItemId, '<div>Diff ceiling</div>', 'diff-ceiling');

    const updateArgs = mockWitApi.updateWorkItem.mock.calls[0];
    const patchDoc = updateArgs.find((a: any) => Array.isArray(a));
    const stateOp = patchDoc.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp.value).toBe('Blocked');

    const tagOp = patchDoc.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp.value).toContain('[diff-ceiling-exceeded]');
  });
});

describe('Execution Worker Pipeline End-to-End Orchestration', () => {
  let harness: TestStateStoreContext;
  const originalStateDir = env.STATE_STORE_DIR;

  beforeEach(() => {
    harness = createTestStateStore();
    (env as any).STATE_STORE_DIR = harness.tempDir;
    resetStateStore();
    adoClient.setWorkItemTrackingApi(null);
  });

  afterEach(() => {
    harness.cleanup();
    (env as any).STATE_STORE_DIR = originalStateDir;
    resetStateStore();
  });

  it('Golden Path: runs bounded editing, passes tests, records L3 evidence in StateStore, transitions to Dev Done', async () => {
    const workItemId = 9001;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Implement User Search Endpoint',
          'System.Description': 'Adds search endpoint for filtering users by name and department.',
          'Microsoft.VSTS.Common.AcceptanceCriteria': 'Given query parameter, return 200 with matching users. Assert test passes.',
          'System.State': 'In Dev',
          'System.Tags': 'backend',
        },
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    stateStore.recordDedupEvent(workItemId, revId, 'hash-9001');

    await processWorkItemExecute(workItemId, revId, {
      mockCodeEdit: async (worktreePath) => {
        fs.writeFileSync(path.join(worktreePath, 'src_search.ts'), 'export function search() { return []; }\n');
      },
      mockTestRunner: async () => ({
        passed: true,
        exitCode: 0,
        stdout: 'Tests  1 passed (1)\nDuration 120ms',
        stderr: '',
        timedOut: false,
        durationMs: 120,
      }),
    });

    // 1. Verify StateStore L3 evidence persisted
    const ticket = await stateStore.getTicketState(workItemId);
    const evidenceRows = ticket?.l3Evidence || [];
    expect(evidenceRows).toHaveLength(1);
    expect(evidenceRows[0].passed).toBe(1);
    expect(evidenceRows[0].failed).toBe(0);
    expect(evidenceRows[0].testSuite).toBe('vitest');

    // 2. Verify ADO state updated to Dev Done with [l3-verified] tag
    const updateCalls = mockWitApi.updateWorkItem.mock.calls;
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    const lastPatchDoc = updateCalls[updateCalls.length - 1].find((a: any) => Array.isArray(a));
    const stateOp = lastPatchDoc.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp?.value).toBe('Dev Done');

    const tagOp = lastPatchDoc.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp?.value).toContain('[l3-verified]');

    const historyOp = lastPatchDoc.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp?.value).toContain('[L3 Evidence] Functional Verification: PASSED');
    expect(historyOp?.value).toContain('<!-- [automated-agent] -->');

    // 3. Verify dedupEvents completed
    const dedup = stateStore.getDedupEvent(workItemId, revId);
    expect(dedup?.status).toBe('completed');
  });

  it('Diff Ceiling Exceeded: flags ticket Blocked with [diff-ceiling-exceeded] tag when diff > 250 LOC', async () => {
    const workItemId = 9002;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Refactor massive database engine',
          'System.Description': 'Overhauls entire database layer.',
          'Microsoft.VSTS.Common.AcceptanceCriteria': 'Database works. Assert tests pass.',
          'System.State': 'In Dev',
          'System.Tags': 'backend',
        },
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    stateStore.recordDedupEvent(workItemId, revId, 'hash-9002');

    await processWorkItemExecute(workItemId, revId, {
      maxDiffLoc: 250,
      mockCodeEdit: async (worktreePath) => {
        const largeFile = Array.from({ length: 300 }, (_, i) => `// Line ${i}`).join('\n');
        fs.writeFileSync(path.join(worktreePath, 'massive.ts'), largeFile);
      },
    });

    // Verify ticket transitioned to Blocked with diff ceiling tag
    const updateCalls = mockWitApi.updateWorkItem.mock.calls;
    const lastPatchDoc = updateCalls[updateCalls.length - 1].find((a: any) => Array.isArray(a));
    const stateOp = lastPatchDoc.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp?.value).toBe('Blocked');

    const tagOp = lastPatchDoc.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp?.value).toContain('[diff-ceiling-exceeded]');

    // No L3 evidence should be recorded for failed verification
    const ticket = await stateStore.getTicketState(workItemId);
    expect(ticket?.l3Evidence || []).toHaveLength(0);
  });

  it('Contract Conflict: flags ticket Blocked when baseline protected test files are modified', async () => {
    const workItemId = 9003;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Feature with test hacking',
          'System.Description': 'Attempting to change existing test assertions.',
          'Microsoft.VSTS.Common.AcceptanceCriteria': 'Feature works. Assert tests pass.',
          'System.State': 'In Dev',
          'System.Tags': 'backend',
        },
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    stateStore.recordDedupEvent(workItemId, revId, 'hash-9003');

    await processWorkItemExecute(workItemId, revId, {
      mockCodeEdit: async (worktreePath) => {
        // Unlock and modify an existing baseline test file
        const testFile = path.join(worktreePath, 'tests', 'diff-ceiling.test.ts');
        if (fs.existsSync(testFile)) {
          fs.chmodSync(testFile, 0o666);
          fs.appendFileSync(testFile, '\n// modified baseline test\n');
        }
      },
    });

    const updateCalls = mockWitApi.updateWorkItem.mock.calls;
    const lastPatchDoc = updateCalls[updateCalls.length - 1].find((a: any) => Array.isArray(a));
    const stateOp = lastPatchDoc.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp?.value).toBe('Blocked');

    const tagOp = lastPatchDoc.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp?.value).toContain('[contract-conflict]');

    const historyOp = lastPatchDoc.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp?.value).toContain('[Contract Conflict] Protected test files modified');
  });

  it('Empty New Test File: flags ticket Blocked when newly added test file lacks assertions (T-3-03)', async () => {
    const workItemId = 9007;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Feature with dummy test',
          'System.Description': 'Adds empty test file to fake test pass.',
          'Microsoft.VSTS.Common.AcceptanceCriteria': 'Feature works. Assert tests pass.',
          'System.State': 'In Dev',
          'System.Tags': 'backend',
        },
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    stateStore.recordDedupEvent(workItemId, revId, 'hash-9007');

    await processWorkItemExecute(workItemId, revId, {
      mockCodeEdit: async (worktreePath) => {
        const dummyTest = path.join(worktreePath, 'tests', 'dummy.test.ts');
        fs.mkdirSync(path.dirname(dummyTest), { recursive: true });
        fs.writeFileSync(dummyTest, '// Empty test without assertions\n');
      },
    });

    const updateCalls = mockWitApi.updateWorkItem.mock.calls;
    const lastPatchDoc = updateCalls[updateCalls.length - 1].find((a: any) => Array.isArray(a));
    const stateOp = lastPatchDoc.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp?.value).toBe('Blocked');

    const tagOp = lastPatchDoc.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp?.value).toContain('[contract-conflict]');

    const historyOp = lastPatchDoc.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp?.value).toContain('[Contract Conflict] New test file lacks valid assertions');
  });

  it('Unauthorized Dependency: flags ticket Blocked when package.json adds unapproved package', async () => {
    const workItemId = 9004;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Add unauthorized dependency',
          'System.Description': 'Adds random dependency not in AC.',
          'Microsoft.VSTS.Common.AcceptanceCriteria': 'Only standard features.',
          'System.State': 'In Dev',
          'System.Tags': 'backend',
        },
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    stateStore.recordDedupEvent(workItemId, revId, 'hash-9004');

    await processWorkItemExecute(workItemId, revId, {
      mockCodeEdit: async (worktreePath) => {
        const pkgPath = path.join(worktreePath, 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          pkg.dependencies = pkg.dependencies || {};
          pkg.dependencies['unauthorized-malicious-pkg'] = '^1.0.0';
          fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
        }
      },
    });

    const updateCalls = mockWitApi.updateWorkItem.mock.calls;
    const lastPatchDoc = updateCalls[updateCalls.length - 1].find((a: any) => Array.isArray(a));
    const stateOp = lastPatchDoc.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp?.value).toBe('Blocked');

    const tagOp = lastPatchDoc.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp?.value).toContain('[contract-conflict]');

    const historyOp = lastPatchDoc.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp?.value).toContain('Unauthorized package dependencies added: unauthorized-malicious-pkg');
  });

  it('Repair Exhausted: flags ticket Blocked with [repair-exhausted] tag and preserves WIP branch', async () => {
    const workItemId = 9005;
    const revId = 1;

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue({
        id: workItemId,
        rev: revId,
        fields: {
          'System.Title': 'Flaky failing feature',
          'System.Description': 'Fails unit test run consistently.',
          'Microsoft.VSTS.Common.AcceptanceCriteria': 'Assert tests pass.',
          'System.State': 'In Dev',
          'System.Tags': 'backend',
        },
      }),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    stateStore.recordDedupEvent(workItemId, revId, 'hash-9005');

    await processWorkItemExecute(workItemId, revId, {
      mockTestRunner: async () => ({
        passed: false,
        exitCode: 1,
        stdout: 'FAIL tests/example.test.ts\nAssertionError: expected true to be false\n  at src/example.ts:10:5',
        stderr: '',
        timedOut: false,
        durationMs: 90,
      }),
    });

    const updateCalls = mockWitApi.updateWorkItem.mock.calls;
    const lastPatchDoc = updateCalls[updateCalls.length - 1].find((a: any) => Array.isArray(a));
    const stateOp = lastPatchDoc.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp?.value).toBe('Blocked');

    const tagOp = lastPatchDoc.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp?.value).toContain('[repair-exhausted]');

    const historyOp = lastPatchDoc.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp?.value).toContain('[Repair Exhausted]');
    expect(historyOp?.value).toContain('wip/ticket-9005');
  });

  it('Resumption Flow: executes pipeline to Dev Done when autoProceedResumption is enabled', async () => {
    const workItemId = 9006;
    const revId = 2;

    const initialCp = await createPlanCheckpoint({
      workItemId,
      revId: 1,
      questions: ['Which table?'],
      planMarkdown: 'Implementation plan',
      estimatedFiles: ['src/table.ts'],
      testStrategy: 'vitest',
    });

    const mockWorkItemData = {
      id: workItemId,
      rev: revId,
      fields: {
        'System.Title': 'Implement Table Feature',
        'System.Description': 'Store records',
        'Microsoft.VSTS.Common.AcceptanceCriteria': 'Given table, write record. Assert test passes.',
        'System.State': 'In Dev',
        'System.Tags': 'backend; [awaiting-input]',
        'System.History': '<p>Use users table</p>',
      },
    };

    const mockWitApi = {
      getWorkItem: vi.fn().mockResolvedValue(mockWorkItemData),
      getRevision: vi.fn().mockResolvedValue(mockWorkItemData),
      updateWorkItem: vi.fn().mockResolvedValue({ id: workItemId }),
    };
    adoClient.setWorkItemTrackingApi(mockWitApi as any);

    stateStore.recordDedupEvent(workItemId, revId, 'hash-9006');

    await processWorkItemExecute(workItemId, revId, {
      autoProceedResumption: true,
      mockTestRunner: async () => ({
        passed: true,
        exitCode: 0,
        stdout: 'Tests  1 passed (1)\nDuration 80ms',
        stderr: '',
        timedOut: false,
        durationMs: 80,
      }),
    });

    // Verify checkpoint is locked
    const ticket = await stateStore.getTicketState(workItemId);
    const cp = ticket?.planCheckpoints.find((c) => c.id === initialCp.id);
    expect(cp?.status).toBe('locked');

    // Verify L3 evidence recorded
    expect(ticket?.l3Evidence).toBeDefined();
    expect(ticket?.l3Evidence[0]?.passed).toBe(1);

    // Verify transition to Dev Done
    const updateCalls = mockWitApi.updateWorkItem.mock.calls;
    expect(updateCalls.length).toBe(2); // 1: lock plan, 2: transition to Dev Done
    const lastPatchDoc = updateCalls[1].find((a: any) => Array.isArray(a));
    const stateOp = lastPatchDoc.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp?.value).toBe('Dev Done');
  });
});
