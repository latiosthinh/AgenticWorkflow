import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import { stateStore } from '../state/index.js';
import type { TicketState } from '../state/types.js';
import type {
  TicketLifecycleData,
  RetroActionItem,
  DoraTrendDeltas,
  RetroReport,
} from './types.js';

export const RetroActionItemSchema = z.object({
  action: z.string().min(1),
  owner: z.string().min(1),
  priority: z.enum(['P1', 'P2', 'P3']),
  trackingRef: z.string().min(1),
});

export async function calculateDoraTrendDeltas(
  currentTicket: TicketState
): Promise<DoraTrendDeltas> {
  const allTickets = await stateStore.listTickets({ includeArchived: true });
  const now = Date.now();
  const createdMs = currentTicket.createdAt ? new Date(currentTicket.createdAt).getTime() : now;
  const lastDeploy =
    currentTicket.deploymentRecords?.findLast?.((d) => d.status === 'deployed') ||
    currentTicket.deploymentRecords?.find((d) => d.status === 'deployed') ||
    currentTicket.deploymentRecords?.[currentTicket.deploymentRecords.length - 1];
  const deployedMs = lastDeploy?.deployedAt ? new Date(lastDeploy.deployedAt).getTime() : now;
  const leadTimeMinutes = Math.max(1, Math.round((deployedMs - createdMs) / 60000));
  const currentRework = currentTicket.reworkCycles?.bounceCount || 0;

  const deployedTickets = allTickets.filter(
    (t) =>
      t.workItemId !== currentTicket.workItemId &&
      t.deploymentRecords?.some((d) => d.status === 'deployed')
  );

  if (deployedTickets.length === 0) {
    return {
      leadTimeMinutes,
      leadTimeDeltaMinutes: 0,
      reworkBounces: currentRework,
      reworkDelta: 0,
      historicalDeployedCount: 0,
      trend: 'stable',
    };
  }

  let totalLeadTime = 0;
  let totalRework = 0;
  for (const t of deployedTickets) {
    const tCreated = t.createdAt ? new Date(t.createdAt).getTime() : now;
    const tDeploy =
      t.deploymentRecords.findLast?.((d) => d.status === 'deployed') ||
      t.deploymentRecords.find((d) => d.status === 'deployed');
    const tDeployed = tDeploy?.deployedAt ? new Date(tDeploy.deployedAt).getTime() : tCreated;
    totalLeadTime += Math.max(1, Math.round((tDeployed - tCreated) / 60000));
    totalRework += t.reworkCycles?.bounceCount || 0;
  }

  const avgLeadTime = Math.round(totalLeadTime / deployedTickets.length);
  const avgRework = Math.round(totalRework / deployedTickets.length);
  const leadTimeDeltaMinutes = leadTimeMinutes - avgLeadTime;
  const reworkDelta = currentRework - avgRework;

  return {
    leadTimeMinutes,
    leadTimeDeltaMinutes,
    reworkBounces: currentRework,
    reworkDelta,
    historicalDeployedCount: deployedTickets.length,
    trend:
      leadTimeDeltaMinutes === 0 && reworkDelta === 0
        ? 'stable'
        : leadTimeDeltaMinutes <= 0 && reworkDelta <= 0
          ? 'improving'
          : 'regressing',
  };
}

export async function generateRetroReport(
  lifecycle: TicketLifecycleData,
  options?: { mockRetroResult?: RetroReport }
): Promise<RetroReport> {
  if (options?.mockRetroResult) {
    return options.mockRetroResult;
  }

  const takeaways = `Retrospective for AB#${lifecycle.workItemId} (${lifecycle.title}): Verified ${lifecycle.unitTestsPassed}/${lifecycle.unitTestsTotal} unit tests passing. Handled ${lifecycle.reworkBounces} rework bounces. QA verification: ${lifecycle.qaPassed ? 'passed' : 'failed'}. Smoke test: ${lifecycle.smokePassed ? 'passed' : 'failed'}.`;

  const actionItem: RetroActionItem = RetroActionItemSchema.parse({
    action: 'Review failure traces for root cause',
    owner: 'Dev Team',
    priority: 'P2',
    trackingRef: `AB#${lifecycle.workItemId}`,
  });

  const gateFriction = {
    scopeRejections: lifecycle.scopeRejections || 0,
    reworkBounces: lifecycle.reworkBounces || 0,
    qaStrikes: lifecycle.qaStrikes || 0,
    smokeFlakes: lifecycle.smokeFlakes || 0,
  };

  const ticketState = (await stateStore.getTicketState(lifecycle.workItemId)) || {
    workItemId: lifecycle.workItemId,
    revId: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    auditLogs: [],
    planCheckpoints: [],
    l3Evidence: [],
    deploymentRecords: [],
    telemetryEvaluations: [],
    qaRuns: [],
    skillsPrs: [],
  };

  const trendDeltas = await calculateDoraTrendDeltas(ticketState);

  return {
    takeaways,
    actionItems: [actionItem],
    gateFriction,
    trendDeltas,
  };
}

export function formatRetroAlertComment(options: {
  workItemId: number;
  errorMessage: string;
}): string {
  const html = `
<div class="retro-alert">
  <h3>⚠️ [L7 Retro Alert] Retrospective Generation Failed</h3>
  <p>The retrospective step for work item #${options.workItemId} failed after retry. The transition to <strong>Done</strong> has been halted for human escalation.</p>
  <p><strong>Error:</strong> <code>${sanitizeHtml(options.errorMessage)}</code></p>
  <p><strong>Tag:</strong> <code>[retro-failed]</code> attached. Resolve the error and re-dispatch or review manually.</p>
</div>
`.trim();

  return `${sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'div',
      'h3',
      'p',
      'strong',
      'code',
    ]),
    allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, div: ['class'] },
  })}\n<!-- [automated-agent] -->`;
}
