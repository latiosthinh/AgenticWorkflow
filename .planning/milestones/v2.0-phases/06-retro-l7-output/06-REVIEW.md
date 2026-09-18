---
phase: 06-retro-l7-output
reviewed: 2026-09-18T08:15:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src/learn/types.ts
  - src/learn/retro.ts
  - src/learn/runbook.ts
  - src/learn/harvester.ts
  - src/learn/publisher.ts
  - src/learn/worker.ts
  - src/deploy/worker.ts
  - src/learn/generator.ts
  - src/learn/prompt.ts
  - tests/retro.test.ts
  - tests/runbook.test.ts
  - tests/learn-publisher.test.ts
  - tests/learn-orchestrator.test.ts
  - tests/deploy-orchestrator.test.ts
findings:
  critical: 1
  warning: 4
  info: 4
  total: 9
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-09-18T08:15:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Code review completed for Phase 06 (Retrospective & L7 Output). Implementation establishes retrospective report generation, DORA trend metrics computation, dual-asset (`SKILL.md` + `RUNBOOK.md`) staging, StateStore L7 evidence persistence, and re-sequenced deployment orchestration with bounded retry and fail-closed gates.

The core orchestration flow is robust, well-structured, and verified by 428 passing unit and integration tests. However, review identified 1 Critical issue, 4 Warnings, and 4 Info items:
- **Critical (CR-01):** `calculateDoraTrendDeltas` queries `stateStore.listTickets()`, but deployed tickets are immediately moved to `archive/` by `stateStore.archiveTicket()`. Because `listTickets()` only scans active tickets, historical deployed tickets are never seen in production, reducing historical comparison to 0.
- **Warnings (WR-01 - WR-04):** Path traversal vulnerability in skill staging path resolution, inaccurate `qaStrikes` metric counting clean QA runs as strikes, unescaped YAML frontmatter in `SKILL.md` generation, and unpushed remote branch requirement for real ADO PR creation.
- **Info (IN-01 - IN-04):** Incomplete fallback PR web URL, trend calculation returning `'improving'` instead of `'stable'` when deltas are zero, first vs. last deployed record selection, and empty title fallback formatting.

---

## Critical Issues

### CR-01: Historical DORA Metrics Engine Starved by Ticket Archiving

**File:** `src/learn/retro.ts:22`, `src/state/store.ts:253`, `src/deploy/worker.ts:246`
**Issue:**
In `src/learn/retro.ts`, `calculateDoraTrendDeltas` calls `stateStore.listTickets()` to find historical deployed tickets:
```typescript
const allTickets = await stateStore.listTickets();
...
const deployedTickets = allTickets.filter(
  (t) =>
    t.workItemId !== currentTicket.workItemId &&
    t.deploymentRecords?.some((d) => d.status === 'deployed')
);
```
However, `stateStore.listTickets()` reads only from `this.ticketsDir` (`.worktrees/state/tickets`).
In `src/deploy/worker.ts:246`, immediately after a ticket passes telemetry, retro, and transitions to Done, `stateStore.archiveTicket(workItemId)` moves `${workItemId}.md` out of `this.ticketsDir` into `this.archiveDir`.

As a result, every completed ticket is archived and disappears from `listTickets()`. For any future ticket running the retrospective loop, `deployedTickets` will always be empty (`historicalDeployedCount === 0`), and deltas will always return `leadTimeDeltaMinutes: 0`, `reworkDelta: 0`, `trend: 'stable'`. The historical DORA trend metric engine will never observe historical deployments in production.

**Fix:**
Expose an option on `listTickets({ includeArchived?: boolean })` (or add `listAllTickets()`) that scans both `this.ticketsDir` and `this.archiveDir`, and use it in `calculateDoraTrendDeltas`:

