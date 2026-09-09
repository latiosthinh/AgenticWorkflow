import sanitizeHtml from 'sanitize-html';
import {
  getWorkItemDetails,
  escalateReworkToBlocked,
  transitionToReadyForQa,
} from '../ado/work-item.js';
import { evaluateCircuitBreaker } from '../accept/breaker.js';
import { extractActiveReviewComments } from '../ado/threads.js';
import { verifyBranchPolicies } from '../ado/policy.js';
import { processWorkItemRework } from '../execute/rework-worker.js';
import { formatMergeSummaryComment } from '../ado/formatter.js';
import { env } from '../config/env.js';

export function extractWorkItemId(resource: any): number | undefined {
  if (!resource) return undefined;

  // 1. Check title for AB#123 pattern
  if (typeof resource.title === 'string') {
    const match = resource.title.match(/AB#(\d+)/i);
    if (match) {
      const id = parseInt(match[1], 10);
      if (Number.isInteger(id) && id > 0) return id;
    }
  }

  // 2. Check workItemRefs array
  if (Array.isArray(resource.workItemRefs)) {
    for (const ref of resource.workItemRefs) {
      if (ref && typeof ref === 'object') {
        const id = Number(ref.id);
        if (Number.isInteger(id) && id > 0) return id;
        if (typeof ref.url === 'string') {
          const match = ref.url.match(/workItems\/(\d+)/i);
          if (match) {
            const urlId = parseInt(match[1], 10);
            if (Number.isInteger(urlId) && urlId > 0) return urlId;
          }
        }
      }
    }
  }

  return undefined;
}

function sanitizeComment(text: string): string {
  return sanitizeHtml(text, {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}

export async function handlePullRequestEvent(
  payload: any,
  options?: any
): Promise<void> {
  const eventType = payload?.eventType;
  const resource = payload?.resource;

  if (!resource) {
    return;
  }

  const pullRequestId = Number(resource.pullRequestId || resource.id);
  const workItemId = extractWorkItemId(resource);

  if (!workItemId) {
    console.warn(
      `[pr-router] PR event ${eventType} missing work item reference (title: "${resource.title}")`
    );
    return;
  }

  if (eventType === 'git.pullrequest.updated') {
    const reviewers = resource.reviewers || [];
    const hasNegativeVote = reviewers.some((r: any) => (r.vote ?? 0) < 0);

    if (!hasNegativeVote) {
      return;
    }

    let details: any;
    try {
      details = await getWorkItemDetails(workItemId);
    } catch {
      // Fall back
    }

    if (details?.state === 'Blocked') {
      return;
    }

    // Check if update was triggered by the bot's own commit push
    const lastCommitAuthor =
      resource.lastMergeSourceCommit?.committer?.id ||
      resource.lastMergeSourceCommit?.author?.id;
    if (
      lastCommitAuthor &&
      lastCommitAuthor.toLowerCase() === env.ADO_BOT_ID.toLowerCase()
    ) {
      return;
    }

    const breaker = await evaluateCircuitBreaker(workItemId, 'pr_review');
    if (!breaker.allowed) {
      await escalateReworkToBlocked(workItemId, breaker.currentCount);
      return;
    }

    const repositoryId = resource.repository?.id || env.ADO_REPOSITORY_ID;
    const projectId =
      resource.repository?.project?.id ||
      resource.repository?.project?.name ||
      env.ADO_PROJECT;

    const comments = await extractActiveReviewComments(
      repositoryId,
      pullRequestId,
      projectId,
      env.ADO_BOT_ID
    );

    let feedback = '';
    if (comments.length > 0) {
      const formattedComments = comments
        .map((c) => {
          const sanitized = sanitizeComment(c.content);
          return `File: ${c.filePath}:${c.lineNumber ?? 0}\nAuthor: ${c.author}\nComment: ${sanitized}`;
        })
        .join('\n\n');
      feedback = `<pr_review_feedback>\n${formattedComments}\n</pr_review_feedback>`;
    } else {
      feedback = `<pr_review_feedback>\nReviewer requested changes / rejected PR. Please inspect PR review status and resolve.\n</pr_review_feedback>`;
    }

    const revId = details?.rev || 1;

    await processWorkItemRework(workItemId, revId, feedback, options);
  } else if (eventType === 'git.pullrequest.merged') {
    const mergeCommitSha =
      resource.lastMergeCommit?.commitId ||
      resource.completionOptions?.mergeCommitId ||
      resource.mergeCommitId ||
      'unknown';

    const projectId =
      resource.repository?.project?.id ||
      resource.repository?.project?.name ||
      env.ADO_PROJECT;

    let policyStatus;
    try {
      policyStatus = await verifyBranchPolicies(projectId, pullRequestId);
    } catch (err: any) {
      console.error(`[pr-router] Policy verification failed for PR #${pullRequestId}:`, err);
      policyStatus = {
        allApproved: false,
        pendingCount: 0,
        failedCount: 0,
        l2ReviewersPassed: false,
        l3BuildPassed: false,
        l4SecurityPassed: false,
        summary: ['Policy verification API unavailable; gates unverified'],
      };
    }

    const prUrl =
      resource.url ||
      resource._links?.web?.href ||
      `${env.ADO_ORG_URL}/_git/pullrequest/${pullRequestId}`;
    const targetBranch =
      resource.targetRefName?.replace('refs/heads/', '') || 'main';

    const summaryComment = formatMergeSummaryComment({
      pullRequestId,
      prUrl,
      mergeCommitSha,
      targetBranch,
      policies: {
        l2Reviewers: policyStatus.l2ReviewersPassed,
        l3Build: policyStatus.l3BuildPassed,
        l4Security: policyStatus.l4SecurityPassed,
      },
    });

    await transitionToReadyForQa(workItemId, summaryComment);
  }
}
// ponytail: basic PR event routing; add automated reviewer re-request in v2
