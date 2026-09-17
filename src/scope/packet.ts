import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { buildTagPatch } from '../ado/work-item.js';
import {
  Operation,
  type JsonPatchDocument,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

export interface ScopePacketData {
  workItemId: number;
  title: string;
  criteriaSummary: string;
  reasons: string[];
}

export function formatScopeReviewPacketComment(data: ScopePacketData): string {
  const md = `### [Scope Review Packet] L1 Audit Contract Passed

| Metric | Result |
| :--- | :--- |
| **Status** | **AWAITING PM SCOPE LOCK** |
| **Audit Summary** | ${data.criteriaSummary} |

<details open>
<summary><strong>Scope Review Instructions &amp; Definition of Done</strong></summary>

* **PM Action Required**:
  * To **Approve**: Move work item state to \`Ready to Dev\`, tag \`[scope-locked]\`, or reply \`[approve-scope]\`.
  * To **Request Changes**: Keep in \`New\` and reply \`[reject-scope] <feedback>\` or tag \`[scope-rejected]\`.
  * To **Reset Scope Counter**: Reply \`[reset-scope]\`.
</details>
`;

  const rawHtml = marked.parse(md) as string;
  const sanitized = sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img',
      'h1',
      'h2',
      'h3',
      'details',
      'summary',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
    },
  });

  return `${sanitized.trim()}\n<!-- [automated-agent] -->`;
}

export function buildParkScopeLockPatch(
  htmlComment: string,
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(
    currentTags,
    '[awaiting-scope-lock]; [audit-passed]'
  );
  return [
    ...tagPatches,
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: htmlComment,
    },
  ] as unknown as JsonPatchDocument;
}
// ponytail: static markdown template; customize DoD checklist via project config in v2
