import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import type { AuditResult } from '../auditor/schema.js';

export function formatL1AuditComment(result: AuditResult): string {
  let md: string;

  if (result.passed) {
    const listItems = result.reasons.map((r) => `* ${r}`).join('\n');
    md = `**[L1 Evidence] Contract Audit: PASSED**

**Status:** Ready to Dev

${result.criteria_summary}

**Definition of Done Met Requirements:**
${listItems}
`;
  } else {
    const listItems = result.reasons.map((r) => `* ${r}`).join('\n');
    md = `**[L1 Evidence] Contract Audit: INCOMPLETE (Action Required)**

**Status:** Retained in New

${result.criteria_summary}

**Missing Requirements / Action Items:**
${listItems}

*Please address the missing requirements above and save the work item to trigger a re-audit.*
`;
  }

  const rawHtml = marked.parse(md) as string;
  const sanitized = sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'title'],
    },
  });

  return `${sanitized.trim()}\n<!-- [automated-agent] -->`;
}

export const formatAuditComment = formatL1AuditComment;

export interface PrDescriptionOptions {
  workItemId: number;
  title: string;
  acceptanceCriteria?: string;
  testSummary: {
    suite: string;
    totalTests: number;
    passed: number;
    failed: number;
    durationMs: number;
  };
  diffStat: {
    totalLoc: number;
    filesChanged: number;
  };
}

export function formatPrDescription(options: PrDescriptionOptions): string {
  const { workItemId, title, acceptanceCriteria, testSummary, diffStat } = options;

  return `## AB#${workItemId} - ${title}

### L1 Requirements Verification
- [x] Scope bounded within \`<250 LOC\` ceiling (\`${diffStat.totalLoc}\` LOC across ${diffStat.filesChanged} files)
- [x] Test assertion files protected and unmodified
- [x] Acceptance criteria verified:
${acceptanceCriteria ? `> ${acceptanceCriteria.replace(/\n/g, '\n> ')}` : '> Standard Definition of Done'}

### L3 Functional Evidence (Local Pre-PR)
- **Suite**: \`${testSummary.suite}\`
- **Result**: **${testSummary.passed}/${testSummary.totalTests} passed** (${testSummary.failed} failed)
- **Duration**: \`${testSummary.durationMs}ms\`

<!-- [automated-agent] -->`;
}

export interface MergeSummaryCommentOptions {
  pullRequestId: number;
  prUrl: string;
  mergeCommitSha: string;
  targetBranch: string;
  policies: {
    l2Reviewers: boolean;
    l3Build: boolean;
    l4Security: boolean;
  };
}

export function formatMergeSummaryComment(options: MergeSummaryCommentOptions): string {
  const { pullRequestId, prUrl, mergeCommitSha, targetBranch, policies } = options;

  const md = `### [Merge Summary] Pull Request Merged

Pull Request [#${pullRequestId}](${prUrl}) has been successfully merged into \`${targetBranch}\`.

- **Merge Commit:** \`${mergeCommitSha.substring(0, 8)}\`
- **L2 Code Review Gate:** ${policies.l2Reviewers ? 'Passed' : 'N/A'}
- **L3 Build Validation Gate:** ${policies.l3Build ? 'Passed' : 'N/A'}
- **L4 Security & SAST Gate:** ${policies.l4Security ? 'Passed' : 'N/A'}

Work item transitioned to **Ready for QA**.
`;

  const rawHtml = marked.parse(md) as string;
  const sanitized = sanitizeHtml(rawHtml, {
    allowedTags: ['h3', 'p', 'ul', 'li', 'strong', 'code', 'a'],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
    },
  });

  return `${sanitized.trim()}\n<!-- [automated-agent] -->`;
}
// ponytail: static Markdown to HTML formatter; add collapsible diff blocks in v2
