import { env, parseApproverIds, isActorAuthorized } from '../config/env.js';

export type AcceptanceVerdict =
  | { type: 'approve'; comment?: string; actor?: string }
  | { type: 'reject'; feedback: string; actor?: string }
  | { type: 'reset_rework'; actor?: string }
  | { type: 'unauthorized'; actor?: string; token?: string }
  | { type: 'none' };

export interface VerdictDetectionInput {
  currentState: string;
  previousState?: string;
  historyComment?: string;
  tags?: string;
  revisedBy?: string;
  approverIds?: string[];
}

export function detectAcceptanceVerdict(input: VerdictDetectionInput): AcceptanceVerdict {
  const comment = input.historyComment || '';
  const approverIds = input.approverIds ?? parseApproverIds(env.APPROVER_IDS);

  if (comment.includes('[reset-rework]')) {
    if (!isActorAuthorized(input.revisedBy, approverIds)) {
      return { type: 'unauthorized', actor: input.revisedBy, token: '[reset-rework]' };
    }
    return { type: 'reset_rework', actor: input.revisedBy };
  }

  // Approval condition:
  // 1. Explicit token [approve-acceptance]
  // 2. State transition Dev Done -> Ready for QA / Approved
  if (comment.includes('[approve-acceptance]')) {
    if (!isActorAuthorized(input.revisedBy, approverIds)) {
      return { type: 'unauthorized', actor: input.revisedBy, token: '[approve-acceptance]' };
    }
    return { type: 'approve', comment: comment || undefined, actor: input.revisedBy };
  }

  if (
    input.previousState === 'Dev Done' &&
    (input.currentState === 'Ready for QA' || input.currentState === 'Approved')
  ) {
    return { type: 'approve', comment: comment || undefined, actor: input.revisedBy };
  }

  // Rejection condition:
  // 1. Explicit token [reject-acceptance]
  // 2. State transition Dev Done -> In Dev or [awaiting-acceptance] -> In Dev
  if (comment.includes('[reject-acceptance]')) {
    if (!isActorAuthorized(input.revisedBy, approverIds)) {
      return { type: 'unauthorized', actor: input.revisedBy, token: '[reject-acceptance]' };
    }
    const feedback = comment
      .replace(/\[reject-acceptance\]/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();

    return {
      type: 'reject',
      feedback:
        feedback ||
        'Rejected from Dev Done without specific comments. Please review acceptance criteria and test results.',
      actor: input.revisedBy,
    };
  }

  if (
    (input.previousState === 'Dev Done' && input.currentState === 'In Dev') ||
    (input.tags?.includes('[awaiting-acceptance]') && input.currentState === 'In Dev')
  ) {
    const feedback = comment
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();

    return {
      type: 'reject',
      feedback:
        feedback ||
        'Rejected from Dev Done without specific comments. Please review acceptance criteria and test results.',
      actor: input.revisedBy,
    };
  }

  return { type: 'none' };
}

// ponytail: string token-based verdict classification; add structured webhook event payload parser in v2