```typescript
// In src/state/store.ts:
public async listTickets(options?: { includeArchived?: boolean }): Promise<TicketState[]> {
  const dirs = [this.ticketsDir];
  if (options?.includeArchived && fs.existsSync(this.archiveDir)) {
    dirs.push(this.archiveDir);
  }
  const tickets: TicketState[] = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith('.md') || entry.startsWith('.')) continue;
      try {
        const raw = fs.readFileSync(path.join(dir, entry), 'utf8');
        const { frontmatter } = parseTicketDocument<TicketState>(raw);
        tickets.push(frontmatter);
      } catch {
        // Skip corrupt
      }
    }
  }
  return tickets;
}

// In src/learn/retro.ts:22:
const allTickets = await stateStore.listTickets({ includeArchived: true });
```

---

## Warnings

### WR-01: Path Traversal Vulnerability in Local Skill Staging

**File:** `src/learn/publisher.ts:74`
**Issue:**
In `stageAndPublishSkillPr`, the staging directory is computed as:
```typescript
const skillDir = path.join(repoRoot, '.claude', 'skills', skill.frontmatter.name);
fs.mkdirSync(skillDir, { recursive: true });
```
While `slugify` is called on line 70 for `branchName` (`const cleanSlug = slugify(skill.frontmatter.name);`), `skillDir` uses `skill.frontmatter.name` directly without sanitization. If `skill.frontmatter.name` contains directory traversal characters (`../` or `..\`), `fs.mkdirSync` and `fs.writeFileSync` can write `SKILL.md` and `RUNBOOK.md` outside of `.claude/skills/` to arbitrary locations on disk.

**Fix:**
Use `cleanSlug` for directory creation, or verify the resolved path stays within `.claude/skills`:
```typescript
const cleanSlug = slugify(skill.frontmatter.name);
const skillsBase = path.resolve(repoRoot, '.claude', 'skills');
const skillDir = path.resolve(skillsBase, cleanSlug);

if (!skillDir.startsWith(skillsBase + path.sep)) {
  throw new Error(`Invalid skill name path traversal: ${skill.frontmatter.name}`);
}

fs.mkdirSync(skillDir, { recursive: true });
```

### WR-02: `qaStrikes` Metric Inaccurately Counts Clean Passing QA Runs as Strikes

**File:** `src/learn/harvester.ts:30`
**Issue:**
In `src/learn/harvester.ts`:
```typescript
const qaStrikes = ticket?.qaRuns?.length || 0;
```
`ticket.qaRuns` records an entry for every run of the QA suite. When a ticket passes QA on its first attempt, `executeTwoStrikeQaFilter` records a run with `strikeCount: 0` and `status: 'passed'`.
Using `ticket?.qaRuns?.length` causes clean tickets (which had 0 test failures) to be reported with `qaStrikes: 1` in `TicketLifecycleData`, distorting retrospective gate friction metrics.

**Fix:**
Count only runs that actually failed, or read the latest strike count:
```typescript
const qaStrikes = ticket?.qaRuns?.filter((r) => r.status === 'failed').length || 0;
```

### WR-03: Missing Frontmatter Escaping in `SKILL.md` Generator

**File:** `src/learn/generator.ts:45-53`
**Issue:**
`escapeYamlString` was added to `src/learn/generator.ts:4` and correctly used in `src/learn/runbook.ts:32-36`. However, `generateSkillFromLifecycle` in `src/learn/generator.ts` does not use `escapeYamlString` when formatting `SKILL.md` frontmatter:
```typescript
  const markdownContent = `---
name: ${name}
description: ${description}
domain: ${domain}
...
```
Because `${description}` contains `${lifecycle.title}` directly and is unquoted/unescaped, any title with colons, quotes, or newlines can corrupt the YAML frontmatter of `SKILL.md`.

**Fix:**
Apply `escapeYamlString` to frontmatter fields in `generateSkillFromLifecycle`:
```typescript
  const markdownContent = `---
name: ${escapeYamlString(name)}
description: ${escapeYamlString(description)}
domain: ${domain}
tags:
  - ${domain}
  - ticket-${lifecycle.workItemId}
  - golden-path
---
```

### WR-04: Staged Files Not Committed/Pushed to Remote Branch Before PR Creation

**File:** `src/learn/publisher.ts:74-115`
**Issue:**
`stageAndPublishSkillPr` writes `SKILL.md` and `RUNBOOK.md` to local disk under `repoRoot/.claude/skills/<name>/`, but does not execute git operations (`git checkout -b`, `git add`, `git commit`, `git push`) to create `branchName` on the remote Azure DevOps repository before invoking `prCreator`.
When running against real Azure DevOps (where `mockPrCreator` is not provided), `createOrGetPullRequest` calls `gitApi.createPullRequest({ sourceRefName: 'refs/heads/' + branchName, ... })`. ADO rejects PR creation with a 400/404 error if the source branch does not exist on the remote. With Phase 6's awaited retro and fail-closed retry cap, this will halt the Done transition and flag `[retro-failed]`.

**Fix:**
Either commit and push the branch via Git CLI before invoking `createOrGetPullRequest`, or create the branch and commit using the Azure DevOps Git Push REST API (`gitApi.createPush`).

---

## Info

### IN-01: Fallback PR Web URL Missing Project and Repository Identifiers

**File:** `src/learn/publisher.ts:121`
**Issue:**
The fallback URL for PR comments is formatted as:
```typescript
`${env.ADO_ORG_URL}/_git/pullrequest/${pullRequestId}`
```
Standard Azure DevOps web URLs for pull requests require the project and repository context:
`${env.ADO_ORG_URL}/${env.ADO_PROJECT}/_git/${env.ADO_REPOSITORY_ID}/pullrequest/${pullRequestId}`.

**Fix:**
Update fallback to include project and repository:
```typescript
const prUrl =
  pr.url ||
  (pr as any)._links?.web?.href ||
  `${env.ADO_ORG_URL}/${env.ADO_PROJECT}/_git/${env.ADO_REPOSITORY_ID}/pullrequest/${pullRequestId}`;
```

### IN-02: DORA Trend Delta Returns `'improving'` When Deltas Are Zero

**File:** `src/learn/retro.ts:70`
**Issue:**
In `calculateDoraTrendDeltas`:
```typescript
trend: leadTimeDeltaMinutes <= 0 && reworkDelta <= 0 ? 'improving' : 'regressing',
```
When historical tickets exist and both `leadTimeDeltaMinutes === 0` and `reworkDelta === 0`, `trend` evaluates to `'improving'` rather than `'stable'`, even though `'stable'` is part of the `DoraTrendDeltas.trend` type union.

**Fix:**
Check for zero delta equality:
```typescript
trend:
  leadTimeDeltaMinutes === 0 && reworkDelta === 0
    ? 'stable'
    : leadTimeDeltaMinutes <= 0 && reworkDelta <= 0
      ? 'improving'
      : 'regressing',
```

### IN-03: `find` Returns First Deployed Record Instead of Latest

**File:** `src/learn/retro.ts:26, 53`
**Issue:**
`currentTicket.deploymentRecords?.find((d) => d.status === 'deployed')` and `t.deploymentRecords.find((d) => d.status === 'deployed')` return the first deployed record. If a ticket had multiple deployments or reruns, this selects the oldest deployment rather than the most recent one.

**Fix:**
Use `findLast` (available in Node 24):
```typescript
const lastDeploy = currentTicket.deploymentRecords?.findLast((d) => d.status === 'deployed');
```

### IN-04: Empty Title in Runbook Summary

**File:** `src/learn/runbook.ts:67`
**Issue:**
If `lifecycle.title` is empty, `cleanTitle` is `""`, resulting in `summary: "Operational runbook procedures for "`.

**Fix:**
Provide fallback:
```typescript
summary: `Operational runbook procedures for ${cleanTitle || `AB#${lifecycle.workItemId}`}`,
```

---

_Reviewed: 2026-09-18T08:15:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_

## CODE REVIEW COMPLETE
