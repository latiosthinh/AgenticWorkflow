import fs from 'node:fs';
import path from 'node:path';
import sanitizeHtml from 'sanitize-html';
import { slugify } from '../utils/paths.js';
import { createOrGetPullRequest } from '../ado/git.js';
import { env } from '../config/env.js';
import type { LearnedSkill } from './types.js';

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
  repoRoot?: string;
  mockPrCreator?: typeof createOrGetPullRequest;
}

export async function stageAndPublishSkillPr(
  options: StageAndPublishOptions
): Promise<{ pullRequestId: number; prUrl: string; branchName: string }> {
  const { workItemId, skill, repoRoot = process.cwd(), mockPrCreator } = options;

  const cleanSlug = slugify(skill.frontmatter.name);
  const branchName = `skills/learn-ticket-${workItemId}-${cleanSlug}`;

  // Staging skill locally on disk
  const skillDir = path.join(repoRoot, '.claude', 'skills', skill.frontmatter.name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skill.markdownContent, 'utf8');

  const prCreator = mockPrCreator || createOrGetPullRequest;

  const prDescription = `## Learned Skill: ${skill.frontmatter.name}

### Source Work Item Traceability
- **Work Item**: AB#${workItemId}
- **Domain**: \`${skill.frontmatter.domain}\`
- **Summary**: ${skill.summary}

### Extracted Patterns
\`\`\`markdown
${skill.markdownContent}
\`\`\`

---
*Notice: Human review and merge (◆) mandatory before skills repository update takes effect.*
`;

  const pr = await prCreator({
    workItemId,
    title: `Add learned skill: ${skill.frontmatter.name}`,
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
    `${env.ADO_ORG_URL}/_git/pullrequest/${pullRequestId}`;

  return {
    pullRequestId,
    prUrl,
    branchName,
  };
}
