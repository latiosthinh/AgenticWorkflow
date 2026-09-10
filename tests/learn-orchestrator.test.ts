import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { db, sqlite } from '../src/db/index.js';
import { skillsPrs, reworkCycles, l3Evidence, qaEvidence } from '../src/db/schema.js';
import { adoClient } from '../src/ado/client.js';
import { formatSkillPrComment, stageAndPublishSkillPr } from '../src/learn/publisher.js';
import { processLearningFeedbackLoop } from '../src/learn/worker.js';
import { eq } from 'drizzle-orm';

describe('Learn Feedback Loop Orchestrator (LRN-01, LRN-02)', () => {
  const tempTestDir = path.join(process.cwd(), '.worktrees', 'test-learn-orchestrator');

  beforeEach(() => {
    sqlite.exec('DROP TABLE IF EXISTS skills_prs;');
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS skills_prs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_item_id INTEGER NOT NULL,
        skill_name TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        pull_request_id INTEGER,
        pr_url TEXT,
        status TEXT NOT NULL DEFAULT 'pending_review',
        summary TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    sqlite.exec('DELETE FROM rework_cycles;');
    sqlite.exec('DELETE FROM l3_evidence;');
    sqlite.exec('DELETE FROM qa_evidence;');
    vi.restoreAllMocks();

    if (fs.existsSync(tempTestDir)) {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempTestDir, { recursive: true });
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

    // Verify PR creator was called with targetBranch main
    expect(mockPrCreator).toHaveBeenCalledWith(
      expect.objectContaining({
        workItemId: 8102,
        title: expect.stringContaining('Add learned skill: infra-nginx-caching'),
        targetBranch: 'main',
        sourceBranch: expect.stringContaining('skills/learn-ticket-8102'),
      })
    );
  });

  it('executes full learning feedback loop and persists PR record in SQLite', async () => {
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
    expect(outcome.skill.frontmatter.name).toContain('backend-refactor-redis-cache');

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

    // Verify SQLite persistence
    const record = db
      .select()
      .from(skillsPrs)
      .where(eq(skillsPrs.workItemId, workItemId))
      .get();

    expect(record).toBeDefined();
    expect(record?.pullRequestId).toBe(404);
    expect(record?.status).toBe('pending_review');
    expect(record?.skillName).toContain('backend-refactor-redis-cache');
  });
});
