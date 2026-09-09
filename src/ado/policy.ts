import {
  PolicyEvaluationStatus,
  type PolicyEvaluationRecord,
} from 'azure-devops-node-api/interfaces/PolicyInterfaces.js';
import { adoClient, withRetry } from './client.js';

export interface PolicyGateStatus {
  allApproved: boolean;
  pendingCount: number;
  failedCount: number;
  l2ReviewersPassed: boolean;
  l3BuildPassed: boolean;
  l4SecurityPassed: boolean;
  summary: string[];
}

export interface MergeReadiness {
  canMerge: boolean;
  acceptanceApproved: boolean;
  reviewerApproved: boolean;
  policiesGreen: boolean;
  reasons: string[];
}

export async function verifyBranchPolicies(
  projectId: string,
  pullRequestId: number
): Promise<PolicyGateStatus> {
  const policyApi = await adoClient.getPolicyApi();
  const artifactId = `vstfs:///CodeReview/CodeReviewId/${projectId}/${pullRequestId}`;

  const evaluations: PolicyEvaluationRecord[] = await withRetry(() =>
    policyApi.getPolicyEvaluations(projectId, artifactId, true)
  );

  const blockingEvaluations = (evaluations || []).filter(
    (e) => e.configuration?.isBlocking && e.status !== PolicyEvaluationStatus.NotApplicable
  );

  let pendingCount = 0;
  let failedCount = 0;
  let l2ReviewersPassed = true;
  let l3BuildPassed = true;
  let l4SecurityPassed = true;
  const summary: string[] = [];

  for (const evaluation of blockingEvaluations) {
    const typeName = evaluation.configuration?.type?.displayName || 'Unknown Policy';
    const status = evaluation.status;
    const isApproved = status === PolicyEvaluationStatus.Approved;

    if (status === PolicyEvaluationStatus.Queued || status === PolicyEvaluationStatus.Running) {
      pendingCount++;
    } else if (status === PolicyEvaluationStatus.Rejected || status === PolicyEvaluationStatus.Broken) {
      failedCount++;
    }

    const lowerName = typeName.toLowerCase();
    if (lowerName.includes('reviewer') || lowerName.includes('quality')) {
      if (!isApproved) l2ReviewersPassed = false;
    } else if (lowerName.includes('build')) {
      if (!isApproved) l3BuildPassed = false;
    } else if (lowerName.includes('status') || lowerName.includes('security')) {
      if (!isApproved) l4SecurityPassed = false;
    }

    summary.push(`${typeName}: ${status !== undefined ? PolicyEvaluationStatus[status] : 'Unknown'}`);
  }

  const allApproved = blockingEvaluations.length > 0 && pendingCount === 0 && failedCount === 0;

  return {
    allApproved,
    pendingCount,
    failedCount,
    l2ReviewersPassed,
    l3BuildPassed,
    l4SecurityPassed,
    summary,
  };
}

export function evaluateMergeReadiness(options: {
  workItemTags?: string;
  reviewerVotes?: Array<{ vote?: number }>;
  policyStatus: PolicyGateStatus;
}): MergeReadiness {
  const acceptanceApproved = options.workItemTags?.includes('[acceptance-approved]') === true;

  const votes = options.reviewerVotes || [];
  const hasApprovedVote = votes.some((r) => (r.vote ?? 0) >= 5);
  const hasNegativeVote = votes.some((r) => (r.vote ?? 0) < 0);
  const reviewerApproved = hasApprovedVote && !hasNegativeVote;

  const policiesGreen = options.policyStatus.allApproved === true;

  const reasons: string[] = [];
  if (!acceptanceApproved) {
    reasons.push('Work item lacks [acceptance-approved] tag');
  }
  if (!reviewerApproved) {
    if (hasNegativeVote) {
      reasons.push('PR has rejecting reviewer votes');
    } else {
      reasons.push('PR lacks reviewer approval (vote >= 5)');
    }
  }
  if (!policiesGreen) {
    reasons.push('Branch policies are not all approved');
  }

  const canMerge = acceptanceApproved && reviewerApproved && policiesGreen;

  return {
    canMerge,
    acceptanceApproved,
    reviewerApproved,
    policiesGreen,
    reasons,
  };
}
// ponytail: keyword classification for L2/L3/L4; add custom policy GUID mapping in v2
