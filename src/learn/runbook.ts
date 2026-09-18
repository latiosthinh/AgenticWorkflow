import { escapeYamlString } from './generator.js';
import type { TicketLifecycleData, LearnedRunbook, RetroReport } from './types.js';

export async function generateRunbookFromLifecycle(
  lifecycle: TicketLifecycleData,
  retro: RetroReport,
  options?: { forceNoChange?: boolean; mockRunbook?: LearnedRunbook }
): Promise<LearnedRunbook> {
  if (options?.mockRunbook) {
    return options.mockRunbook;
  }

  if (options?.forceNoChange) {
    return {
      frontmatter: {
        name: `runbook-ticket-${lifecycle.workItemId}`,
        skill: `skill-ticket-${lifecycle.workItemId}`,
        ticket: `AB#${lifecycle.workItemId}`,
        updatedAt: new Date().toISOString(),
      },
      markdownContent: '',
      hasChanges: false,
      summary: 'No operational runbook changes required',
    };
  }

  const now = new Date().toISOString();
  const cleanTitle = lifecycle.title ? lifecycle.title.replace(/[\r\n]+/g, ' ').trim() : '';
  const name = `runbook-ticket-${lifecycle.workItemId}`;
  const skillName = `skill-ticket-${lifecycle.workItemId}`;

  const markdownContent = `---
name: ${escapeYamlString(name)}
skill: ${escapeYamlString(skillName)}
ticket: ${escapeYamlString(`AB#${lifecycle.workItemId}`)}
updatedAt: ${escapeYamlString(now)}
---

# Runbook: ${cleanTitle}

## Operational Overview
Operational guidance and health monitoring procedures for work item AB#${lifecycle.workItemId}.

## Verification & Health Probes
- Smoke endpoint: ${lifecycle.smokePassed ? 'Verified healthy in production' : 'Standard health probe'}
- Error rate threshold: <= 1.0% (observed ${lifecycle.errorRate})
- P95 latency threshold: <= 500ms (observed ${lifecycle.p95LatencyMs}ms)

## Incident Response & Remediation
- Rework friction points: ${lifecycle.reworkBounces} bounces observed during development.
- Key takeaways: ${retro.takeaways}

## Escalation Contacts
- Primary: Dev Team
- Secondary: Platform Operations
`;

  return {
    frontmatter: {
      name,
      skill: skillName,
      ticket: `AB#${lifecycle.workItemId}`,
      updatedAt: now,
    },
    markdownContent,
    hasChanges: true,
    summary: `Operational runbook procedures for ${cleanTitle}`,
  };
}
