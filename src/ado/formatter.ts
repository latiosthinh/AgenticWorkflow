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
// ponytail: static Markdown to HTML formatter; add collapsible diff blocks in v2
