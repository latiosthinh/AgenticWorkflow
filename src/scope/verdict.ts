export type ScopeVerdict =
  | { type: 'approve'; comment?: string; actor?: string }
  | { type: 'reject'; feedback: string; actor?: string }
  | { type: 'reset_scope' }
  | { type: 'none' };

export interface ScopeVerdictDetectionInput {
  currentState: string;
  previousState?: string;
  historyComment?: string;
  tags?: string;
  previousTags?: string;
  revisedBy?: string;
}

export function detectScopeVerdict(input: ScopeVerdictDetectionInput): ScopeVerdict {
  const comment = input.historyComment || '';

  if (comment.includes('[reset-scope]')) {
    return { type: 'reset_scope' };
  }

  // Approval triggers:
  // 1. Explicit token [approve-scope]
  // 2. State transition New -> Ready to Dev
  // 3. Tag [scope-locked] added
  if (
    comment.includes('[approve-scope]') ||
    (input.previousState === 'New' && input.currentState === 'Ready to Dev') ||
    (input.tags?.includes('[scope-locked]') && !input.previousTags?.includes('[scope-locked]'))
  ) {
    return {
      type: 'approve',
      comment: comment || undefined,
      actor: input.revisedBy,
    };
  }

  // Rejection triggers:
  // 1. Explicit token [reject-scope]
  // 2. Tag [scope-rejected] added
  if (
    comment.includes('[reject-scope]') ||
    (input.tags?.includes('[scope-rejected]') && !input.previousTags?.includes('[scope-rejected]'))
  ) {
    const feedback = comment
      .replace(/\[reject-scope\]/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();

    return {
      type: 'reject',
      feedback:
        feedback ||
        'Scope review rejected by PM without specific comments. Please clarify requirements and scope boundaries.',
      actor: input.revisedBy,
    };
  }

  return { type: 'none' };
}

// ponytail: string token and tag-based verdict classification; add rich interactive webhook payload parsing in v2
