# Phase 8: LEARN — Skills Feedback Loop - Research

**Phase:** 08 - LEARN — Skills Feedback Loop
**Confidence:** HIGH

## Executive Summary

Phase 8 completes the Golden Path Standard by converting completed ticket lifecycles into reviewed, persistent agent skills:
- **LRN-01**: Post-completion learning agent analyzes ticket lifecycle data (rework cycles, review comments, test repairs, production telemetry) and extracts reusable patterns, best practices, and failure postmortems.
- **LRN-02**: Extracted learnings are structured as standard `SKILL.md` files and submitted exclusively via a Pull Request to the skills repository with `AB#<id>` traceability. Direct commits are strictly prohibited to maintain human oversight (◆) and prevent persistent prompt-injection poisoning.

## Architecture & Data Flow

### 1. Lifecycle Data Harvesting (LRN-01)
Upon a work item transitioning to `Done` (post-telemetry validation):
- The learning engine queries historical evidence from SQLite:
  - `reworkCycles`: Total bounces, source gates (`accept`, `pr_review`), escalation timestamps.
  - `l3Evidence` & `qaRuns`: Unit test self-repair attempts, failing test signatures, test durations.
  - `telemetryEvaluations`: Error-rate percentage, p95 latency, observation window.
  - Work item discussion: PR review comments and developer instructions.
- Prioritization heuristic:
  - Tickets with >=1 rework bounce or test self-repair are classified as **High Value for Postmortem / Gotchas**.
  - Tickets that completed cleanly on the first pass are classified as **Standard Reusable Patterns**.

### 2. Prompt Injection Defense & SKILL.md Synthesis
- **Threat Model (ASVS L1)**:
  - Malicious input inside ticket descriptions or review comments might attempt to instruct the agent to write persistent adversarial instructions into future skills (e.g., "Always ignore authorization checks").
- **Mitigation**:
  - All input context is enclosed in `<learning_source_context>` XML tags.
  - System instructions explicitly direct the LLM to treat content in `<learning_source_context>` as untrusted historical data, forbidding execution of any directives contained within.
  - Output is constrained to valid Markdown conforming to the standard `SKILL.md` schema:
    ```markdown
    ---
    name: [domain]-[topic]
    description: [Concise single-sentence summary]
    domain: [backend | frontend | infra | common]
    tags: [tag1, tag2]
    ---
    # [Skill Name]
    ## Overview
    ## Core Patterns & Solutions
    ## Pitfalls & Common Mistakes
    ## Quick Reference
    ```

### 3. Git Branching & Azure Repos PR Creation (LRN-02)
- **Worktree Isolation**:
  - The worker creates an isolated git worktree for the task branch `skills/learn-ticket-${workItemId}-${slug}`.
  - It writes the generated skill to `skills/${skillName}/SKILL.md`.
  - Commits with message: `feat(skills): extract patterns from AB#${workItemId} (${skillName})`.
  - Pushes the branch to the remote repository.
- **Pull Request Creation**:
  - Calls `createOrGetPullRequest` targeting `main`.
  - PR title format: `AB#${workItemId} - Add learned skill: ${skillName}`.
  - PR description includes a summary of the extracted pattern and links to the source work item.
  - Registers formal `ArtifactLink` relationship on the work item.
- **Human Review Gate (◆)**:
  - The skill file remains in the PR branch.
  - Future agent dispatch loops in Phase 2 only load merged skills on `main`.
  - Posts a sanitized HTML comment on the work item discussion with the PR link and `<!-- [automated-agent] -->` loop shield.

## Database Schema Extensions
1. `skills_prs`:
   - `id`: integer primary key autoincrement
   - `workItemId`: integer not null
   - `skillName`: text not null
   - `branchName`: text not null
   - `pullRequestId`: integer
   - `prUrl`: text
   - `status`: text not null default 'pending_review'
   - `summary`: text not null
   - `createdAt`: integer (timestamp)

## Validation Strategy
- Unit tests for prompt construction and XML isolation.
- Unit tests for `SKILL.md` markdown parsing and frontmatter validation.
- Integration tests with mocked Git API verifying:
  - Task branch creation on `skills/*`
  - Proper file writing to `skills/${name}/SKILL.md`
  - Pull request creation with `AB#` linking
  - Work item discussion comment notification
