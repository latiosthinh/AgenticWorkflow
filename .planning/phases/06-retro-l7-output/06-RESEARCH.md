# Phase 6: Retro & L7 Output - Research

**Researched:** 2026-09-18
**Domain:** SDLC Continuous Feedback, Retrospective Synthesis, Runbook Generation, Evidence Level L7, Done Gate Re-sequencing
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Awaited Before Done (RETRO-01):** Remove fire-and-forget `.catch(warn)` call in `src/deploy/worker.ts`. Sequence retro execution: `smoke` -> `telemetry` -> `await retro` -> `persist L7` -> `compileL1L7EvidenceIndex(failClosed: true)` -> `patch Done`.
- **Fail-Closed Gate (EVID-03, RETRO-03):** If retro fails or times out, retry once; if fail again, tag `[retro-failed]` and halt transition to `Done` for human escalation. Never transition to `Done` without real L7 record.
- **Combined Single PR (RETRO-02):** Single PR to skills repository publishes both `SKILL.md` and `RUNBOOK.md` (or records "no change" in L7 record).
- **Prompt-Injection Defense:** Untrusted ticket text (title, description, review comments) wrapped in XML source isolation tags (`<learning_source_context>`), YAML frontmatter escaped, meta-directive overrides denied.
- **Async Human Merge:** Done criterion is agent-completable facts (PRs opened with live URLs, L7 record persisted in StateStore). Human PR merge asynchronous, does not block current ticket reaching `Done`.
- **Runbook Location:** In target skills PR branch under `.claude/skills/<skill-name>/RUNBOOK.md`.

### the agent's Discretion

- Mandatory action items format: `{ action: string, owner: string, priority: 'P1'|'P2'|'P3', trackingRef: string }`.
- DORA trend deltas: rework count, lead time estimate from `createdAt` to `deployedAt`.

### Deferred Ideas (OUT OF SCOPE)

- None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| **RETRO-01** | On release confidence (smoke + telemetry pass), system runs retro step BEFORE `Done` transition (awaited, fail-closed per EVID-03): analyzes ticket lifecycle (rework cycles, review comments, test/smoke fixes, telemetry) and produces retro takeaways with mandatory, tracked action items. | Research maps execution re-sequencing in `src/deploy/worker.ts` and synthesis logic in `src/learn/retro.ts`. [VERIFIED: codebase inspection] |
| **RETRO-02** | Retro emits runbook updates (`RUNBOOK.md` diff) or recorded "no change", plus skill enhancement (`SKILL.md`), submitted as SINGLE PR to skills repo (never direct-commit; human merge required) with prompt-injection defenses (XML source isolation, escaped frontmatter, meta-directive override denial) — reusing existing `learn/` publisher path. | Research verifies dual-asset worktree staging in `src/learn/publisher.ts`, runbook generator in `src/learn/runbook.ts`, and YAML frontmatter escaping. [VERIFIED: codebase inspection] |
| **RETRO-03** | Retro artifacts (takeaways, runbook-diff PR link, skill PR link, trend deltas) persist as L7 record (in ticket `StateStore` file) that gates `Done`; ticket transitions to `Done` with full L1–L7 evidence index and `[golden-path-complete]` tag, while human PR merge stays async. | Research specifies `draft.retroRecords` and `draft.l7Evidence` persistence in `src/learn/worker.ts` and fail-closed compilation gate in `src/deploy/worker.ts`. [VERIFIED: codebase inspection] |
| **EVID-01** | System persists L7 Continuous-Feedback evidence in ticket `StateStore` record (retro section): retro takeaways (with mandatory action items — owner + priority + tracking ref), runbook-diff PR link (or recorded "no change" auditable negative), skill PR link, and DORA-aligned trend deltas sourced from existing lifecycle state. | Research confirms `L7EvidenceState` schema alignment in `src/state/types.ts` and `stateStore.listTickets()` historical trend computation. [VERIFIED: codebase inspection] |
</phase_requirements>

## Summary

Phase 6 completes Golden Path v2 Step 9 (Retro). Phase 5 established automated smoke verification and fail-fast telemetry monitoring. However, `src/deploy/worker.ts` currently fires `processLearningFeedbackLoop(workItemId)` in background `.catch(warn)` after patching `Done`.

