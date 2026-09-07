# Project Research Summary

**Project:** Agentic SDLC Workflow
**Domain:** Autonomous Agentic SDLC Platform / Azure DevOps Automation
**Researched:** 2026-09-07
**Confidence:** HIGH

---

## Executive Summary

The Agentic SDLC Workflow is an asynchronous, event-driven orchestration system designed to automate software development tasks inside Azure DevOps (ADO) while keeping human engineers and QA in control via board state transitions and code review gates. In standard production deployments, autonomous agents (such as Devin, Factory AI, and OpenHands) fail when tightly coupled to synchronous webhook listeners or when allowed to operate directly on the host machine. The recommended design decouples ADO Service Hook ingestion from agent reasoning and execution loops, using ADO Boards, Work Items, and Pull Requests as the sole user interface and source of truth.

The recommended technical approach leverages Node.js 24 LTS and TypeScript 7 on the host. Fastify 5 provides high-throughput, sub-second webhook ingestion with HMAC signature verification, immediately returning HTTP 202 Accepted. State persistence, event deduplication, and task leasing are managed using an embedded SQLite database (`better-sqlite3` with `drizzle-orm`) in Write-Ahead Logging (WAL) mode paired with `p-queue` for concurrency throttling. Agent reasoning is driven by the Vercel AI SDK (`ai` v7) utilizing Claude 3.7 Sonnet for coding and GPT-4o for requirements audits. Tool integration is standardized through the Model Context Protocol (`@modelcontextprotocol/sdk` and `@ai-sdk/mcp`), enabling dynamic tag-based tool injection (`frontend`, `backend`, `infra`) to preserve LLM context windows.

The primary failure modes in this domain are catastrophic if unaddressed: infinite webhook loops triggered by bot state changes, autonomous agents "hacking" test suites by deleting assertions to pass tests, prompt injection and arbitrary code execution from malicious ticket inputs, and human review fatigue caused by bloated pull requests. These risks are neutralized through a multi-layered defense: strict distributed deduplication locks keyed on `(workItemId, revId)` with bot identity filters, read-only test file boundaries with pre-PR git diff assertions, non-root ephemeral sandboxes with network egress filtering and secret scrubbing, and hard circuit breakers enforcing a 250 LOC PR ceiling and a maximum of 2 to 3 automated rework iterations.

---

## Key Findings

### Recommended Stack

The stack is optimized for host-native execution on Node.js 24 and TypeScript 7, eliminating heavy external infrastructure (Redis, BullMQ, Temporal) in v1 in favor of embedded, zero-ops components.

**Core technologies:**
- **Node.js 24 LTS & TypeScript 7**: Primary runtime and language — native fetch, modern V8, and end-to-end type safety matching ADO REST JSON schemas and MCP tool specifications.
- **Fastify 5.12 & Zod 4.5**: Webhook ingestion and schema validation — ultra-low latency, raw body caching for HMAC verification, and strict payload filtering.
- **azure-devops-node-api 17.0**: Official Microsoft client SDK — typed operations for Work Item Tracking (WIQL, JSON Patch), Git repositories, and Pull Requests.
- **Vercel AI SDK 7.0 & @ai-sdk/mcp 2.0**: Agent reasoning engine and MCP bridge — lean multi-step tool execution loops (`stopWhen`) without LangChain abstraction bloat.
- **better-sqlite3 13.0 & Drizzle ORM 0.45**: Persistence, state machine, and job leasing — microsecond transactional reads/writes in WAL mode with zero external server dependencies.
- **p-queue 9.3**: Concurrency throttle — controls parallel test/build runs to prevent CPU starvation on the host runner.
- **simple-git 3.36 & Execa 10.0**: Git repository driver and process runner — manages ephemeral git worktrees, enforces execution timeouts, scrubs secrets, and sandboxes commands via safe argument arrays.

### Expected Features

The system relies strictly on ADO Boards for all user interactions. Custom external dashboards are rejected as anti-features.

**Must have (table stakes):**
- **ADO State Transition Listener**: Webhook and polling intake detecting board movements (`In Dev`, `Dev Done`, `Ready for QA`).
- **Ticket Context Ingestion & Parsing**: Extracts title, HTML description, structured acceptance criteria, domain tags, and comment history.
- **Workspace Sandboxing & Git Worktree Isolation**: Dedicated ephemeral git worktree per ticket run to eliminate git index locking collisions.
- **Agent Code Planning & Multi-File Generation**: Repository code exploration (grep/symbol search), planning, and multi-file editing.
- **Local Test Execution & Self-Repair**: Iterative test-execution loop feeding compiler and test failures back into the agent prompt (capped at 3-5 turns).
- **PR Creation & Work Item Linking**: Creates branch (`agent/ticket-{id}-{slug}`), pushes code, opens PR, and links ticket via `AB#{id}` syntax.
- **Review Feedback / Rework Loop**: Moving ticket back to `In Dev` with PR comments resumes the agent on the existing branch.
- **ADO Progress Comments**: Formatted diagnostic updates and execution logs posted directly to work item discussion in ADO-compliant HTML.
- **Credential & Secret Isolation**: Redacts PATs, API keys, and environment variables from all logs, comments, and PR diffs.

