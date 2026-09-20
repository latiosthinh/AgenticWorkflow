---
phase: 10-security-evidence-hardening
reviewed: 2026-09-20T10:00:00Z
depth: deep
files_reviewed: 15
files_reviewed_list:
  - src/config/env.ts
  - src/scope/verdict.ts
  - src/accept/verdict.ts
  - src/execute/router.ts
  - src/learn/prompt.ts
  - src/ado/formatter.ts
  - src/ado/work-item.ts
  - src/scope/gate.ts
  - src/execute/worker.ts
  - src/execute/rework-worker.ts
  - src/execute/repair.ts
  - src/qa/worker.ts
  - src/deploy/evidence-index.ts
  - src/sandbox/runner.ts
  - src/state/types.ts
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: resolved
---

# Phase 10: Code Review Report

**Reviewed:** 2026-09-20T10:00:00Z
**Depth:** deep
**Files Reviewed:** 15
**Status:** resolved (all findings fixed)

## Summary

Phase 10 changes implement security and evidence hardening across the SDLC pipeline:
- **SEC-03 (Approver Allowlist)**: Strict approver gating for comment verdict tokens (`[approve-scope]`, `[reject-scope]`, `[reset-scope]`, `[approve-acceptance]`, `[reject-acceptance]`, `[reset-rework]`) with production boot validation (`APPROVER_IDS`), unauthorized comment shielding, and dedup completion without state mutation.
- **SEC-04 (Comment Sanitization & Shielding)**: 100% comment sanitization with `sanitizeHtml` and loop-shield marker (`<!-- [automated-agent] -->`) across workers and alert formatters.
- **SEC-05 (Push Honesty)**: Fail-closed handling for git push failures in production, transitioning tickets to `Blocked` with alert comments and setting dedup status to `failed`.
- **SEC-06 (XML Escaping & Sanitization)**: XML escaping in learning prompt synthesis preventing context breakout, plus HTML sanitization in PR descriptions.
- **CORE-04 (Zero Fabricated Evidence)**: Elimination of synthetic defaults (0.05% error rate, 145ms latency, 1/1 test defaults, hardcoded 'main' commit SHA). Real L3 test evidence enforced before PR creation; real commit SHA resolution in QA worker.
- **REL-09 (Known Secrets Scrubbing)**: Explicit known secrets propagation to repair loop and runner diagnostics.

Core invariants (§Done-well) remain intact: HMAC verification, wx-dedup, lane single-writer serialization (`workItemQueueManager.runInLane`), and crash-atomic StateStore writes.

One warning identified regarding 52-character regex token redaction boundaries.

## Warnings

### WR-01: `SENSITIVE_VALUE_PATTERN` Lacks Word Boundary on 52-Character Token Match

**File:** `src/sandbox/runner.ts:29`
**Issue:** `SENSITIVE_VALUE_PATTERN` uses `[a-zA-Z0-9]{52}` without word boundary delimiters (`\b`). Any alphanumeric string with 52 or more characters—such as 64-character SHA-256 hashes (common in package integrity checks, commit signatures, Docker image digests) or 128-character hashes—has its first 52 characters redacted as `[REDACTED]`, leaving trailing characters (e.g. `[REDACTED]991b7852b855`) and corrupting non-sensitive diagnostic output.
**Fix:**
Add `\b` word boundaries around `[a-zA-Z0-9]{52}` so only exact 52-character tokens (like ADO PATs) are matched:
```typescript
export const SENSITIVE_VALUE_PATTERN = /(?:ghp_[a-zA-Z0-9]{36}|Bearer\s+[a-zA-Z0-9_\-\.]+|ado-[a-zA-Z0-9]{40,}|\b[a-zA-Z0-9]{52}\b)/g;
```

## Info

### IN-01: `getKnownSecrets()` Omits `AZURE_APP_INSIGHTS_API_KEY`

**File:** `src/sandbox/runner.ts:32-36`
**Issue:** `getKnownSecrets()` includes `ADO_PAT`, `ADO_WEBHOOK_SECRET`, `API_KEY`, and `OPENAI_API_KEY`, but omits `env.AZURE_APP_INSIGHTS_API_KEY`. While `sanitizeEnv` strips keys matching `SENSITIVE_KEY_PATTERN` from child processes, including this secret in `getKnownSecrets()` provides complete defense-in-depth for diagnostic scrubbing.
**Fix:**
```typescript
export function getKnownSecrets(): string[] {
  return [
    env.ADO_PAT,
    env.ADO_WEBHOOK_SECRET,
    env.API_KEY,
    env.OPENAI_API_KEY,
    env.AZURE_APP_INSIGHTS_API_KEY,
  ].filter((s): s is string => Boolean(s));
}
```

### IN-02: `parseApproverIds` Does Not Extract Emails from Formatted Allowlist Entries

**File:** `src/config/env.ts:62-68`
**Issue:** When an operator configures `APPROVER_IDS` using format `DisplayName <email@domain.com>`, `parseApproverIds` treats the entire entry as a single string. If an incoming ADO webhook provides only `email@domain.com` without display name, `isActorAuthorized` will fail to match.
**Fix:**
Extract inner emails during `parseApproverIds`:
```typescript
export function parseApproverIds(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .flatMap((s) => {
      const emailMatch = s.match(/<([^>]+)>/);
      return emailMatch ? [s, emailMatch[1].trim().toLowerCase()] : [s];
    })
    .filter(Boolean);
}
```

---

_Reviewed: 2026-09-20T10:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