Phase 6 eliminates fire-and-forget gap. Sequence redefined:
1. Smoke verification passes.
2. Production telemetry passes.
3. Mark deployment record `deployed` with `deployedAt`.
4. Run retrospective feedback loop (awaited). Synthesize takeaways, structured action items (`{ action, owner, priority, trackingRef }`), gate friction metrics, DORA trend deltas (`leadTimeMinutes`, `reworkBounces` vs historical averages), operational runbook delta (`RUNBOOK.md`), and skill enhancements (`SKILL.md`).
5. Stage both `SKILL.md` and `RUNBOOK.md` in single PR on branch `skills/learn-ticket-<id>-<slug>`.
6. Persist L7 record in `StateStore` ticket file (`draft.retroRecords` and `draft.l7Evidence`).
7. Compile full L1–L7 evidence index using `compileL1L7EvidenceIndex(workItemId, { failClosed: true })`.
8. Transition ADO work item to `Done` with tag `[golden-path-complete]` and formatted L1–L7 table comment.
9. If retro fails after 2 attempts, tag `[retro-failed]`, post alert comment, halt `Done` transition for human escalation.

**Primary recommendation:** Implement `src/learn/retro.ts` and `src/learn/runbook.ts`, extend `src/learn/publisher.ts` to stage dual files in one PR branch, persist `L7EvidenceState` in `src/learn/worker.ts`, and re-sequence `src/deploy/worker.ts` to await retro before `compileL1L7EvidenceIndex(failClosed: true)` and `Done` patch.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Retrospective Takeaways & Action Items | Agent / Engine (`src/learn/retro.ts`) | — | Synthesizes insights from lifecycle telemetry, rework, and tests. |
| DORA Trend Deltas Calculation | Persistence / Store (`src/learn/retro.ts` + `StateStore`) | — | Computes lead time and rework deltas across historical ticket files via `stateStore.listTickets()`. |
| Operational Runbook Synthesis | Agent / Engine (`src/learn/runbook.ts`) | — | Generates `RUNBOOK.md` diff or auditable "no change" negative. |
| Dual-Asset Staging (`SKILL.md` + `RUNBOOK.md`) | Workspace / Git (`src/learn/publisher.ts`) | ADO Git API | Ephemeral branch staging on `.claude/skills/<name>/`, PR creation via `createOrGetPullRequest`. |
| L7 Evidence StateStore Persistence | State (`src/learn/worker.ts`) | Queue Lane | Serialized via `workItemQueueManager.runInLane`, writes crash-atomic JSON frontmatter. |
| Done Re-sequencing & Fail-Closed Gating | Deployment Orchestrator (`src/deploy/worker.ts`) | Router | Awaits retro, retries once, halts with `[retro-failed]` on double fault, gates `Done` with `compileL1L7EvidenceIndex(failClosed: true)`. |
| ADO Work Item Notification & State Patching | Client / Ingress (`src/ado/client.ts`) | — | Posts discussion comments with `<!-- [automated-agent] -->` shield and updates tags/states. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard | Confidence |
|---|---|---|---|---|
| `ai` (Vercel AI SDK) | `^7.0.93` | LLM reasoning / object generation | Native multi-step tool execution, structured schema output (`Output.object`). [VERIFIED: package.json] | HIGH |
| `@ai-sdk/openai` | `^4.0.60` | Model provider (GPT-4o) | Fast, deterministic schema-bound generation for retro insights. [VERIFIED: package.json] | HIGH |
| `azure-devops-node-api` | `^17.0.0` | Official ADO REST SDK | Typed JSON patch operations for states, tags, comments, and PRs. [VERIFIED: package.json] | HIGH |
| `zod` | `^4.5.4` | Runtime schema validation | Strict validation for action items and structured outputs. [VERIFIED: package.json] | HIGH |
| `sanitize-html` | `^2.17.7` | HTML sanitization | Protects discussion comments from script injection. [VERIFIED: package.json] | HIGH |
| `node:fs` / `node:path` | `24.x LTS` native | File I/O & path manipulation | Zero-dependency file handling for StateStore and git worktree staging. [VERIFIED: host runtime] | HIGH |

