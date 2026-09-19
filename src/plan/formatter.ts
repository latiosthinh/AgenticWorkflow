import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

export function formatPlanQuestionsComment(questions: string[]): string {
  const questionsList = questions.map((q, idx) => `${idx + 1}. ${q}`).join('\n');

  const md = `### [Plan Q&A] Implementation Clarification Required

The automated agent identified ambiguities in the work item requirements that must be resolved before proceeding with development.

**Questions for Clarification:**
${questionsList}

*Reply directly to this discussion with your clarifications. Work item is tagged [awaiting-input]. Sandbox execution resources have been released while awaiting your reply.*
`;

  const rawHtml = marked.parse(md) as string;
  const sanitized = sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'title'],
    },
  });

  return `${sanitized.trim()}\n<!-- [automated-agent] -->`;
}

export function formatPlanLockedComment(
  planMarkdown: string,
  estimatedFiles: string[],
  governanceNote?: string
): string {
  const fileItems =
    estimatedFiles.length > 0
      ? estimatedFiles.map((f) => `* \`${f}\``).join('\n')
      : '* None specified';

  // Note rides THROUGH marked.parse + sanitizeHtml below — never raw HTML.
  const noteSection = governanceNote ? `**Governance Note:** ${governanceNote}\n\n` : '';

  const md = `### [Plan Checkpoint] Implementation Plan Locked

${noteSection}**Estimated Files to Modify/Create:**
${fileItems}

**Implementation Plan:**
${planMarkdown}
`;

  const rawHtml = marked.parse(md) as string;
  const sanitized = sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'title'],
    },
  });

  return `${sanitized.trim()}\n<!-- [automated-agent] -->`;
}

// ponytail: static Markdown to HTML plan formatter; add interactive collapsible sections in v2
