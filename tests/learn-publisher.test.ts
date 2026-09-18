import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { adoClient } from '../src/ado/client.js';
import { workItemQueueManager } from '../src/queue/lane-manager.js';
import { stageAndPublishSkillPr } from '../src/learn/publisher.js';
import { harvestTicketLifecycleData } from '../src/learn/harvester.js';
import type { LearnedSkill, LearnedRunbook } from '../src/learn/types.js';

describe('Learn Publisher & Harvester (RETRO-02, RETRO-01)', () => {
  const tempTestDir = path.join(process.cwd(), '.worktrees', 'test-learn-publisher');
  let harness: TestStateStoreContext;
  const originalStateDir = env.STATE_STORE_DIR;

  beforeEach(() => {
    harness = createTestStateStore();
    (env as any).STATE_STORE_DIR = harness.tempDir;
    resetStateStore();
    vi.restoreAllMocks();

    if (fs.existsSync(tempTestDir)) {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempTestDir, { recursive: true });
  });

  afterEach(() => {
    harness.cleanup();
    (env as any).STATE_STORE_DIR = originalStateDir;
    resetStateStore();
    if (fs.existsSync(tempTestDir)) {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    }
  });

  it('harvestTicketLifecycleData extracts smokeEvidence, scopeLock, and qaStrikes from StateStore', async () => {
    const workItemId = 9101;

    vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
      id: workItemId,
      fields: {
        'System.Title': 'Payment Webhook Idempotency',
        'System.Description': 'Handle duplicate stripe webhook charges',
        'Microsoft.VSTS.Common.AcceptanceCriteria': 'Ignore duplicate event ids',
      },
    } as any);

    await workItemQueueManager.runInLane(workItemId, async () => {
      await stateStore.updateTicketState(workItemId, (draft) => {
        draft.smokeEvidence = {
          status: 'passed',
          classification: 'NONE',
          commitSha: 'a1b2c3d',
          checksTotal: 3,
          checksPassed: 3,
          checksFailed: 0,
          durationMs: 1200,
          flakeCleared: true,
          createdAt: new Date().toISOString(),
        };
        draft.scopeLock = {
          status: 'locked',
          iterationCount: 2,
          requestedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        draft.qaRuns = [
          {
            runIndex: 1,
            strikeCount: 1,
            status: 'failed',
            createdAt: new Date().toISOString(),
          },
          {
            runIndex: 2,
            strikeCount: 2,
            status: 'passed',
            createdAt: new Date().toISOString(),
          },
        ];
      });
    });

    const data = await harvestTicketLifecycleData(workItemId);

    expect(data.workItemId).toBe(workItemId);
    expect(data.smokePassed).toBe(true);
    expect(data.smokeStatus).toBe('passed');
    expect(data.scopeRejections).toBe(2);
    expect(data.qaStrikes).toBe(2);
    expect(data.smokeFlakes).toBe(1);
  });

  it('stageAndPublishSkillPr stages both SKILL.md and RUNBOOK.md when runbook has changes', async () => {
    const workItemId = 9102;
    const skill: LearnedSkill = {
      frontmatter: {
        name: 'backend-stripe-webhook-idempotency',
        description: 'Stripe webhook deduping',
        domain: 'backend',
        tags: ['stripe', 'webhook'],
      },
      markdownContent: '# backend-stripe-webhook-idempotency\n## Overview\nDeduping...',
      summary: 'Stripe webhook deduping patterns',
    };

    const runbook: LearnedRunbook = {
      frontmatter: {
        name: 'runbook-ticket-9102',
        skill: 'skill-ticket-9102',
        ticket: 'AB#9102',
        updatedAt: new Date().toISOString(),
      },
      markdownContent: '# Runbook: Stripe Webhook\n## Health Probes\nCheck webhook queue',
      hasChanges: true,
      summary: 'Operational runbook for stripe webhooks',
    };

    const mockPrCreator = vi.fn().mockResolvedValue({
      pullRequestId: 501,
      url: 'https://dev.azure.com/org/project/_git/skills-repo/pullrequest/501',
    });

    const result = await stageAndPublishSkillPr({
      workItemId,
      skill,
      runbook,
      repoRoot: tempTestDir,
      mockPrCreator: mockPrCreator as any,
    });

    expect(result.pullRequestId).toBe(501);
    expect(result.branchName).toBe('skills/learn-ticket-9102-backend-stripe-webhook-idempotency');

    const skillDir = path.join(tempTestDir, '.claude', 'skills', 'backend-stripe-webhook-idempotency');
    const skillFile = path.join(skillDir, 'SKILL.md');
    const runbookFile = path.join(skillDir, 'RUNBOOK.md');

    expect(fs.existsSync(skillFile)).toBe(true);
    expect(fs.readFileSync(skillFile, 'utf8')).toContain('Deduping...');

    expect(fs.existsSync(runbookFile)).toBe(true);
    expect(fs.readFileSync(runbookFile, 'utf8')).toContain('Check webhook queue');

    expect(mockPrCreator).toHaveBeenCalledWith(
      expect.objectContaining({
        workItemId: 9102,
        title: 'Add learned skill & runbook: backend-stripe-webhook-idempotency',
        sourceBranch: 'skills/learn-ticket-9102-backend-stripe-webhook-idempotency',
        targetBranch: 'main',
        description: expect.stringContaining('### Extracted Patterns (SKILL.md)'),
      })
    );

    const callArgs = mockPrCreator.mock.calls[0][0];
    expect(callArgs.description).toContain('### Operational Runbook Updates');
    expect(callArgs.description).toContain('Check webhook queue');
  });

  it('stageAndPublishSkillPr stages only SKILL.md when runbook.hasChanges is false', async () => {
    const workItemId = 9103;
    const skill: LearnedSkill = {
      frontmatter: {
        name: 'frontend-button-contrast',
        description: 'Accessible button contrast',
        domain: 'frontend',
        tags: ['a11y'],
      },
      markdownContent: '# frontend-button-contrast\n## Overview\nContrast fixes...',
      summary: 'Accessible button contrast patterns',
    };

    const runbook: LearnedRunbook = {
      frontmatter: {
        name: 'runbook-ticket-9103',
        skill: 'skill-ticket-9103',
        ticket: 'AB#9103',
        updatedAt: new Date().toISOString(),
      },
      markdownContent: '',
      hasChanges: false,
      summary: 'No operational runbook changes required',
    };

    const mockPrCreator = vi.fn().mockResolvedValue({
      pullRequestId: 502,
      url: 'https://dev.azure.com/org/project/_git/skills-repo/pullrequest/502',
    });

    const result = await stageAndPublishSkillPr({
      workItemId,
      skill,
      runbook,
      repoRoot: tempTestDir,
      mockPrCreator: mockPrCreator as any,
    });

    expect(result.pullRequestId).toBe(502);

    const skillDir = path.join(tempTestDir, '.claude', 'skills', 'frontend-button-contrast');
    const skillFile = path.join(skillDir, 'SKILL.md');
    const runbookFile = path.join(skillDir, 'RUNBOOK.md');

    expect(fs.existsSync(skillFile)).toBe(true);
    expect(fs.existsSync(runbookFile)).toBe(false);

    const callArgs = mockPrCreator.mock.calls[0][0];
    expect(callArgs.title).toBe('Add learned skill & runbook: frontend-button-contrast');
    expect(callArgs.description).toContain('*(no operational changes required)*');
  });

  it('stageAndPublishSkillPr invokes createOrGetPullRequest targeting main with branch name matching skills/learn-ticket-<id>-<slug>', async () => {
    const workItemId = 9104;
    const skill: LearnedSkill = {
      frontmatter: {
        name: 'infra-k8s-ingress-routing',
        description: 'K8s ingress annotations',
        domain: 'infra',
        tags: ['k8s'],
      },
      markdownContent: '# infra-k8s-ingress-routing\n## Overview\nAnnotations...',
      summary: 'K8s ingress annotations patterns',
    };

    const mockPrCreator = vi.fn().mockResolvedValue({
      pullRequestId: 503,
      url: 'https://dev.azure.com/org/project/_git/skills-repo/pullrequest/503',
    });

    const result = await stageAndPublishSkillPr({
      workItemId,
      skill,
      repoRoot: tempTestDir,
      mockPrCreator: mockPrCreator as any,
    });

    expect(result.branchName).toBe('skills/learn-ticket-9104-infra-k8s-ingress-routing');
    expect(mockPrCreator).toHaveBeenCalledWith(
      expect.objectContaining({
        workItemId: 9104,
        targetBranch: 'main',
        sourceBranch: 'skills/learn-ticket-9104-infra-k8s-ingress-routing',
      })
    );
  });

  it('stageAndPublishSkillPr sanitizes skill directory name against path traversal (WR-01)', async () => {
    const workItemId = 9105;
    const skill: LearnedSkill = {
      frontmatter: {
        name: '../../evil-escape-skill',
        description: 'Malicious traversal',
        domain: 'backend',
        tags: ['traversal'],
      },
      markdownContent: '# Traversal Test',
      summary: 'Path traversal test',
    };

    const mockPrCreator = vi.fn().mockResolvedValue({
      pullRequestId: 505,
      url: 'https://dev.azure.com/org/project/_git/skills-repo/pullrequest/505',
    });

    const result = await stageAndPublishSkillPr({
      workItemId,
      skill,
      repoRoot: tempTestDir,
      mockPrCreator: mockPrCreator as any,
    });

    // Sanitized skill directory must stay inside .claude/skills/
    const expectedDir = path.join(tempTestDir, '.claude', 'skills', '------evil-escape-skill');
    expect(fs.existsSync(expectedDir)).toBe(true);
    expect(fs.existsSync(path.join(expectedDir, 'SKILL.md'))).toBe(true);
    // Confirm no escape happened above .claude/skills
    expect(fs.existsSync(path.join(tempTestDir, 'evil-escape-skill'))).toBe(false);
  });
});