### Supporting
| Library | Version | Purpose | When to Use | Confidence |
|---|---|---|---|---|
| `p-queue` | `^9.3.3` | In-memory concurrency control | Per-work-item lane lock (`concurrency: 1`) ensures single-writer file integrity. [VERIFIED: package.json] | HIGH |
| `simple-git` | `^3.36.0` | Git worktree management | Staging branches for learning PR creation. [VERIFIED: package.json] | HIGH |
| `vitest` | `^5.0.0` | Unit & integration tests | Fast ESM test runner with per-test `mkdtemp` state harness. [VERIFIED: package.json] | HIGH |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|---|---|---|
| Two separate PRs (Skill PR + Runbook PR) | Combined single PR | Two PRs create noise and double review burden. Single PR packages all learning context atomically. |
| External metrics DB for DORA | `stateStore.listTickets()` | External DB violates zero-dep rule. Reading local frontmatter files is fast (<10ms for hundreds of tickets) and requires zero ops. |
| Hard failing Done on missing human PR merge | Async human merge | Gating Done on human PR merge causes pipeline deadlock. Done requires PR created and L7 persisted. PR merge is async. |

## Architecture Patterns

### System Architecture Diagram

```mermaid
flowchart TD
    subgraph S8["Step 8: Release Confidence"]
        SMOKE[Smoke Verification] -->|Pass| TELEMETRY[Telemetry Observation Window]
    end

    subgraph S9["Step 9: Retrospective & L7 Output (Awaited)"]
        TELEMETRY -->|Pass| SET_DEPLOYED[Update deploymentRecords: status=deployed, deployedAt=now]
        SET_DEPLOYED --> RETRO_ATTEMPT[Attempt 1: processLearningFeedbackLoop]
        RETRO_ATTEMPT -->|Fail| RETRO_RETRY[Attempt 2: Retry processLearningFeedbackLoop]
        RETRO_RETRY -->|Fail Twice| RETRO_FAIL[Tag [retro-failed] + Alert Comment + HALT Done Transition]
        
        RETRO_ATTEMPT -->|Success| RETRO_OK[Synthesize Retro + Runbook + Skill]
        RETRO_RETRY -->|Success| RETRO_OK
        
        RETRO_OK --> PR_STAGE[Stage .claude/skills/<name>/(SKILL.md + RUNBOOK.md)]
        PR_STAGE --> PR_OPEN[Open Single Skills PR via ADO Git API]
        PR_OPEN --> L7_PERSIST[Persist draft.retroRecords & draft.l7Evidence in StateStore]
        L7_PERSIST --> PR_COMMENT[Post [Learned Skill Staged] Work Item Comment]
        
        PR_COMMENT --> EVID_COMPILE[compileL1L7EvidenceIndex with failClosed: true]
        EVID_COMPILE -->|Missing L7 / Throws| HALT_EVID[Halt Transition: MissingEvidenceError]
        EVID_COMPILE -->|Success| DONE_PATCH[Patch ADO: State=Done, Tag=[golden-path-complete], History=L1-L7 Index]
        DONE_PATCH --> ARCHIVE[archiveTicket in StateStore]
    end
```

### Recommended Project Structure
```
src/
├── learn/
│   ├── types.ts             # Extend TicketLifecycleData, define RetroReport, RetroActionItem, LearnedRunbook
│   ├── prompt.ts            # Retrospective & runbook system prompts with prompt-injection defense
│   ├── harvester.ts         # Harvests smoke, scope, rework, QA, telemetry, and timing metadata
│   ├── generator.ts         # Generates SKILL.md with escaped YAML frontmatter
│   ├── retro.ts             # NEW: synthesizes takeaways, mandatory action items, and DORA trend deltas
│   ├── runbook.ts           # NEW: generates RUNBOOK.md or auditable "no change" negative
│   ├── publisher.ts         # Extends stageAndPublishSkillPr to stage both SKILL.md and RUNBOOK.md
│   └── worker.ts            # Coordinates retro + runbook + skill, persists L7 in StateStore
├── deploy/
│   ├── worker.ts            # Re-sequences Done transition: smoke -> telemetry -> await retro -> compileL1L7(failClosed: true) -> Done
│   └── evidence-index.ts    # compileL1L7EvidenceIndex fail-closed compiler
tests/
├── retro.test.ts            # Unit tests for retro synthesis, action items format, and DORA calculation
├── runbook.test.ts          # Unit tests for runbook generation, diff vs no change, and frontmatter escaping
├── learn-publisher.test.ts  # Tests for single-PR staging of both SKILL.md and RUNBOOK.md
└── deploy-orchestrator.test.ts # Integration tests for awaited retro, retry on failure, [retro-failed] tag, and fail-closed Done gate
```

