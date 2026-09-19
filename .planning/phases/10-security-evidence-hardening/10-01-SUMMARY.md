---
phase: 10-security-evidence-hardening
plan: 01
subsystem: security
tags:
  - security
  - approver-allowlist
  - xml-escaping
  - html-sanitization
  - sec-03
  - sec-06
dependency_graph:
  requires: []
  provides:
    - approver-allowlist-authorization
    - learning-prompt-xml-containment
    - pr-and-scope-html-sanitization
  affects:
    - src/config/env.ts
    - src/scope/verdict.ts
    - src/accept/verdict.ts
    - src/execute/router.ts
    - src/learn/prompt.ts
    - src/ado/formatter.ts
    - src/scope/gate.ts
tech_stack:
  added: []
  patterns:
    - case-insensitive approver allowlist authorization
    - prompt containment via escapeXml
    - sanitizeHtml with disallowedTagsMode escape
    - loop shield guarded unauthorized warning comments
key_files:
  created:
    - tests/approver-allowlist.test.ts
    - tests/escape-sanitization.test.ts
  modified:
    - src/config/env.ts
    - src/scope/verdict.ts
    - src/accept/verdict.ts
    - src/execute/router.ts
    - src/learn/prompt.ts
    - src/ado/formatter.ts
    - src/scope/gate.ts
    - tests/env-boot-validation.test.ts
decisions:
  - "APPROVER_IDS configuration in EnvSchema is optional in dev/test but strictly validated as non-empty in production."
  - "Verdict tokens ([approve-scope], [reject-scope], [reset-scope], [approve-acceptance], [reject-acceptance], [reset-rework]) require authorized actor when allowlist is configured."
  - "Board drag-and-drop state transitions without comment tokens continue to operate normally without token allowlist restriction."
  - "Unauthorized verdict tokens log security warning, post sanitized ADO warning comment carrying <!-- [automated-agent] --> loop shield, and complete dedup without transitioning state."
  - "Learning prompt inputs (title, description, acceptanceCriteria, formattedComments, takeaways) are wrapped with escapeXml preventing </learning_source_context> breakout."
  - "formatPrDescription sanitizes title and acceptanceCriteria using sanitizeHtml; handleScopeApproval and handleScopeRejection sanitize actor and feedback before HTML insertion."
metrics:
  duration: 12 min
  completed_date: "2026-09-20"
---

# Phase 10 Plan 01: Approver Allowlist & XML/HTML Sanitization Summary

Hardened verdict gate authorization via `APPROVER_IDS` allowlist (SEC-03) and secured prompt containment and ADO HTML comments against injection and breakout attacks (SEC-06).

## Key Deliverables

### 1. Approver Allowlist for Verdict Tokens (SEC-03)
- Added `APPROVER_IDS` to `EnvSchema` in `src/config/env.ts` with production validation requiring defined, non-empty configuration.
- Added helpers `parseApproverIds` and `isActorAuthorized` handling comma-separated lists, case-insensitive comparison, email extraction, and display name matching.
- Updated `detectScopeVerdict` (`src/scope/verdict.ts`) and `detectAcceptanceVerdict` (`src/accept/verdict.ts`) to validate actors against `approverIds` for verdict tokens (`[approve-scope]`, `[reject-scope]`, `[reset-scope]`, `[approve-acceptance]`, `[reject-acceptance]`, `[reset-rework]`).
- Preserved board drag-and-drop state transitions without comment tokens (`New -> Ready to Dev`, `Dev Done -> Ready for QA`, `Dev Done -> In Dev`).
- Updated `routeWorkItemEvent` in `src/execute/router.ts` to handle unauthorized verdicts by logging `console.warn`, posting a sanitized ADO warning comment with `<!-- [automated-agent] -->`, and completing dedup without state changes.

### 2. XML Escaping & HTML Sanitization (SEC-06)
- Updated `buildSkillLearningPrompt` and `buildRetroLearningPrompt` in `src/learn/prompt.ts` to wrap all untrusted ticket text in `escapeXml`, neutralizing `</learning_source_context>` breakout payloads.
- Hardened `formatPrDescription` in `src/ado/formatter.ts` using `sanitizeHtml` on ticket `title` and `acceptanceCriteria`, stripping malicious tags and escaping unauthorized tags.
- Hardened `handleScopeApproval` and `handleScopeRejection` in `src/scope/gate.ts` to sanitize `actor` and `feedback` before injecting into HTML comments.

## Verification Results

Targeted tests:
- `tests/approver-allowlist.test.ts`: 24/24 tests passed
- `tests/escape-sanitization.test.ts`: 5/5 tests passed

Full test suite:
- `npm test`: 55 test files, 547/547 tests passed (0 failures, 0 skipped)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] sanitizeHtml stripped actor email brackets as HTML tags**
- **Found during:** Task 1 test run (`tests/approver-allowlist.test.ts`)
- **Issue:** When actor string format was `Name <email@example.com>`, default `sanitizeHtml` removed `<email@example.com>` as an unrecognized HTML tag.
- **Fix:** Used `{ allowedTags: [], disallowedTagsMode: 'escape' }` to preserve identity text while escaping any hostile HTML tags.
- **Files modified:** `src/execute/router.ts`, `src/scope/gate.ts`, `src/ado/formatter.ts`

**2. [Rule 3 - Blocker] EnvSchema production validation threw in env-boot-validation test**
- **Found during:** Task 1 implementation
- **Issue:** `tests/env-boot-validation.test.ts` verified `NODE_ENV: 'production'` without providing `APPROVER_IDS`.
- **Fix:** Provided `APPROVER_IDS` in the production boot test fixture and added an explicit test asserting `APPROVER_IDS` is required in production.
- **Files modified:** `tests/env-boot-validation.test.ts`

## Commits

- `7d564ba`: feat(10-01): approver allowlist for verdict tokens (SEC-03)
- `cfaba09`: feat(10-01): XML escaping & HTML sanitization (SEC-06)

## Self-Check: PASSED
- Artifact `src/config/env.ts` exists and contains APPROVER_IDS
- Artifact `src/scope/verdict.ts` exists and contains actor validation
- Artifact `src/accept/verdict.ts` exists and contains actor validation
- Artifact `src/learn/prompt.ts` exists and contains escapeXml
- Test file `tests/approver-allowlist.test.ts` exists
- Test file `tests/escape-sanitization.test.ts` exists
- Commit `7d564ba` verified in git log
- Commit `cfaba09` verified in git log
