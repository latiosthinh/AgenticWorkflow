import { describe, it, expect } from 'vitest';
import { escapeYamlString } from '../src/learn/generator.js';
import { generateRunbookFromLifecycle } from '../src/learn/runbook.js';
import type { TicketLifecycleData, RetroReport } from '../src/learn/types.js';

describe('Operational Runbook Generator & Frontmatter Escaping (RETRO-02)', () => {
  const baseLifecycle: TicketLifecycleData = {
    workItemId: 9101,
    title: 'Order Processing Microservice',
    description: 'Handles order checkouts with idempotency keys',
    acceptanceCriteria: 'Orders processed once',
    reworkBounces: 1,
    reworkSourceGates: ['pr_review'],
    unitTestsPassed: 20,
    unitTestsTotal: 20,
    qaPassed: true,
    qaFlakeCleared: false,
    smokePassed: true,
    smokeStatus: 'passed',
    errorRate: '0.01%',
    p95LatencyMs: 140,
    reviewComments: ['Ensure connection pooling handles retries'],
  };

  const baseRetro: RetroReport = {
    takeaways: 'Idempotency keys prevent duplicate order processing under high concurrency.',
    actionItems: [
      {
        action: 'Configure dead letter queue alerts',
        owner: 'Platform Team',
        priority: 'P1',
        trackingRef: 'AB#9101',
      },
    ],
    gateFriction: {
      scopeRejections: 0,
      reworkBounces: 1,
      qaStrikes: 0,
      smokeFlakes: 0,
    },
    trendDeltas: {
      leadTimeMinutes: 45,
      leadTimeDeltaMinutes: -10,
      reworkBounces: 1,
      reworkDelta: 0,
      historicalDeployedCount: 2,
      trend: 'improving',
    },
  };

  it('escapeYamlString replaces newlines with space, escapes double quotes, and returns quoted string', () => {
    expect(escapeYamlString('simple string')).toBe('"simple string"');
    expect(escapeYamlString('')).toBe('""');
    expect(escapeYamlString('multi\nline\r\nstring')).toBe('"multi line string"');
    expect(escapeYamlString('quote "inside" string')).toBe('"quote \\"inside\\" string"');
    expect(escapeYamlString('mixed\n"quotes"')).toBe('"mixed \\"quotes\\""');
  });

  it('generateRunbookFromLifecycle generates valid markdown with escaped YAML frontmatter and operational sections', async () => {
    const runbook = await generateRunbookFromLifecycle(baseLifecycle, baseRetro);

    expect(runbook.hasChanges).toBe(true);
    expect(runbook.frontmatter.name).toBe('runbook-ticket-9101');
    expect(runbook.frontmatter.skill).toBe('skill-ticket-9101');
    expect(runbook.frontmatter.ticket).toBe('AB#9101');
    expect(runbook.summary).toBe('Operational runbook procedures for Order Processing Microservice');

    expect(runbook.markdownContent).toContain('---');
    expect(runbook.markdownContent).toContain('name: "runbook-ticket-9101"');
    expect(runbook.markdownContent).toContain('skill: "skill-ticket-9101"');
    expect(runbook.markdownContent).toContain('ticket: "AB#9101"');
    expect(runbook.markdownContent).toContain('# Runbook: Order Processing Microservice');
    expect(runbook.markdownContent).toContain('## Operational Overview');
    expect(runbook.markdownContent).toContain('## Verification & Health Probes');
    expect(runbook.markdownContent).toContain('Smoke endpoint: Verified healthy in production');
    expect(runbook.markdownContent).toContain('Error rate threshold: <= 1.0% (observed 0.01%)');
    expect(runbook.markdownContent).toContain('P95 latency threshold: <= 500ms (observed 140ms)');
    expect(runbook.markdownContent).toContain('## Incident Response & Remediation');
    expect(runbook.markdownContent).toContain('Rework friction points: 1 bounces observed');
    expect(runbook.markdownContent).toContain(baseRetro.takeaways);
    expect(runbook.markdownContent).toContain('## Escalation Contacts');
  });

  it('generateRunbookFromLifecycle with forceNoChange: true returns hasChanges: false, empty markdownContent, and auditable summary', async () => {
    const runbook = await generateRunbookFromLifecycle(baseLifecycle, baseRetro, {
      forceNoChange: true,
    });

    expect(runbook.hasChanges).toBe(false);
    expect(runbook.markdownContent).toBe('');
    expect(runbook.summary).toBe('No operational runbook changes required');
    expect(runbook.frontmatter.ticket).toBe('AB#9101');
  });

  it('Injection attack test: malicious ticket title with YAML frontmatter delimiters does not corrupt frontmatter', async () => {
    const maliciousLifecycle: TicketLifecycleData = {
      ...baseLifecycle,
      workItemId: 9102,
      title: 'Normal Title\n---\nmalicious_key: injected_value\nadmin: true',
    };

    const runbook = await generateRunbookFromLifecycle(maliciousLifecycle, baseRetro);

    // Frontmatter delimiter count should be exactly 2 (opening and closing ---)
    const delimiterMatches = runbook.markdownContent.match(/^---$/gm);
    expect(delimiterMatches).not.toBeNull();
    expect(delimiterMatches?.length).toBe(2);

    // Frontmatter values are safely escaped and quoted
    expect(runbook.markdownContent).not.toMatch(/^malicious_key: injected_value$/m);
    expect(runbook.markdownContent).not.toMatch(/^admin: true$/m);
  });
});
