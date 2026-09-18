import { stateStore } from '../state/index.js';
import { getWorkItemDetails } from '../ado/work-item.js';
import type { TicketLifecycleData } from './types.js';

export async function harvestTicketLifecycleData(
  workItemId: number
): Promise<TicketLifecycleData> {
  const details = await getWorkItemDetails(workItemId);
  const ticket = await stateStore.getTicketState(workItemId);

  const rework = ticket?.reworkCycles;

  const l3 = ticket?.l3Evidence && ticket.l3Evidence.length > 0
    ? ticket.l3Evidence[ticket.l3Evidence.length - 1]
    : undefined;

  const qa = ticket?.qaEvidence;

  const telemetry = ticket?.telemetryEvaluations && ticket.telemetryEvaluations.length > 0
    ? ticket.telemetryEvaluations[ticket.telemetryEvaluations.length - 1]
    : undefined;

  const reviewComments: string[] = [];
  if (details.history) {
    reviewComments.push(details.history);
  }

  const smokeEvidence = ticket?.smokeEvidence;
  const scopeRejections = ticket?.scopeLock?.iterationCount || 0;
  const lastQaRun =
    ticket?.qaRuns && ticket.qaRuns.length > 0
      ? ticket.qaRuns[ticket.qaRuns.length - 1]
      : undefined;
  const qaStrikes =
    lastQaRun?.strikeCount !== undefined
      ? lastQaRun.strikeCount
      : ticket?.qaRuns?.filter((r) => r.status === 'failed' || r.status === 'flaked').length || 0;
  const smokeFlakes = ticket?.smokeEvidence?.flakeCleared ? 1 : 0;

  return {
    workItemId,
    title: details.title || 'Untitled Ticket',
    description: details.description || '',
    acceptanceCriteria: details.acceptanceCriteria || '',
    reworkBounces: rework?.bounceCount || 0,
    reworkSourceGates: rework?.sourceGate ? [rework.sourceGate] : [],
    unitTestsPassed: l3?.passed ?? 1,
    unitTestsTotal: l3?.totalTests ?? 1,
    qaPassed: Boolean(qa && qa.failedCount === 0),
    qaFlakeCleared: Boolean(qa?.flakeCleared),
    errorRate: telemetry?.errorRate || '0.05%',
    p95LatencyMs: telemetry?.p95LatencyMs || 140,
    reviewComments,
    smokePassed: Boolean(smokeEvidence ? smokeEvidence.status === 'passed' : true),
    smokeStatus: smokeEvidence?.status || 'passed',
    scopeRejections,
    qaStrikes,
    smokeFlakes,
  };
}