**Should have (differentiators):**
- **Intake Quality Audit Gate ("Ready to Dev")**: Pre-flight audit assessing ticket acceptance criteria clarity; tags ambiguous tickets and posts clarifying questions before coding begins.
- **Dynamic Skill & MCP Dispatch via Domain Tags**: Ticket tags (`frontend`, `backend`, `infra`) selectively mount only relevant MCP tools, protecting LLM context windows.
- **Deterministic Guardrails & PR Size Ceiling**: Pre-PR linting/formatting pass and hard 250 LOC PR limit to prevent developer review fatigue and rubber-stamping.
- **Execution Cost & Circuit Breakers**: Per-ticket token and dollar spend caps; hard limit on rework bounce-backs (max 2 automated cycles).

**Defer (v2+):**
- **Automated QA Verification Agent**: Let human QA validate the staging build in v1; ensure developer implementation loop is hardened first.
- **Multi-Tracker Abstractions (Jira / GitHub Issues)**: Dilutes ADO-specific strengths (service hooks, work item hierarchy, native PR links).
- **Direct Production Deployments**: Always stop at "Ready to Deploy"; hand off to enterprise CI/CD release pipelines.

### Architecture Approach

The architecture separates the high-throughput ingestion layer from background agent worker execution. Fastify receives incoming Service Hooks, verifies signatures, checks an atomic deduplication store, returns HTTP 202 Accepted within 200ms, and persists the job to SQLite. A local worker process leases pending jobs, provisions an ephemeral git worktree, mounts domain-scoped MCP servers, and initiates the Vercel AI SDK reasoning loop. The agent executes code edits, runs local test suites via Execa, repairs failures iteratively, pushes to Azure Repos, creates a linked Pull Request, and transitions the ADO work item to `Dev Done`.

**Major components:**
1. **ADO Webhook Gateway**: Ingests `workitem.updated` and `git.pullrequest` hooks; validates HMAC signatures; performs sub-second 202 acknowledgment.
2. **Idempotency & Deduplicator Engine**: SQLite transactional lease table enforcing single execution per `(workItemId, revId)` and filtering bot self-triggered events.
3. **SDLC State Machine Coordinator**: Enforces board transition rules (`New` -> `Ready to Dev` -> `In Dev` -> `Dev Done` -> `Ready for QA` -> `Ready to Deploy`) and tracks rework iteration counters.
4. **Dynamic Skill & MCP Dispatcher**: Mounts specialized MCP servers (Git, Test Runner, DB Inspector) based on work item taxonomy tags.
5. **Agent Execution Sandbox**: Isolates code modifications inside dedicated git worktrees with non-root process boundaries and sanitized environment variables.
6. **ADO REST & Git Adapter**: Wraps `azure-devops-node-api` for work item patching, HTML comment formatting, branch operations, and PR lifecycle management.

### Critical Pitfalls

1. **Webhook Recursive Loops & Duplicate Dispatch**: ADO fires events when the bot posts comments or updates state, causing uncontrolled duplicate runs.  
   *Prevention:* Enforce distributed lock on `(workItemId, revId)`, filter out events where `System.ChangedBy` matches the bot's Service Principal ID, and debounce ingress with a 5-second sliding window.
2. **Autonomous Self-Repair "Test Hacking"**: Agents delete failing assertions or add test skip flags to force an `exit 0` test result.  
   *Prevention:* Mark test files read-only during the coding phase; run automated `git diff --stat origin/main...HEAD` checks before PR creation to reject unauthorized test file modifications.
3. **Prompt Injection & Arbitrary Code Execution**: Malicious or untrusted work item descriptions/comments executing arbitrary shell commands or leaking PATs.  
   *Prevention:* Sandbox execution with unprivileged users; block outbound container egress to internal subnets and cloud metadata services (`169.254.169.254`); scrub environment variables from all tool streams.
4. **Context Window Saturation & MCP Tool Explosion**: Overloading prompt context with full file trees, unpruned compiler logs, and dozens of unused MCP tools.  
   *Prevention:* Dynamically inject only tools matching ticket domain tags; use `ripgrep` symbol search tools instead of dumping raw file trees; prune compiler stack traces to the top 15 application frames.
5. **Review Feedback Amnesia & PR Ping-Pong**: Rework loops where the agent fixes a new review comment but reverts fixes from earlier review rounds.  
   *Prevention:* Build a structured rework envelope containing original acceptance criteria, cumulative git diff, and open review comments; enforce a hard limit of 2 automated rework attempts before escalating to a human.