### Pattern 1: Awaited Retro & Fail-Closed Gate Sequencing
**What:** Retrospective runs inside `processTelemetryEvaluation` BEFORE the ADO `Done` patch.
**When to use:** Whenever production telemetry verifies zero regressions.
**Example:**
```typescript
// Source: src/deploy/worker.ts re-sequencing pattern
// 1. Mark deployment record deployed with timestamp
await workItemQueueManager.runInLane(workItemId, async () => {
  await stateStore.updateTicketState(workItemId, (draft) => {
    if (draft.deploymentRecords?.length) {
      const last = draft.deploymentRecords[draft.deploymentRecords.length - 1];
      last.status = 'deployed';
      last.deployedAt = new Date().toISOString();
    }
  });
});

// 2. Await retrospective with bounded 2-attempt retry loop
let retroOutcome: LearningProcessResult | undefined;
let retroError: Error | undefined;

for (let attempt = 1; attempt <= 2; attempt++) {
  try {
    retroOutcome = await processLearningFeedbackLoop(workItemId, {
      mockSkill: options?.mockSkill,
      mockRetroResult: options?.mockRetroResult,
      mockPrCreator: options?.mockPrCreator,
    });
    retroError = undefined;
    break;
  } catch (err: any) {
    retroError = err;
    console.warn(`[deploy-worker] Retro feedback loop attempt ${attempt} failed for #${workItemId}:`, err?.message);
  }
}

// 3. Fail-closed: two failures halt Done transition with [retro-failed]
if (retroError || !retroOutcome) {
  const alertComment = formatRetroAlertComment({
    workItemId,
    errorMessage: retroError?.message || 'Retrospective feedback loop failed after retry',
  });
  const tagPatch = buildTagPatch(details.tags, '[retro-failed]', '[deploying]');
  await adoClient.updateWorkItem(workItemId, [
    ...tagPatch,
    { op: Operation.Add, path: '/fields/System.History', value: alertComment },
  ]);
  throw new Error(`Retrospective feedback loop failed after retry for #${workItemId}; Done transition halted`);
}

// 4. Compile L1-L7 evidence index fail-closed (guarantees real persisted L7 record exists)
const evidenceSummary = await compileL1L7EvidenceIndex(workItemId, { failClosed: true });
const evidenceComment = formatEvidenceIndexComment(evidenceSummary);

// 5. Transition to Done
const tagPatch = buildTagPatch(details.tags, '[golden-path-complete]', '[deploying]');
await adoClient.updateWorkItem(workItemId, [
  { op: Operation.Replace, path: '/fields/System.State', value: 'Done' },
  ...tagPatch,
  { op: Operation.Add, path: '/fields/System.History', value: evidenceComment },
]);

// 6. Archive ticket
await stateStore.archiveTicket(workItemId);
```

### Pattern 2: Single-PR Multi-Asset Staging (`SKILL.md` + `RUNBOOK.md`)
**What:** Ephemeral worktree branch stages both files under `.claude/skills/<skill-name>/` before opening a single PR.
**When to use:** Publishing learned assets to avoid multiple noisy PRs.
**Example:**
```typescript
// Source: src/learn/publisher.ts
const skillDir = path.join(repoRoot, '.claude', 'skills', skill.frontmatter.name);
fs.mkdirSync(skillDir, { recursive: true });

// Always stage SKILL.md
fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skill.markdownContent, 'utf8');

