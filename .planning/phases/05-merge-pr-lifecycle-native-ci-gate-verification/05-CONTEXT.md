# Phase 5: MERGE — PR Lifecycle & Native CI Gate Verification - Context

**Gathered:** 2026-09-09
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous batch tables accepted)

<domain>
## Phase Boundary

Azure Repos Pull Request creation linked via `AB#<id>`, verification of native ADO branch policy evaluations (build validation L3, code quality L2, security L4), human code review verdict detection (approval vs rejection), PR thread comment extraction for cumulative rework (sharing the max-2 breaker with Accept), and transition of merged tickets to `Ready for QA`.

</domain>

<decisions>
## Implementation Decisions

### Pull Request Creation & Work Item Linking
- PR creation: created upon entering `Dev Done` via Azure DevOps Git API from `task/ticket-{id}-{slug}` targeting `main`.
- Work item linking: PR description includes `AB#<id>` in header and registers `ArtifactLink` relationship on the work item.
- Description contents: structured Markdown containing L1 criteria checklist, L3 local test execution summary, diff stat (<250 LOC), and bot loop shield tag.
- Rework updates: when rework commits are generated, git push updates existing task branch — ADO PR updates in-place automatically without opening a new PR.

### Native CI Branch Policy Gates (L2/L3/L4)
- Policy evaluation reader: query Azure DevOps Policy Evaluations API (`getPolicyEvaluations`) for target pull request.
- Required policies: verify `Build` (L3 functional re-run), `Reviewers` (L2 code quality), and `Status` checks (L4 security / SAST) are `approved` / `succeeded`.
- Gate enforcement: system READS status only — does NOT re-implement CI orchestration. If policies are pending or broken, merge action is blocked and feedback posted.
- Helper integration: use `ado-connector` (or `azure-devops-node-api`) to query build run status and artifact metadata.

### PR Review Verdict & Rework Loop (MRG-04)
- Rejection trigger: reviewer votes `waitingForAuthor` or `rejected`, or adds PR review comments and moves card back to `In Dev`.
- Comment extraction: query ADO Git PR Threads API (`getThreads`), filter for active non-bot comment threads on file diffs (file path, line number, review comment).
- Rework prompt envelope: inject original ticket AC + cumulative git diff (`origin/main...HEAD`) + file-specific inline review comments.
- Shared circuit breaker: PR review rejections increment the shared SQLite `rework_cycles` table (capped at combined 2 bounces across Accept and PR Review). On 3rd bounce, escalate to `Blocked` with tag `[rework-escalated]`.

### PR Completion & Transition to "Ready for QA" (MRG-05)
- PR merge authority: human reviewer merges PR via ADO UI, or agent completes PR via API only after human vote is `approved` and all branch policies are green.
- Merge strategy: squash merge or rebase/fast-forward per project repository branch policy.
- State transition: upon PR merge webhook (`git.pullrequest.merged`), patch work item `System.State` from `Dev Done` to `Ready for QA`.
- Notification: post `[Merge Summary]` comment in work item discussion containing merge commit SHA, merged PR URL, and CI gate pass confirmation.

### Claude's Discretion
- Exact method signatures for ADO Git PR client helpers (`createPullRequest`, `getPolicyEvaluations`, `getThreads`).
- Formatting of the PR description and `[Merge Summary]` comment.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ado/client.ts`: Azure DevOps REST API client with retry backoff.
- `src/ado/work-item.ts`: Work item patch methods and discussion comment helpers.
- `src/accept/breaker.ts`: SQLite `rework_cycles` circuit breaker manager.
- `src/accept/envelope.ts`: Cumulative rework prompt formatter with XML boundary escaping.
- `src/execute/rework-worker.ts`: Execution worker handling bounded rework cycles.

### Established Patterns
- Fastify webhook routing with HMAC verification and bot loop filtering.
- Transactional state updates in SQLite WAL mode.

### Integration Points
- Triggered when tickets enter `Dev Done` (to open PR) and when PR events occur (`git.pullrequest.created`, `git.pullrequest.updated`, `git.pullrequest.merged`).
- Hands off completed, merged work items to Phase 6 (`Ready for QA`).

</code_context>

<specifics>
## Specific Ideas
- Never auto-merge a PR unless human vote is explicitly approved and all native branch policies are verified green.
- Reuse the existing task branch and PR for rework cycles to preserve review comment history.

</specifics>

<deferred>
## Deferred Ideas
- Multi-repository cross-PR atomic merges (v2).
- Automatic cherry-picking to backport branches (v2).

</deferred>
