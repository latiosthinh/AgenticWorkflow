---
phase: 2
slug: execute-foundation-sandbox-dynamic-mcp-plan-checkpoint
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-08
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit -x` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~6 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit -x`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | SAND-01 | T-2-01 | Worktree created in isolated .worktrees dir; tests locked to 0o444; cleanup prunes safely | integration | `npx vitest run tests/worktree.test.ts` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | SAND-02 | T-2-02, T-2-03 | Execa command strips credentials, enforces 120s timeout, truncates output at 50KB | unit | `npx vitest run tests/process-runner.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 2 | DISP-01 | T-2-04 | Tags resolve to domain MCP tools; untagged falls back to common; capped at 12 tools | unit | `npx vitest run tests/mcp-registry.test.ts` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 3 | PLAN-01 | — | Ambiguous tickets generate structured questions; posts [Plan Q&A] comment and tags [awaiting-input] | unit | `npx vitest run tests/plan-checkpoint.test.ts -t "formulation"` | ❌ W0 | ⬜ pending |
| 2-03-02 | 03 | 3 | PLAN-02 | T-2-05 | Sandbox released while waiting; comment webhook locks plan; watchdog triggers 24h ping / 72h escalation | integration | `npx vitest run tests/plan-checkpoint.test.ts -t "lifecycle"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/worktree.test.ts` — Tests for ephemeral worktree creation, lock assertion files, and stale worktree cleanup
- [ ] `tests/process-runner.test.ts` — Tests for secret scrubbing, timeout killing, and output truncation
- [ ] `tests/mcp-registry.test.ts` — Tests for tag-based tool resolution and in-memory MCP transport
- [ ] `tests/plan-checkpoint.test.ts` — Tests for plan formulation, sandbox release, and comment re-trigger resumption

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Multi-turn comment Q&A in Azure DevOps UI | PLAN-01, PLAN-02 | Requires live human reply to discussion comment in active ADO project | Post clarifying question, respond as developer in ADO Boards UI, verify plan lock |
