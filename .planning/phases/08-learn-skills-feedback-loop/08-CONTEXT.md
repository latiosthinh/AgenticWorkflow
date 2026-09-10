# Phase 8: LEARN — Skills Feedback Loop - Context

**Gathered:** 2026-09-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert completed lifecycles into reviewed, persistent agent skills across two requirements:
- LRN-01: Post-completion learning agent analyzes ticket lifecycle (rework cycles, review comments, test fixes, telemetry) and extracts reusable patterns and failure postmortems.
- LRN-02: Learnings are submitted as a Pull Request to the skills repository — never direct-committed; human merges before skills affect future runs.

</domain>

<decisions>
## Implementation Decisions

### Lifecycle Extraction & Pattern Mining (LRN-01)
- Learning agent invoked immediately following successful `Done` state transition (after L6 telemetry confirms zero regressions)
- Comprehensive lifecycle analysis covers: rework cycles count & review feedback, PR review comments, self-repair test iterations, and production telemetry metrics
- Extracted lesson format: structured technical pattern markdown (code patterns, architectural gotchas, test fixtures) or failure postmortem
- Prioritization heuristic: high priority to tickets that encountered rework bounces or test self-repair; standard template for clean first-pass tickets

### Skills Format & Prompt-Injection Defense (LRN-01/02)
- Standard GSD `SKILL.md` format with frontmatter (`name`, `description`, `domain`, `tags`) and sections for Overview, Patterns, Pitfalls, and Quick Reference
- Prompt-injection defense: all untrusted ticket descriptions, review comments, and failure traces isolated in `<learning_source_context>` XML tags with explicit meta-instruction override denial instructions
- Ephemeral worktree isolation on dedicated branch `skills/learn-ticket-${id}-${slug}`
- Normalized skill naming `${domain}-${topic}` with collision checking against existing skills in repo

### Skills Repository PR Lifecycle & Merge Governance (LRN-02)
- Automated Azure Repos / GitHub Pull Request created targeting skills repository `main` branch with `AB#<id>` link in title and PR description
- Strict non-negotiable human governance: learning PR is NEVER direct-committed; human review and merge (◆) mandatory before skills affect future runs
- Work item notification: sanitized HTML comment posted to ADO work item with PR URL, skill summary, and loop shield `<!-- [automated-agent] -->`
- Persistence: SQLite table `skills_prs` tracking workItemId, skillName, branchName, pullRequestId, prUrl, and status

### Claude's Discretion
None — all three grey areas reviewed and accepted.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ado/git.ts`: `createOrGetPullRequest` for opening PRs in Azure Repos
- `src/ado/work-item.ts`: `getWorkItemDetails`, `updateWorkItem` for ADO interactions
- `src/ado/formatter.ts`: HTML sanitization and loop shield `<!-- [automated-agent] -->`
- `src/sandbox/worktree.ts`: `createWorktree`, `cleanupWorktree` for ephemeral git workspace
- `src/db/schema.ts` & `src/db/index.ts`: SQLite schema and queries

### Established Patterns
- Prompt isolation pattern using `<learning_source_context>` (established in `src/auditor/prompt.ts`)
- Fastify/router pipeline chaining: `Done` state transition triggers learning agent invocation

### Integration Points
- `src/deploy/worker.ts`: invoke learning pipeline upon successful `Done` transition
- Azure Repos Git API: create skills task branch, push `SKILL.md`, and open PR

</code_context>

<specifics>
## Specific Ideas
- Prompt injection protection prevents untrusted tickets or malicious review comments from embedding jailbreak directives into persistent agent memory.
- Human-in-the-loop PR review ensures high-signal, well-curated skills repository without automated pollution.

</specifics>

<deferred>
## Deferred Ideas
None — discussion stayed within phase scope.

</deferred>
