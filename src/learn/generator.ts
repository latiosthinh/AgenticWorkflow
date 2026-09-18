import { slugify } from '../utils/paths.js';
import type { TicketLifecycleData, LearnedSkill } from './types.js';

export function escapeYamlString(str: string): string {
  if (!str) return '""';
  const sanitized = str.replace(/[\r\n]+/g, ' ').replace(/"/g, '\\"');
  return `"${sanitized}"`;
}

export function inferSkillDomain(title: string, description: string): 'backend' | 'frontend' | 'infra' | 'common' {
  const text = `${title} ${description}`.toLowerCase();
  if (/ui|react|css|html|frontend|button|component|page|view/i.test(text)) {
    return 'frontend';
  }
  if (/docker|pipeline|k8s|infra|deploy|terraform|cloud/i.test(text)) {
    return 'infra';
  }
  if (/api|db|database|sqlite|sql|service|auth|jwt|token|route|redis|cache/i.test(text)) {
    return 'backend';
  }
  return 'common';
}

export async function generateSkillFromLifecycle(
  lifecycle: TicketLifecycleData,
  options?: { mockSkill?: LearnedSkill }
): Promise<LearnedSkill> {
  if (options?.mockSkill) {
    return options.mockSkill;
  }

  const domain = inferSkillDomain(lifecycle.title, lifecycle.description);
  const cleanTopic = slugify(lifecycle.title).slice(0, 30);
  const name = `${domain}-${cleanTopic}`;

  const description = `Extracted best practices, testing strategies, and pitfall mitigations from ticket AB#${lifecycle.workItemId}: ${lifecycle.title}`;

  const pitfallSection = lifecycle.reworkBounces > 0
    ? `### Rework Breaker Insights (${lifecycle.reworkBounces} bounces)
- Pay close attention to review feedback on ${lifecycle.reworkSourceGates.join(' and ')} gates.
- Ensure all test assertions remain immutable and backward-compatible before submitting PRs.`
    : `- Maintain bounded implementations with strict diff budgets (<250 LOC).
- Ensure error handling scrubs all sensitive tokens and returns sanitized diagnostics.`;

  const markdownContent = `---
name: ${name}
description: ${description}
domain: ${domain}
tags:
  - ${domain}
  - ticket-${lifecycle.workItemId}
  - golden-path
---

# ${lifecycle.title}

## Overview
${description}

## Core Patterns & Code Solutions
- Bounded implementation architecture adhering to project conventions.
- Automated test coverage: verified ${lifecycle.unitTestsPassed}/${lifecycle.unitTestsTotal} unit tests passing.
- Telemetry confidence: verified production error rate ${lifecycle.errorRate} and p95 latency ${lifecycle.p95LatencyMs}ms.

## Pitfalls & Common Mistakes
${pitfallSection}

## Quick Reference & Verification Checklist
- [x] DoD and testability criteria verified (L1)
- [x] Code reviewed with branch policy enforcement (L2/L4)
- [x] Staging integration tested with 2-strike filter (L3)
- [x] Telemetry monitored with zero regressions (L6)
`;

  return {
    frontmatter: {
      name,
      description,
      domain,
      tags: [domain, `ticket-${lifecycle.workItemId}`, 'golden-path'],
    },
    markdownContent,
    summary: description,
  };
}
