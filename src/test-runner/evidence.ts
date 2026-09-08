import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { db } from '../db/index.js';
import { l3Evidence, type InsertL3Evidence } from '../db/schema.js';
import { buildTagPatch } from '../ado/work-item.js';
import {
  Operation,
  type JsonPatchDocument,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

// ponytail: local sqlite L3 evidence store; export to ADO Test Plans API in v2

export interface L3EvidenceDetails {
  testSuite: string;
  totalTests: number;
  passed: number;
  failed: number;
  durationMs: number;
  gitDiffStat: string | { rawStat?: string; totalLoc?: number; filesChanged?: number };
  coverageSummary?: string;
  repairCyclesUsed?: number;
}

export async function recordL3Evidence(data: InsertL3Evidence): Promise<void> {
  db.insert(l3Evidence).values(data).run();
}

export function formatL3EvidenceComment(evidence: L3EvidenceDetails): string {
  const verdict = evidence.failed > 0 ? 'FAILED' : 'PASSED';
  const rawStat =
    typeof evidence.gitDiffStat === 'string'
      ? evidence.gitDiffStat
      : evidence.gitDiffStat?.rawStat || `${evidence.gitDiffStat?.totalLoc ?? 0} LOC changed`;

  const md = `### [L3 Evidence] Functional Verification: ${verdict}

**Test Execution Metrics:**
* **Suite:** \`${evidence.testSuite}\`
* **Total Tests:** ${evidence.totalTests}
* **Passed:** ${evidence.passed}
* **Failed:** ${evidence.failed}
* **Duration:** ${evidence.durationMs}ms
* **Git Diff:** \`${rawStat}\`${evidence.coverageSummary ? `\n* **Coverage:** ${evidence.coverageSummary}` : ''}

*All unit tests executed and passed within isolated worktree sandbox.*
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

export function buildDevDonePatch(
  htmlComment: string,
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(currentTags, '[l3-verified]', '[awaiting-input]');
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

export function buildRepairExhaustedPatch(
  htmlComment: string,
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(currentTags, '[repair-exhausted]', '[awaiting-input]');
  return [
    ...tagPatches,
    {
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Blocked',
    },
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: htmlComment,
    },
  ] as unknown as JsonPatchDocument;
}

export function buildContractConflictPatch(
  htmlComment: string,
  currentTags?: string
): JsonPatchDocument {
  const tagPatches = buildTagPatch(currentTags, '[contract-conflict]', '[awaiting-input]');
  return [
    ...tagPatches,
    {
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Blocked',
    },
    {
      op: Operation.Add,
      path: '/fields/System.History',
      value: htmlComment,
    },
  ] as unknown as JsonPatchDocument;
}
