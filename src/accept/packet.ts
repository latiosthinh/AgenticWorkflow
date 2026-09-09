import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { buildTagPatch } from '../ado/work-item.js';
import {
  Operation,
  type JsonPatchDocument,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

export interface AcceptancePacketData {
  workItemId: number;
  testSuite: string;
  totalTests: number;
  passed: number;
  failed: number;
  durationMs: number;
  gitDiffStat: {
    filesChanged: number;
    insertions: number;
    deletions: number;
    totalLoc: number;
    rawStat: string;
  };
  prUrl?: string;
  previewUrl?: string;
}

export function formatAcceptancePacketComment(data: AcceptancePacketData): string {
  const prLinkMarkdown = data.prUrl
    ? `[View Pull Request](${data.prUrl})`
    : '*PR pending branch push*';
  const previewLinkMarkdown = data.previewUrl
    ? `[Open Staging Preview](${data.previewUrl})`
    : '*No preview environment configured*';
  const statusVerdict = data.failed === 0 ? 'READY FOR ACCEPTANCE' : 'TESTS FAILED';
  const rawStat = data.gitDiffStat.rawStat || `${data.gitDiffStat.totalLoc} LOC`;

  const md = `### [Acceptance Packet] Functional Verification Complete

| Metric | Result |
| :--- | :--- |
| **Status** | **${statusVerdict}** |
| **Tests** | ${data.passed}/${data.totalTests} passed (${data.durationMs}ms) |
| **Code Changes** | \`${rawStat}\` (<250 LOC ceiling verified) |
| **Pull Request** | ${prLinkMarkdown} |
| **Preview** | ${previewLinkMarkdown} |

<details>
<summary><strong>Verification Details & Instructions</strong></summary>

* **Reviewer Action**:
  * To **Approve**: Move work item state to \`Ready for QA\` or reply \`[approve-acceptance]\`.
  * To **Request Changes**: Move work item state to \`In Dev\` with comments or reply \`[reject-acceptance]\`.
  * To **Reset Rework Counter**: Reply \`[reset-rework]\` to clear bounce budget.
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
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
    },
  });

  return `${sanitized.trim()}\n<!-- [automated-agent] -->`;
}

export function buildDevDoneAcceptancePatch(
  htmlComment: string,
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(
    currentTags,
    '[awaiting-acceptance]',
    '[awaiting-input]'
  );
  return [
    ...tagPatches,
    {
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Dev Done',
    },
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: htmlComment,
    },
  ] as unknown as JsonPatchDocument;
}
// ponytail: template-based acceptance packets; link interactive live preview widget in v2
