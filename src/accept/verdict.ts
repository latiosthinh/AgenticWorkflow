export type AcceptanceVerdict =
  | { type: 'approve'; comment?: string }
  | { type: 'reject'; feedback: string }
  | { type: 'reset_rework' }
  | { type: 'none' };

export interface VerdictDetectionInput {
  currentState: string;
  previousState?: string;
  historyComment?: string;
  tags?: string;
}

export function detectAcceptanceVerdict(input: VerdictDetectionInput): AcceptanceVerdict {
  const comment = input.historyComment || '';

  if (comment.includes('[reset-rework]')) {
    return { type: 'reset_rework' };
  }

  // Approval condition
  if (
    (input.previousState === 'Dev Done' &&
      (input.currentState === 'Ready for QA' || input.currentState === 'Approved')) ||
    comment.includes('[approve-acceptance]')
  ) {
    return { type: 'approve', comment: comment || undefined };
  }

  // Rejection condition
  if (
    (input.previousState === 'Dev Done' && input.currentState === 'In Dev') ||
    (input.tags?.includes('[awaiting-acceptance]') && input.currentState === 'In Dev') ||
    comment.includes('[reject-acceptance]')
  ) {
    const feedback = comment
      .replace(/\[reject-acceptance\]/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();

    return {
      type: 'reject',
      feedback:
        feedback ||
        'Rejected from Dev Done without specific comments. Please review acceptance criteria and test results.',
    };
  }

  return { type: 'none' };
}

// ponytail: string token-based verdict classification; add structured webhook event payload parser in v2
