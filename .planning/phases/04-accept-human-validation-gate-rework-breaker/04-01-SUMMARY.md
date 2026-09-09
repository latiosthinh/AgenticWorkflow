---
phase: 04-accept-human-validation-gate-rework-breaker
plan: 01
subsystem: accept
tags:
  - acceptance-packet
  - dev-done
  - url-resolver
  - bot-shield
  - loop-prevention
  - patch-builder
dependency_graph:
  requires:
    - 03-03 (L3 evidence capture and Dev Done transition)
  provides:
    - Extended environment configuration schema with PREVIEW_URL_TEMPLATE and PR_URL_TEMPLATE (src/config/env.ts)
    - Preview and PR URL template resolvers with localhost and ADO compare fallbacks (src/accept/urls.ts)
    - Formatted HTML acceptance packet discussion comment with metrics table and bot shield (src/accept/packet.ts)
    - Dev Done transition JSON patch builder adding [awaiting-acceptance] tag (src/accept/packet.ts)
  affects:
    - 04-02 (Shared rework circuit breaker)
    - 04-03 (Human acceptance verdict detector and rework pipeline)
tech_stack:
  added: []
  patterns:
    - URL template token interpolation with encodeURIComponent and fallback strategies
    - Markdown generation compiled with marked and sanitized with sanitize-html
    - Bot echo loop shielding via <!-- [automated-agent] --> comment trailer
    - Atomic Azure DevOps JSON Patch operations updating System.State, System.Tags, and System.History
key_files:
  created:
    - src/accept/urls.ts
    - src/accept/packet.ts
    - tests/acceptance-packet.test.ts
  modified:
    - src/config/env.ts
decisions:
  - "Sanitized markdown-rendered HTML allowing details and summary tags to present collapsible verification instructions"
  - "Appended <!-- [automated-agent] --> comment shield to acceptance packet comments to prevent webhook echo recursion"
  - "Used encodeURIComponent on branch names when resolving PR URLs to prevent parameter pollution"
  - "Implemented buildDevDoneAcceptancePatch replacing System.State with 'Dev Done' and applying '[awaiting-acceptance]' tag while removing '[awaiting-input]'"
metrics:
  duration: 4m
  completed_date: "2026-09-09"
  tasks: 2
  files: 4
---

# Phase 04 Plan 01: Acceptance Packet & URL Resolvers Summary

Substantive achievement: Implemented the acceptance packet discussion formatter with test metrics, cumulative diff stat (<250 LOC ceiling verification), PR link, preview URL, and bot loop shield, alongside ADO Dev Done JSON patch building with `[awaiting-acceptance]` tagging.

## Key Changes

1. **Environment Configuration (`ACCP-01`):**
   - Extended `EnvSchema` in `src/config/env.ts` with optional `PREVIEW_URL_TEMPLATE` and `PR_URL_TEMPLATE`.

2. **URL Resolvers (`ACCP-01`):**
   - Implemented `resolvePreviewUrl` and `resolvePrUrl` in `src/accept/urls.ts`.
   - Supports `{workItemId}` and `{branchName}` token interpolation with URL encoding.
   - Provides defaults: `http://localhost:${env.PORT}/preview/${workItemId}` for previews and `${env.ADO_ORG_URL}/_git?version=GB${encodeURIComponent(branchName)}` for PR comparisons.

3. **Acceptance Packet Formatter & Patch Builder (`ACCP-01`):**
   - Defined `AcceptancePacketData` and `formatAcceptancePacketComment` in `src/accept/packet.ts`.
   - Generates structured table displaying Status, Tests (passed/total, duration), Code Changes (<250 LOC ceiling), Pull Request, and Staging Preview.
   - Includes collapsible `<details>` section for human reviewer commands (`Ready for QA` / `[approve-acceptance]`, `In Dev` / `[reject-acceptance]`, `[reset-rework]`).
   - Appends `<!-- [automated-agent] -->` loop shield to protect ingress from bot echoes.
   - Implemented `buildDevDoneAcceptancePatch` applying `System.State = 'Dev Done'`, adding tag `[awaiting-acceptance]`, and clearing `[awaiting-input]`.

4. **Unit Verification (`tests/acceptance-packet.test.ts`):**
   - Verified packet markdown compilation, HTML sanitization, and reviewer guidance presence.
   - Verified bot echo shield preservation.
   - Verified Dev Done JSON patch structure and tag manipulations.
   - Verified template interpolation and fallback behaviors for preview and PR URLs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] HTML entity escaping in unit test assertion**
- **Found during:** Task 2 verification
- **Issue:** Marked encodes `<` as `&lt;` in markdown table cell text, causing `toContain('<250 LOC ceiling verified')` to fail against rendered HTML.
- **Fix:** Updated test assertion to expect `&lt;250 LOC ceiling verified`.
- **Files modified:** `tests/acceptance-packet.test.ts`
- **Commit:** 759ce8d

## Self-Check: PASSED

- FOUND: `src/config/env.ts`
- FOUND: `src/accept/urls.ts`
- FOUND: `src/accept/packet.ts`
- FOUND: `tests/acceptance-packet.test.ts`
- FOUND commit `eb4d5e8`: feat(04-01): extend env schema and implement URL resolvers
- FOUND commit `759ce8d`: feat(04-01): implement acceptance packet formatter, Dev Done patch builder, and unit tests