// Stage RUNBOOK.md only if runbook has changes
if (runbook?.hasChanges && runbook.markdownContent) {
  fs.writeFileSync(path.join(skillDir, 'RUNBOOK.md'), runbook.markdownContent, 'utf8');
}
```

### Pattern 3: DORA Trend Delta Calculation via StateStore Scans
**What:** Scans existing ticket markdown files using `stateStore.listTickets()` to compute lead time and rework deltas.
**When to use:** In `src/learn/retro.ts` when building L7 record.
**Example:**
```typescript
// Source: src/learn/retro.ts
const allTickets = await stateStore.listTickets();
const now = Date.now();
const createdMs = currentTicket.createdAt ? new Date(currentTicket.createdAt).getTime() : now;
const lastDeploy = currentTicket.deploymentRecords?.find(d => d.status === 'deployed') ||
  currentTicket.deploymentRecords?.[currentTicket.deploymentRecords.length - 1];
const deployedMs = lastDeploy?.deployedAt ? new Date(lastDeploy.deployedAt).getTime() : now;
const leadTimeMinutes = Math.max(1, Math.round((deployedMs - createdMs) / 60000));
const currentRework = currentTicket.reworkCycles?.bounceCount || 0;

const deployedTickets = allTickets.filter(
  t => t.workItemId !== currentTicket.workItemId &&
       t.deploymentRecords?.some(d => d.status === 'deployed')
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
  const tCreated = new Date(t.createdAt).getTime();
  const tDeploy = t.deploymentRecords.find(d => d.status === 'deployed');
  const tDeployed = tDeploy?.deployedAt ? new Date(tDeploy.deployedAt).getTime() : tCreated;
  totalLeadTime += Math.max(1, Math.round((tDeployed - tCreated) / 60000));
  totalRework += t.reworkCycles?.bounceCount || 0;
}

const avgLeadTime = Math.round(totalLeadTime / deployedTickets.length);
const avgRework = Math.round(totalRework / deployedTickets.length);

