import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';
import {
  assessMigrationRisk,
  buildRollbackProcedure,
  buildL5ReadinessPacket,
  formatL5ReadinessComment,
  buildDeployingPatch,
} from '../src/deploy/packet.js';

describe('L5 Deployment Readiness Packet and Schema Verification', () => {
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

  it('assesses low migration risk when no schema files are modified', () => {
    const risk = assessMigrationRisk(['src/api/user.ts', 'tests/user.test.ts']);
    expect(risk.riskLevel).toBe('low');
    expect(risk.hasSchemaChanges).toBe(false);
  });

  it('assesses medium/high risk when schema or migration files are present', () => {
    const mediumRisk = assessMigrationRisk(['src/db/schema.ts']);
    expect(mediumRisk.hasSchemaChanges).toBe(true);
    expect(mediumRisk.riskLevel).toBe('medium');

    const highRisk = assessMigrationRisk(['migrations/0002_drop_column.sql']);
    expect(highRisk.hasSchemaChanges).toBe(true);
    expect(highRisk.riskLevel).toBe('high');
  });

  it('builds rollback command tailored to environment and commit', () => {
    const rollback = buildRollbackProcedure('abcdef123456', 'Staging');
    expect(rollback.commitSha).toBe('abcdef123456');
    expect(rollback.environmentName).toBe('Staging');
    expect(rollback.revertCommand).toContain('git revert -m 1 abcdef123456');
    expect(rollback.redeployCommand).toContain('Deploy-Staging');
  });

  it('compiles L5 packet and formats sanitized HTML comment with loop shield', () => {
    const packet = buildL5ReadinessPacket({
      workItemId: 5001,
      title: 'Deploy User Service',
      commitSha: 'fedcba654321',
      filesModified: ['src/db/schema.ts'],
      environmentName: 'Production',
    });

    const comment = formatL5ReadinessComment(packet);
    expect(comment).toContain('[L5 Evidence] Native Environment Deployment Readiness');
    expect(comment).toContain('fedcba65');
    expect(comment).toContain('Production');
    expect(comment).toContain('[Migration Risk: MEDIUM]');
    expect(comment).toContain('git revert');
    expect(comment).toContain('<!-- [automated-agent] -->');
  });

  it('builds patch adding [deploying] tag', () => {
    const patch = buildDeployingPatch('[qa-verified]; backend');
    const tagOp = patch.find((op) => op.path === '/fields/System.Tags');
    expect(tagOp?.value).toContain('[deploying]');
    expect(tagOp?.value).toContain('[qa-verified]');
  });

  it('persists and retrieves deployment records in StateStore', async () => {
    const workItemId = 5002;
    await workItemQueueManager.runInLane(workItemId, async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        draft.deploymentRecords.push({
          pipelineRunId: 'run-1234',
          stageName: 'DeployToProd',
          environmentName: 'Production',
          commitSha: '112233445566',
          status: 'pending_approval',
          releaseNotes: 'User service updates',
          rollbackPlan: 'revert commit 112233445566',
          migrationRisk: 'low',
          createdAt: new Date().toISOString(),
        });
      });
    });

    const ticket = await stateStore.getTicketState(workItemId);
    const record = ticket?.deploymentRecords[0];

    expect(record).toBeDefined();
    expect(record?.stageName).toBe('DeployToProd');
    expect(record?.status).toBe('pending_approval');
  });
});
