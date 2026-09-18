import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../src/config/env.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';
import { adoClient } from '../src/ado/client.js';
import { formatSkillPrComment, stageAndPublishSkillPr } from '../src/learn/publisher.js';
import { processLearningFeedbackLoop } from '../src/learn/worker.js';

describe('Learn Feedback Loop Orchestrator (LRN-01, LRN-02, RETRO-01, RETRO-02, EVID-01)', () => {
  const tempTestDir = path.join(process.cwd(), '.worktrees', 'test-learn-orchestrator');
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

  it('formats sanitized skill PR discussion comment with loop shield', () => {
    const comment = formatSkillPrComment({
      workItemId: 8101,
      skillName: 'backend-jwt-token-refresh',
      pullRequestId: 202,
      prUrl: 'https://dev.azure.com/org/project/_git/skills-repo/pullrequest/202',
      description: 'Extracted token refresh rotation and expiry patterns',
    });

    expect(comment).toContain('[Learned Skill Staged] PR Pending Human Review');
    expect(comment).toContain('backend-jwt-token-refresh');
    expect(comment).toContain('PR #202');
    expect(comment).toContain('https://dev.azure.com/org/project/_git/skills-repo/pullrequest/202');
    expect(comment).toContain('Governance Gate (◆)');
    expect(comment).toContain('<!-- [automated-agent] -->');
  });

  it('stages skill file to disk and invokes PR creator targeting main', async () => {
    const workItemId = 8102;
    const mockSkill = {
      frontmatter: {
        name: 'infra-nginx-caching',
        description: 'Microcaching rules for static assets',
        domain: 'infra' as const,
        tags: ['infra', 'nginx'],
      },
      markdownContent: '# infra-nginx-caching\n## Overview\nCaching rules...',
      summary: 'Microcaching rules for static assets',
    };

    const mockPrCreator = vi.fn().mockResolvedValue({
      pullRequestId: 303,
      url: 'https://dev.azure.com/org/project/_git/skills-repo/pullrequest/303',
    });

    const result = await stageAndPublishSkillPr({
      workItemId,
      skill: mockSkill,
      repoRoot: tempTestDir,
      mockPrCreator: mockPrCreator as any,
    });

    expect(result.pullRequestId).toBe(303);
    expect(result.branchName).toContain('skills/learn-ticket-8102-infra-nginx-caching');

    // Verify file written
    const skillFilePath = path.join(tempTestDir, '.claude', 'skills', 'infra-nginx-caching', 'SKILL.md');
    expect(fs.existsSync(skillFilePath)).toBe(true);
    expect(fs.readFileSync(skillFilePath, 'utf8')).toContain('Caching rules...');

    // Verify PR creator was called with targetBranch main and dual-asset title
    expect(mockPrCreator).toHaveBeenCalledWith(
      expect.objectContaining({
        workItemId: 8102,
        title: expect.stringContaining('Add learned skill & runbook: infra-nginx-caching'),
        targetBranch: 'main',
        sourceBranch: expect.stringContaining('skills/learn-ticket-8102'),
      })
    );
  });

  it('executes full learning feedback loop, coordinates artifacts, and persists L7 record in StateStore', async () => {
    const workItemId = 8103;

    vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
      id: workItemId,
      fields: {
        'System.Title': 'Refactor Redis Cache Invalidation',
        'System.Description': 'Adds pub/sub cache invalidation across cluster',
        'Microsoft.VSTS.Common.AcceptanceCriteria': 'Cache drops on write',
      },
    } as any);

    const updateSpy = vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({
      id: workItemId,
    } as any);

    const mockPrCreator = vi.fn().mockResolvedValue({
      pullRequestId: 404,
      url: 'https://dev.azure.com/org/project/_git/skills-repo/pullrequest/404',
    });

    const outcome = await processLearningFeedbackLoop(workItemId, {
      mockPrCreator: mockPrCreator as any,
      repoRoot: tempTestDir,
    });

    expect(outcome.pullRequestId).toBe(404);
    expect(outcome.prUrl).toBe('https://dev.azure.com/org/project/_git/skills-repo/pullrequest/404');
    expect(outcome.skill.frontmatter.name).toContain('backend-refactor-redis-cache');
    expect(outcome.runbook).toBeDefined();
    expect(outcome.retro).toBeDefined();
    expect(outcome.l7Record).toBeDefined();

    // Verify comment added to work item
    expect(updateSpy).toHaveBeenCalledWith(
      workItemId,
      expect.arrayContaining([
        expect.objectContaining({
          path: '/fields/System.History',
          value: expect.stringContaining('<!-- [automated-agent] -->'),
        }),
      ])
    );

    // Verify StateStore persistence: skillsPrs, retroRecords, l7Evidence
    const ticket = await stateStore.getTicketState(workItemId);
    expect(ticket?.skillsPrs).toHaveLength(1);
    const prRecord = ticket?.skillsPrs[0];
    expect(prRecord?.pullRequestId).toBe(404);
    expect(prRecord?.status).toBe('pending_review');

    expect(ticket?.retroRecords).toHaveLength(1);
    expect(ticket?.l7Evidence).toBeDefined();
    const l7 = ticket?.l7Evidence;
    expect(l7?.takeaways).toContain('Retrospective for AB#8103');
    expect(l7?.actionItems.length).toBeGreaterThan(0);
    expect(l7?.actionItems[0]).toMatch(/P\d: .+ \(.*, ref: AB#8103\)/);
    expect(l7?.skillPrUrl).toBe('https://dev.azure.com/org/project/_git/skills-repo/pullrequest/404');
    expect(l7?.runbookDiffPrUrl).toBe('https://dev.azure.com/org/project/_git/skills-repo/pullrequest/404');
  });

  it('sets runbookDiffPrUrl to null when runbook has no changes', async () => {
    const workItemId = 8104;

    vi.spyOn(adoClient, 'getWorkItem').mockResolvedValue({
      id: workItemId,
      fields: {
        'System.Title': 'Minor Copy Change',
        'System.Description': 'Update landing copy',
        'Microsoft.VSTS.Common.AcceptanceCriteria': 'Text changed',
      },
    } as any);

    vi.spyOn(adoClient, 'updateWorkItem').mockResolvedValue({
      id: workItemId,
    } as any);

    const mockPrCreator = vi.fn().mockResolvedValue({
      pullRequestId: 405,
      url: 'https://dev.azure.com/org/project/_git/skills-repo/pullrequest/405',
    });

    const mockRunbook = {
      frontmatter: {
        name: 'runbook-ticket-8104',
        skill: 'skill-ticket-8104',
        ticket: 'AB#8104',
        updatedAt: new Date().toISOString(),
      },
      markdownContent: '',
      hasChanges: false,
      summary: 'No operational runbook changes required',
    };

    const outcome = await processLearningFeedbackLoop(workItemId, {
      mockPrCreator: mockPrCreator as any,
      mockRunbook,
      repoRoot: tempTestDir,
    });

    expect(outcome.runbook.hasChanges).toBe(false);
    expect(outcome.l7Record.runbookDiffPrUrl).toBeNull();
    expect(outcome.l7Record.skillPrUrl).toBe('https://dev.azure.com/org/project/_git/skills-repo/pullrequest/405');

    const ticket = await stateStore.getTicketState(workItemId);
    expect(ticket?.l7Evidence?.runbookDiffPrUrl).toBeNull();
  });
});