return {
  leadTimeMinutes,
  leadTimeDeltaMinutes: leadTimeMinutes - avgLeadTime,
  reworkBounces: currentRework,
  reworkDelta: currentRework - avgRework,
  historicalDeployedCount: deployedTickets.length,
  trend: (leadTimeMinutes - avgLeadTime < 0 && currentRework - avgRework <= 0) ? 'improving' : 'regressing',
};
```

### Pattern 4: YAML Frontmatter String Escaping & XML Prompt Isolation
**What:** Protects frontmatter from injection break-outs and isolates untrusted text in LLM prompts.
**When to use:** Whenever embedding ticket title or user description into markdown frontmatter or prompts.
**Example:**
```typescript
export function escapeYamlString(str: string): string {
  if (!str) return '""';
  const sanitized = str.replace(/[\r\n]+/g, ' ').replace(/"/g, '\\"');
  return `"${sanitized}"`;
}
```

### Anti-Patterns to Avoid
- **Fire-and-forget learning:** Calling `processLearningFeedbackLoop(id).catch(warn)` after `Done` patch. Creates race conditions and violates EVID-03.
- **Two separate learning PRs:** Opening one PR for `SKILL.md` and another for `RUNBOOK.md`. Doubles review fatigue; stage together.
- **Direct-commit to main:** Writing `SKILL.md` or `RUNBOOK.md` straight to default branch. Allows untrusted ticket input to poison future agent executions without human review.
- **Blocking Done on human PR merge:** Waiting for a human engineer to click "Approve and Complete" on the skills PR before moving ticket to `Done`. Deadlocks automated pipeline. Done requires agent-completable facts: PR opened with live URL, L7 record persisted.
- **Fabricating L7 defaults:** Falling back to `??` or `||` when takeaways or action items are missing. Violates EVID-03.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Retrospective schema validation | Custom JSON parser checks | `zod` (`z.object({...})`) | Guarantees exact shape for `{ action, owner, priority, trackingRef }` with type inference. |
| Cross-ticket historical querying | SQLite database / SQL queries | `stateStore.listTickets()` | File-based StateStore already implements `readdir` + frontmatter parser in memory. No database allowed. |
| Git branch creation & commit | Raw shell `git checkout` strings | `simple-git` or `createOrGetPullRequest` | Handles worktrees, path quoting, and ADO branch policies safely. |
| Comment HTML stripping | Custom regex tag removers | `sanitize-html` | Prevents XSS and malicious tag injections into ADO discussion threads. |

## Common Pitfalls

### Pitfall 1: Fire-and-Forget `.catch(warn)` Leaves Orphaned State
**What goes wrong:** Ticket reaches `Done` in ADO, but learning process crashes or times out in background without leaving an L7 record.
**Why it happens:** v1.0 executed learning after the `Done` transition with `.catch(warn)`.
**How to avoid:** Sequence retro execution *before* `Done` patch; await completion; fail closed if retro does not return a valid result.
**Warning signs:** Work items in `Done` state with `evidenceIndex.l7Summary: null` or no `retroRecords`.

### Pitfall 2: Double-Fault Deadlock Without Status Tag
**What goes wrong:** Retro LLM fails repeatedly, leaving the work item indefinitely in `Ready to Deploy` with no indication of why deployment stalled.
**Why it happens:** Uncaught error without updating ADO tags.
**How to avoid:** Limit retry to 1 attempt; on second failure, patch tag `[retro-failed]` and post clear diagnostic history comment.
**Warning signs:** Ticket stuck in `Ready to Deploy` with `[deploying]` tag and repeated poller re-dispatches.

### Pitfall 3: YAML Frontmatter Injection via Malicious Ticket Title
**What goes wrong:** A ticket titled `---\nname: evil\n` injects arbitrary YAML keys into `SKILL.md` or `RUNBOOK.md`, altering domain or tags.
**Why it happens:** Template literal interpolation (`name: ${title}`) without escaping newlines and quotes.
**How to avoid:** Use `slugify()` for identifiers and `escapeYamlString()` (stripping newlines, quoting) for descriptions. Wrap body in `<learning_source_context>`.
**Warning signs:** Corrupted frontmatter syntax errors during markdown parsing.

### Pitfall 4: Divide-by-Zero in DORA Lead Time Calculations
**What goes wrong:** On a fresh deployment or the very first ticket, average historical lead time calculation crashes with `NaN`.
**Why it happens:** Dividing by `deployedTickets.length` when length is 0.
**How to avoid:** Guard against empty historical ticket arrays: return `leadTimeDeltaMinutes: 0`, `reworkDelta: 0`, `historicalDeployedCount: 0`.
**Warning signs:** `NaN` or `null` appearing in `trendDeltas`.

## Code Examples

### Retro Synthesis & Action Item Verification (`src/learn/retro.ts`)
```typescript
import { z } from 'zod';
import { stateStore } from '../state/index.js';
import type { TicketState, L7EvidenceState } from '../state/types.js';
import type { TicketLifecycleData } from './types.js';
import sanitizeHtml from 'sanitize-html';

export const RetroActionItemSchema = z.object({
  action: z.string().min(1),
  owner: z.string().min(1),
  priority: z.enum(['P1', 'P2', 'P3']),
  trackingRef: z.string().min(1),
});

export type RetroActionItem = z.infer<typeof RetroActionItemSchema>;

export interface DoraTrendDeltas {
  leadTimeMinutes: number;
  leadTimeDeltaMinutes: number;
  reworkBounces: number;
  reworkDelta: number;
  historicalDeployedCount: number;
  trend: 'improving' | 'stable' | 'regressing';
}

export interface RetroReport {
  takeaways: string;
  actionItems: RetroActionItem[];
  gateFriction: {
    scopeRejections: number;
    reworkBounces: number;
    qaStrikes: number;
    smokeFlakes: number;
  };
  trendDeltas: DoraTrendDeltas;
}

export function formatRetroAlertComment(options: { workItemId: number; errorMessage: string }): string {
  const html = `
<div class="retro-alert">
  <h3>⚠️ [L7 Retro Alert] Retrospective Generation Failed</h3>
  <p>The retrospective step for work item #${options.workItemId} failed after retry. The transition to <strong>Done</strong> has been halted for human escalation.</p>
  <p><strong>Error:</strong> <code>${sanitizeHtml(options.errorMessage)}</code></p>
  <p><strong>Tag:</strong> <code>[retro-failed]</code> attached. Resolve the error and re-dispatch or review manually.</p>
</div>
`.trim();

  return `${sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['div', 'h3', 'p', 'strong', 'code']),
    allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, div: ['class'] },
  })}\n<!-- [automated-agent] -->`;
}
```

### Runbook Generation (`src/learn/runbook.ts`)
```typescript
import type { TicketLifecycleData } from './types.js';
import type { RetroReport } from './retro.js';
import { escapeYamlString } from './generator.js';

export interface LearnedRunbook {
  frontmatter: {
    name: string;
    skill: string;
    ticket: string;
    updatedAt: string;
  };
  markdownContent: string;
  hasChanges: boolean;
  summary: string;
}

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
  const name = `runbook-ticket-${lifecycle.workItemId}`;
  const skillName = `skill-ticket-${lifecycle.workItemId}`;

  const markdownContent = `---
name: ${escapeYamlString(name)}
skill: ${escapeYamlString(skillName)}
ticket: ${escapeYamlString(`AB#${lifecycle.workItemId}`)}
updatedAt: ${escapeYamlString(now)}
---

# Runbook: ${lifecycle.title}

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
    summary: `Operational runbook procedures for ${lifecycle.title}`,
  };
}
```

## State of the Art

| Old Approach (v1.0) | Current Approach (v2.0 Golden Path) | When Changed | Impact |
|---|---|---|---|
| Background fire-and-forget learning `.catch(warn)` | Awaited retro step with 2-attempt retry and fail-closed gate before `Done` | Phase 6 | Eliminates silent learning failures; ensures every `Done` ticket has verified L7 evidence. |
| Only `SKILL.md` generated | Both `SKILL.md` and `RUNBOOK.md` generated | Phase 6 | Captures operational runbook procedures alongside code patterns. |
| Single-file PR for skill | Single PR packaging both `SKILL.md` and `RUNBOOK.md` under `.claude/skills/<name>/` | Phase 6 | Atomic review in skills repository without duplicate PR noise. |
| Done = deployed + telemetry monitor passed | Done = deployed + L6 passed + L7 persisted in StateStore | Phase 6 | Full L1–L7 evidence index completeness guaranteed at wire state transition. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Action item priorities restricted to `'P1'` \| `'P2'` \| `'P3'`. | Retro Synthesis | Low; matches standard Jira/ADO triage priority conventions. |
| A2 | Runbooks reside under `.claude/skills/<skill-name>/RUNBOOK.md` in skills repo. | Architecture Patterns | Low; confirmed by CONTEXT.md decisions. |
| A3 | Lead time measured from `ticket.createdAt` to `deployedAt`. | DORA Metrics | Low; standard DORA lead time definition for change lifecycle. |

## Open Questions (RESOLVED)

1. **How to handle tickets where runbook has "no change"?**
   - *What we know:* EVID-01 states: "runbook-diff PR link (or a recorded 'no change' auditable negative)".
   - *RESOLVED:* When `hasChanges: false`, single PR contains only `SKILL.md`, `l7Record.runbookDiffPrUrl` is set to `null`, and comment copy renders `Runbook: (no change)` without breaking HTML links.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | Core runtime | ✓ | v24.0.2 | — |
| TypeScript | Type safety & compilation | ✓ | v7.0.2 | — |
| Vitest | Test execution | ✓ | v5.0.0 | — |
| simple-git / Git CLI | PR branch staging | ✓ | git 2.53.0 | Ephemeral worktree mocks in test |
| azure-devops-node-api | ADO work item updates | ✓ | v17.0.0 | Mock ADO client in test harness |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Vitest v5.0.0 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/learn-orchestrator.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| **RETRO-01** | Retro runs awaited before Done patch; takeaways + action items generated; fire-and-forget removed | integration | `npx vitest run tests/deploy-orchestrator.test.ts` | ❌ Wave 0 Gap |
| **RETRO-02** | Single PR stages both `SKILL.md` and `RUNBOOK.md` with prompt-injection escaping and XML isolation | unit / integration | `npx vitest run tests/learn-publisher.test.ts` | ❌ Wave 0 Gap |
| **RETRO-03** | L7 record persisted in StateStore gates Done; retro failure retries once then halts with `[retro-failed]` | integration | `npx vitest run tests/deploy-orchestrator.test.ts` | ❌ Wave 0 Gap |
| **EVID-01** | Takeaways, action items `{ action, owner, priority, trackingRef }`, and DORA trend deltas computed and persisted in StateStore | unit | `npx vitest run tests/retro.test.ts` | ❌ Wave 0 Gap |

### Sampling Rate
- **Per task commit:** Quick run command for specific test (`npx vitest run tests/<file>.test.ts`)
- **Per wave merge:** Full test suite (`npm test`)
- **Phase gate:** All 41+ test files green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/retro.test.ts` — covers RETRO-01, EVID-01 (retro synthesis, action item validation, DORA trend deltas)
- [ ] `tests/runbook.test.ts` — covers RETRO-02 (runbook generation, diff vs no change, YAML escaping)
- [ ] `tests/learn-publisher.test.ts` — covers RETRO-02 (dual-asset single PR staging under `.claude/skills/<name>/`)
- [ ] Update `tests/deploy-orchestrator.test.ts` and `tests/learn-orchestrator.test.ts` — covers RETRO-01, RETRO-03 (awaited sequencing, retry on failure, `[retro-failed]` tagging, fail-closed Done gate)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | no | Internal pipeline execution; ADO PAT used via established client. |
| V3 Session Management | no | Stateless agent execution. |
| V4 Access Control | yes | ADO PAT stored in env, never logged or written to ticket files. |
| V5 Input Validation | yes | `zod` schema validation on action items, `sanitize-html` on comments, `escapeYamlString` on frontmatter, XML source isolation `<learning_source_context>`. |
| V6 Cryptography | no | No custom crypto. Native SHA-256 for dedup markers. |

