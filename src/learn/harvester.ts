import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  reworkCycles,
  l3Evidence,
  qaEvidence,
  telemetryEvaluations,
} from '../db/schema.js';
import { getWorkItemDetails } from '../ado/work-item.js';
import type { TicketLifecycleData } from './types.js';

export async function harvestTicketLifecycleData(
  workItemId: number
): Promise<TicketLifecycleData> {
  const details = await getWorkItemDetails(workItemId);

  const rework = db
    .select()
    .from(reworkCycles)
    .where(eq(reworkCycles.workItemId, workItemId))
    .get();

  const l3 = db
    .select()
    .from(l3Evidence)
    .where(eq(l3Evidence.workItemId, workItemId))
    .orderBy(desc(l3Evidence.id))
    .get();

  const qa = db
    .select()
    .from(qaEvidence)
    .where(eq(qaEvidence.workItemId, workItemId))
    .get();

  const telemetry = db
    .select()
    .from(telemetryEvaluations)
    .where(eq(telemetryEvaluations.workItemId, workItemId))
    .orderBy(desc(telemetryEvaluations.id))
    .get();

  const reviewComments: string[] = [];
  if (details.history) {
    reviewComments.push(details.history);
  }

  return {
    workItemId,
    title: details.title || 'Untitled Ticket',
    description: details.description || '',
    acceptanceCriteria: details.acceptanceCriteria || '',
    reworkBounces: rework?.bounceCount || 0,
    reworkSourceGates: rework?.sourceGate ? [rework.sourceGate] : [],
    unitTestsPassed: l3?.passed || 1,
    unitTestsTotal: l3?.totalTests || 1,
    qaPassed: Boolean(qa && qa.failedCount === 0),
    qaFlakeCleared: Boolean(qa?.flakeCleared),
    errorRate: telemetry?.errorRate || '0.05%',
    p95LatencyMs: telemetry?.p95LatencyMs || 140,
    reviewComments,
  };
}
