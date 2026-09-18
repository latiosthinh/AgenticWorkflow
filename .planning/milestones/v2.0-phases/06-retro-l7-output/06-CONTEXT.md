# Phase 6: Retro & L7 Output - Context

**Gathered:** 2026-09-18
**Status:** Ready for planning
**Mode:** Auto-accepted recommendations (autonomous execution)

<domain>
## Phase Boundary

Retro (Step 9) runs awaited before Done, fail-closed, emitting takeaways + runbook delta + skill enhancement as the real L7 record in the ticket's `StateStore` file and a single human-reviewed PR — `Done` is redefined as deployed + L6 + L7-persisted.

</domain>

<decisions>
## Implementation Decisions

### Retro Execution & Gating
- **Awaited Before Done (RETRO-01):** Remove the fire-and-forget `.catch(warn)` call in `src/deploy/worker.ts`. Sequence retro execution: `smoke` -> `telemetry` -> `await retro` -> `persist L7` -> `compileL1L7EvidenceIndex(failClosed: true)` -> `patch Done`.
- **Fail-Closed Gate (EVID-03, RETRO-03):** If retro fails or times out, retry once; if it fails again, tag `[retro-failed]` and halt transition to `Done` for human escalation. Never transition to `Done` without a real L7 record.
- **Combined Single PR (RETRO-02):** A single PR to the skills repository publishes both `SKILL.md` and `RUNBOOK.md` (or records "no change" in L7 record).
- **Prompt-Injection Defense:** Untrusted ticket text (title, description, review comments) wrapped in XML source isolation tags (`<learning_source_context>`), YAML frontmatter escaped, meta-directive overrides denied.
- **Async Human Merge:** Done criterion is agent-completable facts (PRs opened with live URLs, L7 record persisted in StateStore). Human PR merge is asynchronous and does not block the current ticket reaching `Done`.
- **Runbook Location:** In target skills PR branch under `.claude/skills/<skill-name>/RUNBOOK.md`.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/learn/harvester.ts` — collects ticket lifecycle data from StateStore.
- `src/learn/generator.ts` — generates `SKILL.md` using prompt-injection defense.
- `src/learn/publisher.ts` — stages and publishes PR to skills repo via worktree.
- `src/deploy/worker.ts` — deployment workflow and Done transition.
- `src/deploy/evidence-index.ts` — `compileL1L7EvidenceIndex` fail-closed compiler.

### Established Patterns
- Vercel AI SDK `generateObject` with Zod schema, simple-git on ephemeral worktree, ADO JSON patch with `<!-- [automated-agent] -->` shield.

### Integration Points
- `src/learn/retro.ts` (NEW): synthesize retro takeaways with action items (owner + priority + tracking ref) and DORA-aligned trend deltas.
- `src/learn/runbook.ts` (NEW): synthesize runbook diff or record "no change".
- `src/learn/publisher.ts`: extend to include `RUNBOOK.md` in the published skills PR.
- `src/learn/worker.ts`: update `processLearningFeedbackLoop` to return L7 record and persist to StateStore.
- `src/deploy/worker.ts`: re-sequence Done transition: smoke -> telemetry -> await retro -> compile L1–L7 -> Done patch.

</code_context>

<specifics>
## Specific Ideas

- Mandatory action items format: `{ action: string, owner: string, priority: 'P1'|'P2'|'P3', trackingRef: string }`.
- DORA trend deltas: rework count, lead time estimate from `createdAt` to `deployedAt`.

</specifics>

<deferred>
## Deferred Ideas

- None.

</deferred>