### Known Threat Patterns for Learning & Retro Stack

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Prompt injection via work item title/description | Tampering / Elevation of Privilege | Wrap untrusted text in `<learning_source_context>`, deny meta-directive overrides in system prompt, escape YAML frontmatter quotes and newlines. |
| Arbitrary file write to main branch | Tampering | Staging strictly confined to ephemeral branch (`skills/learn-ticket-${id}-${slug}`). Direct commit forbidden. Human PR review mandatory. |
| HTML / Script injection in work item discussion | Tampering (Stored XSS) | Sanitize all comments via `sanitize-html` allowing only safe markup tags (`div`, `h3`, `p`, `strong`, `code`, `a`). |
| Denial of service via infinite retro retry | Denial of Service | Strict 2-attempt bound on retro feedback loop; fail-closed halt with `[retro-failed]` tag on double fault. |

## Sources

### Primary (HIGH confidence)
- `src/deploy/worker.ts` & `src/deploy/evidence-index.ts` — deployment sequencing and L1–L7 evidence compilation.
- `src/learn/harvester.ts`, `src/learn/generator.ts`, `src/learn/publisher.ts`, `src/learn/worker.ts` — learning feedback loop and skills publishing.
- `src/state/types.ts` & `src/state/store.ts` — `TicketState`, `L7EvidenceState`, `retroRecords`, and `listTickets()`.
- `.planning/phases/06-retro-l7-output/06-CONTEXT.md` — locked user decisions for Phase 6.
- `.planning/REQUIREMENTS.md` & `.planning/ROADMAP.md` — RETRO-01..03, EVID-01 specifications.

### Secondary (MEDIUM confidence)
- DORA Metrics Core Research (Google Cloud Architecture Center / DevOps Research & Assessment) — Lead Time for Changes and Change Failure/Rework trend calculation methodologies.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — uses existing zero-dependency Node.js 24 + TypeScript codebase.
- Architecture: HIGH — directly aligns with Golden Path v2 Step 9 specification and file-backed StateStore.
- Pitfalls: HIGH — covers prompt-injection vectors, retry loops, and fail-closed compilation.

**Research date:** 2026-09-18
**Valid until:** 2026-10-18

## RESEARCH COMPLETE