---

## Implications for Roadmap

Based on research dependencies, component isolation rules, and pitfall prevention, the implementation is organized into six sequential phases:

### Phase 1: ADO Ingress, Event Orchestration & Core Integration
**Rationale:** Ingestion, signature validation, API authentication, and recursive loop breakers must be rock-solid before any LLM reasoning or agent dispatch can safely occur.
**Delivers:** Fastify webhook server, HMAC secret verification, SQLite/Drizzle database setup with WAL mode, atomic `(workItemId, revId)` deduplication lock, bot identity echo filter, `azure-devops-node-api` client wrapper, and Markdown-to-ADO-HTML comment sanitizer.
**Addresses:** ADO State Transition Listener, Credential & Secret Isolation, ADO Progress Commenting.
**Avoids:** Pitfall 1 (Webhook Recursive Loops), Pitfall 9 (State Split-Brain / Zombie Tickets), Pitfall 10 (ADO REST API Throttling), Pitfall 12 (HTML/Markdown Formatting Mismatch).

### Phase 2: SDLC State Machine & Intake Requirements Auditor
**Rationale:** Implements the finite state machine and tests LLM prompt evaluation on read-only requirements validation before granting code modification privileges.
**Delivers:** Core FSM engine managing board state transitions; Requirements Auditor Agent using GPT-4o; ticket description and acceptance criteria parser; automated transition from `New` to `Ready to Dev` (or clarifying questions posted to discussion if criteria are ambiguous); domain tagging handler (`frontend`, `backend`, `infra`).
**Addresses:** Ticket Context Ingestion & Parsing, Intake Quality Audit Gate ("Ready to Dev"), Execution Cost & Circuit Breakers.
**Avoids:** Running expensive coding agents on vague or untestable tickets; context bloat from unstructured ticket data.

### Phase 3: Ephemeral Sandbox & Dynamic MCP Tool Infrastructure
**Rationale:** Sandboxing, worktree isolation, and tool infrastructure must be established and verified before writing or executing code on the runner.
**Delivers:** Ephemeral `git worktree` lifecycle manager (create, rebase, cleanup); process runner via Execa with hard execution timeouts (120s) and sanitized environment variables; Model Context Protocol server suite (Git MCP, Test Runner MCP, ADO Work Item MCP); dynamic tag-based tool dispatcher.
**Addresses:** Workspace & Repo Sandboxing, Dynamic Skill & MCP Dispatch via Domain Tags.
**Avoids:** Pitfall 3 (Prompt Injection & Arbitrary Code Execution), Pitfall 4 (MCP Tool Schema Explosion), Pitfall 5 (Git Worktree Concurrency & Index Locks).

### Phase 4: Autonomous Developer Agent & Test-Driven Self-Repair Loop
**Rationale:** The core value driver of the product; depends on the sandbox (Phase 3), the state machine (Phase 2), and the ADO client (Phase 1).
**Delivers:** Vercel AI SDK multi-step coding agent (Claude 3.7 Sonnet); codebase exploration tools; multi-file code patch generator; local test execution and error capture; iterative self-repair loop (capped at 3-5 iterations); read-only test file guardrails; automated git commit, push, PR creation, and `AB#` ticket linking; transition from `In Dev` to `Dev Done`.
**Addresses:** Agent Code Planning & Generation, Local Test Execution & Self-Repair, Pull Request & Work Item Linking.
**Avoids:** Pitfall 2 (Self-Repair Test Hacking / Assertion Erasure), Pitfall 7 (PR Review Fatigue / 250 LOC Ceiling), Pitfall 11 (Hallucinated Package Dependencies).

### Phase 5: Developer Review Gate & Iterative Rework Loop
**Rationale:** Closes the human-in-the-loop development cycle by enabling developers to review PRs in ADO and request automated changes.
**Delivers:** PR webhook event listener (`git.pullrequest.comment` and review submission); rework state handler detecting `Dev Done` -> `In Dev` transitions; structured rework context envelope (original AC + cumulative diff + open review comments); branch fetch, patch application, and push to existing PR; rework loop circuit breaker (locks after 2 automated iterations).
**Addresses:** Review Feedback / Rework Loop, Developer Code Review Gate.
**Avoids:** Pitfall 6 (Review Ping-Pong Loop & Cumulative Feedback Amnesia).

### Phase 6: QA Verification Gate & Workflow Completion
**Rationale:** Final stage of the SDLC workflow coordinating post-merge staging verification and handoff to deployment.
**Delivers:** QA state handler for `Ready for QA`; QA verification execution manager; 2-strike deterministic verification on test failures to eliminate false bounce-backs from test flakes; automated failure diagnostic commenter with scoped stack traces; transition to `Ready to Deploy`; end-to-end workflow completion audit log.
**Addresses:** Multi-Turn QA Verification Gate, Workflow Completion Gate.
**Avoids:** Pitfall 8 (Flaky Test QA Bounce-Back Hell).

