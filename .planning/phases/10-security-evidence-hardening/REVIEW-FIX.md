---
phase: 10-security-evidence-hardening
fixed_at: 2026-09-20T10:15:00Z
review_path: .planning/phases/10-security-evidence-hardening/REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 10: Code Review Fix Report

**Fixed at:** 2026-09-20T10:15:00Z
**Source review:** .planning/phases/10-security-evidence-hardening/REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (1 Warning, 2 Info)
- Fixed: 3
- Skipped: 0
- Verification: Full test suite clean (585/585 tests across 59 files)

## Fixed Issues

### WR-01: SENSITIVE_VALUE_PATTERN Lacks Word Boundary on 52-Character Token Match

**Files modified:** `src/sandbox/runner.ts`, `tests/repair-secrets.test.ts`
**Commit:** `7954ba2`
**Applied fix:** Added `\b` word boundaries around `[a-zA-Z0-9]{52}` in `SENSITIVE_VALUE_PATTERN` (`/(?:ghp_[a-zA-Z0-9]{36}|Bearer\s+[a-zA-Z0-9_\-\.]+|ado-[a-zA-Z0-9]{40,}|\b[a-zA-Z0-9]{52}\b)/g`) so only exact 52-character tokens (like ADO PATs) are matched without corrupting longer hashes such as 64-character SHA-256 digests. Added test in `tests/repair-secrets.test.ts`.

### IN-01: getKnownSecrets() Omits AZURE_APP_INSIGHTS_API_KEY

**Files modified:** `src/sandbox/runner.ts`, `tests/repair-secrets.test.ts`
**Commit:** `d50e67e`
**Applied fix:** Added `env.AZURE_APP_INSIGHTS_API_KEY` to `getKnownSecrets()` in `src/sandbox/runner.ts` providing defense-in-depth scrubbing for application telemetry secrets. Added test assertions in `tests/repair-secrets.test.ts`.

### IN-02: parseApproverIds Does Not Extract Emails from Formatted Allowlist Entries

**Files modified:** `src/config/env.ts`, `tests/approver-allowlist.test.ts`
**Commit:** `b86a685`
**Applied fix:** Updated `parseApproverIds` in `src/config/env.ts` to extract inner email addresses from `DisplayName <email@domain.com>` allowlist entries using regex matching. Added tests in `tests/approver-allowlist.test.ts` and updated unauthorized verdict assertions to verify the exact formatted warning comment.

## Additional Hardening Addressed

### Router MissingEvidenceError Explicit Routing & Scope Gate Feedback Bracket Escaping

**Files modified:** `src/execute/router.ts`, `src/scope/gate.ts`, `tests/escape-sanitization.test.ts`
**Commit:** `9a1ccc8`
**Applied fix:**
- In `src/execute/router.ts`, added explicit catch/routing for `MissingEvidenceError` so missing evidence on Step 4 logs a clean warning and sets dedup status to `failed` without generic error ambiguity.
- In `src/scope/gate.ts`, added `disallowedTagsMode: 'escape'` to `handleScopeRejection` feedback sanitization, ensuring unallowed brackets `<` and `>` in feedback text are escaped rather than stripped. Added test in `tests/escape-sanitization.test.ts`.

---

_Fixed: 2026-09-20T10:15:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
