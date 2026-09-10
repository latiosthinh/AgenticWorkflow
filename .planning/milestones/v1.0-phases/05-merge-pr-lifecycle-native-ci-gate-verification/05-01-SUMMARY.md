---
phase: 05-merge-pr-lifecycle-native-ci-gate-verification
plan: 01
subsystem: merge
tags:
  - ado-git
  - pull-request
  - artifact-link
  - formatters
  - branch-policies
dependency_graph:
  requires:
    - 04-03 (Acceptance gate, rework breaker, worktree manager)
  provides:
    - AdoClient GitApi and PolicyApi accessors (src/ado/client.ts)
    - PR description and merge summary formatters (src/ado/formatter.ts)
    - Pull request lifecycle and work item ArtifactLink registration (src/ado/git.ts)
    - PR lifecycle test suite (tests/pr-lifecycle.test.ts)
  affects:
    - 05-02 (Native CI branch policy verification and two-key merge gate)
    - 05-03 (PR review rejection rework loop and Ready for QA transition)
tech_stack:
  added: []
  patterns:
    - Azure DevOps GitApi and PolicyApi singleton client with exponential backoff retry
    - Structured PR description Markdown with AB#<id> header, L1 checklist, L3 local pre-PR evidence, diff stats, and loop shield
    - Sanitized HTML merge summary comment with commit SHA, policy badges, and loop shield
    - Active PR check before createPullRequest preventing duplicate PR creation
    - Native ADO ArtifactLink JSON patch relation registration (vstfs:///Git/PullRequestId/...)
key_files:
  created:
    - src/ado/git.ts
    - tests/pr-lifecycle.test.ts
  modified:
    - src/ado/client.ts
    - src/ado/formatter.ts
    - tests/ado-client.test.ts
decisions:
  - "Exposed GitApi and PolicyApi accessors on AdoClient with mock injection setters for isolated testing"
  - "Normalized source and target branch ref names with refs/heads/ prefix in createOrGetPullRequest to ensure Azure Repos API compatibility"
  - "Prevented duplicate PR creation by querying existing active PRs (status=1) for the branch before calling createPullRequest"
  - "Registered formal ArtifactLink relation on ADO work items using vstfs:///Git/PullRequestId/{projectId}/{repositoryId}/{pullRequestId} URI"
  - "Enforced HTML sanitization on merge summary comments disallowing script, iframe, and unsafe schemes with loop shield marker"
metrics:
  duration: 5m
  completed_date: "2026-09-09"
  tasks: 2
  files: 5
---

# Phase 05 Plan 01: PR Creation, Evidence Description Formatting, ArtifactLink & ADO Git Client Foundation Summary

Substantive achievement: Extended `AdoClient` with `GitApi` and `PolicyApi` accessors wrapped in exponential backoff retry; implemented markdown and sanitized HTML formatters for pull request descriptions and merge summaries; implemented `createOrGetPullRequest` with branch ref normalization, duplicate PR avoidance, and native `ArtifactLink` work item relation registration.

## Key Changes

1. **AdoClient GitApi and PolicyApi Foundation (`MRG-01`, `src/ado/client.ts`):**
   - Added `getGitApi()` and `getPolicyApi()` methods to `AdoClient` accessing underlying `azdev.WebApi` connection.
   - Added `setGitApi()` and `setPolicyApi()` mock injection methods to enable deterministic unit/integration testing without network credentials.
   - Preserved exponential backoff retry pattern handling HTTP 429 rate limits, 5xx server errors, and network disconnects.

2. **PR Description & Merge Summary Formatters (`MRG-01`, `src/ado/formatter.ts`):**
   - Implemented `formatPrDescription(options)` producing structured markdown:
     - Header with `AB#<workItemId> - <title>` linking to Azure Boards.
     - L1 requirements checklist verifying `<250 LOC` ceiling, test assertion file protection, and acceptance criteria.
     - L3 local pre-PR functional evidence with suite name, passed/total tests, and duration.
     - Bot loop shield `<!-- [automated-agent] -->`.
   - Implemented `formatMergeSummaryComment(options)` producing sanitized HTML:
     - Merge commit SHA substring (`.substring(0, 8)`).
     - Pull request link and target branch confirmation.
     - L2 (reviewers), L3 (build), and L4 (security/SAST) gate statuses.
     - Sanitized via `sanitizeHtml` allowing only `h3`, `p`, `ul`, `li`, `strong`, `code`, `a` tags and safe protocols.
     - Appends `<!-- [automated-agent] -->` shield.

3. **Pull Request Lifecycle & ArtifactLink Registration (`MRG-01`, `src/ado/git.ts`):**
   - Implemented `getPullRequest(repositoryId, pullRequestId, projectId)` with retry.
   - Implemented `createOrGetPullRequest(params)`:
     - Normalizes `sourceRefName` and `targetRefName` with `refs/heads/`.
     - Queries existing active pull requests (`status: 1`) to prevent duplicate PR spam when branches are updated.
     - Creates pull request via `gitApi.createPullRequest` with `AB#` title and formatted description.
     - Constructs artifact URI `vstfs:///Git/PullRequestId/${projectId}/${repositoryId}/${pullRequestId}`.
     - Patches target work item via `adoClient.updateWorkItem` adding `ArtifactLink` relationship under `/relations/-`.

4. **Testing Suite (`tests/pr-lifecycle.test.ts`, `tests/ado-client.test.ts`):**
   - Added tests in `tests/ado-client.test.ts` for `getGitApi`, `getPolicyApi`, `formatPrDescription`, and `formatMergeSummaryComment`.
   - Built comprehensive test suite in `tests/pr-lifecycle.test.ts`:
     - Verified markdown description formatting and multiline blockquote rendering.
     - Verified sanitized HTML merge summary comments with policy status.
     - Verified duplicate PR reuse when active PR exists for the branch.
     - Verified new PR creation with `AB#` title and work item `ArtifactLink` JSON patch.
     - Verified branch name normalization with and without `refs/heads/` prefixes.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Mitigation Verification

- **T-05-01 (Tampering):** Sanitized all HTML comments via `sanitize-html` strictly allowing safe tags (`h3`, `p`, `ul`, `li`, `strong`, `code`, `a`), disallowing `<script>`, `<iframe>`, and stripping unsafe `javascript:` schemes.
- **T-05-02 (Spoofing):** Required explicit `workItemId` parameter and prefixed PR title with `AB#<id>` for native Azure Boards link binding.
- **T-05-03 (Denial of Service):** Checked for active PRs (`status: 1`) on source and target refs before calling `createPullRequest`, preventing duplicate PR spam on branch updates.
- **T-05-04 (Elevation of Privilege):** Wrapped all GitApi calls in `withRetry` handling HTTP 429 and rate-limiting headers.

## Self-Check: PASSED

- FOUND: `src/ado/client.ts`
- FOUND: `src/ado/formatter.ts`
- FOUND: `src/ado/git.ts`
- FOUND: `tests/pr-lifecycle.test.ts`
- FOUND: `tests/ado-client.test.ts`
- FOUND commit `a84814f`: feat(05-01): extend AdoClient with GitApi/PolicyApi and add PR/merge formatters
- FOUND commit `4f9f8aa`: feat(05-01): implement PR creation and ArtifactLink work item registration in src/ado/git.ts
