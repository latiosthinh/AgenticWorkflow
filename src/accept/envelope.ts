export interface CumulativeReworkEnvelope {
  workItemId: number;
  title: string;
  originalAcceptanceCriteria: string;
  priorGitDiff: string;
  reviewFeedback: string[];
  remainingLocBudget: number;
}

export function formatReworkPrompt(envelope: CumulativeReworkEnvelope): string {
  const feedbackItems = envelope.reviewFeedback
    .map((f, i) => `Feedback #${i + 1}:\n${f}`)
    .join('\n\n');

  return `You are performing an iterative rework turn on ticket #${envelope.workItemId}: "${envelope.title}".

<original_acceptance_criteria>
${envelope.originalAcceptanceCriteria}
</original_acceptance_criteria>

<prior_cumulative_diff>
${envelope.priorGitDiff}
</prior_cumulative_diff>

<reviewer_feedback>
${feedbackItems}
</reviewer_feedback>

<budget_constraints>
Cumulative LOC budget ceiling: 250 LOC total.
Remaining LOC budget available for this turn: ~${Math.max(0, envelope.remainingLocBudget)} LOC.
Protected baseline test files are read-only and must NOT be edited.
</budget_constraints>

INSTRUCTIONS:
1. Address all points raised in the reviewer feedback.
2. DO NOT revert previous changes that satisfy the original acceptance criteria.
3. Keep cumulative diff changes under the 250 LOC ceiling.
4. Protected baseline test files are read-only and must NOT be edited.
`;
}

// ponytail: plain text envelope with XML delimiters; add multi-modal attachment diffs in v2