---

### Phase Ordering Rationale

- **Phase 1 before Phase 2**: Ingestion and API client connectivity must exist to verify ADO webhooks and test state transitions.
- **Phase 2 before Phase 3**: The requirements auditor agent validates LLM prompts, token usage, and ADO status updates on low-risk read-only tasks before any code execution is introduced.
- **Phase 3 before Phase 4**: Writing code without ephemeral worktree sandboxing, process timeouts, and secret scrubbing risks host contamination and secret leakage.
- **Phase 4 before Phase 5**: A developer cannot review or iterate on a pull request that has not yet been generated.
- **Phase 5 before Phase 6**: Developer code review is the primary safety gate protecting code quality before staging QA validation occurs.

---

### Research Flags

**Phases needing deeper research / design during planning:**
- **Phase 3 (Ephemeral Sandbox & Dynamic MCP Tooling)**: Research Windows host container execution vs native process isolation with `execa` for local development. Determine optimal credential scrub patterns and volume mount configurations.
- **Phase 4 (Autonomous Developer Agent)**: Research multi-file diff generation formats and AST-based code editing tools to minimize syntax errors during LLM code patching.

**Phases with standard, well-documented patterns (skip `/gsd-research-phase`):**
- **Phase 1 (ADO Ingress & Deduplication)**: Standard Fastify + HMAC signature verification + SQLite transactional locking.
- **Phase 2 (SDLC State Machine Core)**: Standard finite state machine transitions and Zod schema validation.
- **Phase 5 (Review Rework Loop)**: Standard Git branch checkout, comment extraction via ADO REST API, and incremental commit push.
- **Phase 6 (QA & Completion Gate)**: Standard test runner execution and state transition logic.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | **HIGH** | Verified Node 24.0.2 and Git 2.53.0 on host. Official Microsoft SDK (`azure-devops-node-api` 17.0), Fastify 5.12, Vercel AI SDK 7.0, and Drizzle ORM 0.45 verified on npm registry. |
| **Features** | **HIGH** | Mapped directly to standard ADO Boards/Repos entities (`AB#` linking, Service Hooks, Pull Request APIs) and battle-tested autonomous SDLC patterns (Devin, Factory AI). |
| **Architecture** | **HIGH** | Asynchronous decoupled webhook ingestion with transactional SQLite leasing, ephemeral git worktrees, and tag-scoped MCP toolsets. |
| **Pitfalls** | **HIGH** | Comprehensive coverage of real-world agent failure modes: recursive webhook loops, test hacking, prompt injection/RCE, context window bloat, and review ping-pong. |

**Overall confidence:** HIGH

### Gaps to Address

- **Local Webhook Ingestion during Development**: Local instances require a secure tunnel (`cloudflared` or `ngrok`) or a polling fallback listener to receive Azure DevOps Service Hook deliveries through corporate firewalls.
- **Host vs Container Sandbox Tradeoff**: In local single-dev setups on Windows, Docker execution may introduce volume mount latency; `execa` with a restricted working directory, process timeout, and sanitized `env` will be the default local runner, while Docker is reserved for cloud/production deployments.

---

## Sources

### Primary (HIGH confidence)
- **Microsoft Azure DevOps Client for Node.js (`azure-devops-node-api`)**: Context7 `/microsoft/azure-devops-node-api` and [microsoft/azure-devops-node-api GitHub](https://github.com/microsoft/azure-devops-node-api)
- **Azure DevOps Services REST API Reference (v7.1 / v7.2-preview)**: [learn.microsoft.com/en-us/rest/api/azure/devops](https://learn.microsoft.com/en-us/rest/api/azure/devops)
- **Model Context Protocol (MCP) Specification**: Anthropic MCP Specification & `@modelcontextprotocol/sdk` npm package
- **Vercel AI SDK Core & MCP Integration**: `@ai-sdk/mcp` and [ai-sdk.dev/docs/ai-sdk-core/mcp-tools](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)
- **Fastify Web Framework**: [fastify.dev](https://fastify.dev)
- **Drizzle ORM & SQLite**: [orm.drizzle.team](https://orm.drizzle.team)

### Secondary (MEDIUM confidence)
- **Autonomous Coding Agent Post-Mortems & SWE-bench Analysis**: Industry patterns for test-driven repair loops and context window compaction.
- **Docker / OCI Security Guidelines**: Container sandboxing, non-root execution, and network egress filtering for untrusted runners.

---
*Research completed: 2026-09-07*  
*Ready for roadmap: yes*
