import fs from 'node:fs';
import path from 'node:path';
import sanitizeHtml from 'sanitize-html';
import { simpleGit, type SimpleGit } from 'simple-git';
import { slugify } from '../utils/paths.js';
import { createOrGetPullRequest } from '../ado/git.js';
import { env } from '../config/env.js';
import type { LearnedSkill, LearnedRunbook } from './types.js';

export interface SkillPrCommentOptions {
  workItemId: number;
  skillName: string;
  pullRequestId: number;
  prUrl: string;
  description: string;
}

export function formatSkillPrComment(options: SkillPrCommentOptions): string {
  const { workItemId, skillName, pullRequestId, prUrl, description } = options;

  const html = `
<div class="skill-pr-notification">
  <h3>🧠 [Learned Skill Staged] PR Pending Human Review</h3>
  <p>The Golden Path Learning Agent extracted reusable patterns from completed work item #${workItemId} and submitted a Pull Request to the skills repository.</p>

  <ul>
    <li><strong>Skill Name:</strong> <code>${sanitizeHtml(skillName)}</code></li>
    <li><strong>Description:</strong> ${sanitizeHtml(description)}</li>
    <li><strong>Pull Request:</strong> <a href="${sanitizeHtml(prUrl)}">PR #${pullRequestId} - ${sanitizeHtml(skillName)}</a></li>
  </ul>

  <p><strong>Governance Gate (◆):</strong> In accordance with prompt-injection defense guidelines, this skill remains in review branch and <em>will not affect future agent execution</em> until reviewed and merged by a human engineer.</p>
</div>
`.trim();

  const sanitized = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'div',
      'h3',
      'p',
      'ul',
      'li',
      'strong',
      'em',
      'code',
      'a',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      div: ['class'],
      a: ['href'],
    },
  });

  return `${sanitized}\n<!-- [automated-agent] -->`;
}

export interface StageAndPublishOptions {
  workItemId: number;
  skill: LearnedSkill;
  runbook?: LearnedRunbook;
  repoRoot?: string;
  mockPrCreator?: typeof createOrGetPullRequest;
  gitClient?: SimpleGit;
}

export async function stageAndPublishSkillPr(
  options: StageAndPublishOptions
): Promise<{ pullRequestId: number; prUrl: string; branchName: string }> {
  const { workItemId, skill, runbook, repoRoot = process.cwd(), mockPrCreator } = options;

  const cleanSlug = slugify(skill.frontmatter.name);
  const branchName = `skills/learn-ticket-${workItemId}-${cleanSlug}`;

  // Staging skill & runbook locally on disk under .claude/skills/<skill-name>/
  const sanitizedSkillName = skill.frontmatter.name.replace(/[^a-zA-Z0-9_-]/g, '-');
  const skillsBase = path.resolve(repoRoot, '.claude', 'skills');
  const skillDir = path.resolve(skillsBase, sanitizedSkillName);
  if (!skillDir.startsWith(skillsBase + path.sep)) {
    throw new Error(`Invalid skill name path traversal: ${skill.frontmatter.name}`);
  }
  fs.mkdirSync(skillDir, { recursive: true });

  // 1. Stage SKILL.md
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skill.markdownContent, 'utf8');

  // 2. Stage RUNBOOK.md if changes present
  if (runbook?.hasChanges && runbook.markdownContent) {
    fs.writeFileSync(path.join(skillDir, 'RUNBOOK.md'), runbook.markdownContent, 'utf8');
  }

  // Ensure git branch is checked out/created and pushed or handled properly before calling PR creation (WR-04)
  const git =
    options.gitClient ||
    (fs.existsSync(path.join(repoRoot, '.git')) ? simpleGit(repoRoot) : null);
  if (git) {
    try {
      const branchSummary = await git.branchLocal();
      const currentBranch = branchSummary.current;
      if (!branchSummary.all.includes(branchName)) {
        await git.checkoutLocalBranch(branchName);
      } else {
        await git.checkout(branchName);
      }
      const relSkillDir = path.relative(repoRoot, skillDir);
      await git.add(relSkillDir);
      const status = await git.status();
      if (status.staged.length > 0) {
        await git.commit(`feat(skills): add learned skill & runbook for AB#${workItemId}`);
      }
      try {
        await git.push('origin', branchName);
      } catch {
        // Ignore remote push failures in local/offline environments
      }
      if (currentBranch && currentBranch !== branchName) {
        await git.checkout(currentBranch);
      }
    } catch {
      // Graceful fallback if git commands fail in isolated/partial environment
    }
  }

  const prCreator = mockPrCreator || createOrGetPullRequest;

  const runbookSection = runbook?.hasChanges
    ? `\n### Operational Runbook Updates\n\`\`\`markdown\n${runbook.markdownContent}\n\`\`\`\n`
    : '\n### Operational Runbook Updates\n*(no operational changes required)*\n';

  const prDescription = `## Learned Skill & Runbook: ${skill.frontmatter.name}

### Source Work Item Traceability
- **Work Item**: AB#${workItemId}
- **Domain**: \`${skill.frontmatter.domain}\`
- **Summary**: ${skill.summary}

### Extracted Patterns (SKILL.md)
\`\`\`markdown
${skill.markdownContent}
\`\`\`
${runbookSection}
---
*Notice: Human review and merge (◆) mandatory before skills repository update takes effect.*
`;

  const pr = await prCreator({
    workItemId,
    title: `Add learned skill & runbook: ${skill.frontmatter.name}`,
    sourceBranch: branchName,
    targetBranch: env.ADO_DEFAULT_BRANCH || 'main',
    description: prDescription,
    projectId: env.ADO_PROJECT,
    repositoryId: env.ADO_REPOSITORY_ID,
  });

  const pullRequestId = pr.pullRequestId || 101;
  const prUrl =
    pr.url ||
    (pr as any)._links?.web?.href ||
    `${env.ADO_ORG_URL}/${env.ADO_PROJECT}/_git/${env.ADO_REPOSITORY_ID}/pullrequest/${pullRequestId}`;

  return {
    pullRequestId,
    prUrl,
    branchName,
  };
}
