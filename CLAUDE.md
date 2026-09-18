<!-- GSD:project-start source:PROJECT.md -->
## Project

**Agentic SDLC Workflow**

An autonomous, human-in-the-loop software development lifecycle (SDLC) automation system integrated with Azure DevOps (ADO). It monitors ADO boards, audits ticket requirements into "Ready to Dev", triggers specialized local or cloud AI agents upon moving tickets to "In Dev" (coding, unit testing, PR creation, moving to "Dev Done"), supports developer review and iterative rework loops, and coordinates QA verification until tickets reach "Ready to Deploy".

**Core Value:** End-to-end automated ticket lifecycle where AI agents autonomously write and test code within iterative loops while developers and QA maintain control via ADO state transitions and review gates.

### Constraints

- **Tech Stack**: TypeScript/Node.js or Python orchestration layer compatible with Azure DevOps REST API and MCP standard.
- **Security**: Secure storage and handling of ADO PATs, git repository credentials, and LLM API keys; isolated execution environment for untrusted agent code runs.
- **Latency & Reliability**: Webhook or polling listener must handle ADO rate limits and prevent duplicate agent dispatches.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Runtime & Ingestion Layer
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Node.js** | `24.x LTS` | Runtime environment | Host native runtime (`v24.0.2` verified). Native fetch, Web Streams, modern V8, ESM first. Python not installed on host. | HIGH |
| **TypeScript** | `7.0.x` | Primary language | End-to-end type safety across ADO JSON payloads, MCP tool schemas, and FSM states. Avoid runtime type mismatches. | HIGH |
| **Fastify** | `5.12.x` | Webhook & API server | Ingests ADO Service Hooks. High throughput, low latency. Native schema validation via JSON Schema, fast raw body parsing for HMAC webhook verification. | HIGH |
| **azure-devops-node-api** | `17.0.x` | ADO REST SDK | Official Microsoft client library. Typed APIs for Work Item Tracking (WIQL, JSON Patch), Git Repositories, and Pull Requests. | HIGH |
| **Zod** | `4.5.x` | Runtime validation | Strict validation for incoming ADO webhooks, agent tool inputs/outputs, and environment config. Type inference matches TypeScript types. | HIGH |
| **Pino** | `10.3.x` | Structured logger | Ultra-fast JSON logging. Low CPU overhead during heavy agent streaming loops. Easy log redaction for credentials and tokens. | HIGH |
### LLM Orchestration & Agent Runtime
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Vercel AI SDK (`ai`)** | `7.0.x` | Agent loop & reasoning engine | Functional, lean, native multi-step tool execution (`stopWhen: isStepCount(N)`). First-class streaming, zero monkey-patching. | HIGH |
| **@ai-sdk/mcp** | `2.0.x` | MCP tool bridge | Native Vercel AI SDK client for Model Context Protocol. Converts MCP tools from stdio/HTTP into model-callable tools seamlessly. | HIGH |
| **@modelcontextprotocol/sdk** | `1.30.x` | MCP client & server core | Official MCP specification implementation. Manages transports (stdio, SSE, HTTP), client sessions, and custom local tool servers. | HIGH |
| **@ai-sdk/anthropic** | `4.0.x` | Coding model provider | Claude 3.7 Sonnet / Claude 3.5 Sonnet. Industry standard for code generation, test interpretation, and autonomous bug repair. | HIGH |
| **@ai-sdk/openai** | `4.0.x` | Secondary model provider | GPT-4o / o3-mini. Cost-effective for initial ticket acceptance criteria auditing and fast classification tasks. | HIGH |
### State Machine, Database & Queue
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **StateStore (node:fs)** | `built-in` | File-backed persistence | Per-ticket markdown+frontmatter storage under `data/state/tickets/<id>.md`. Crash-atomic writes, zero C++ binaries. | HIGH |
| **p-queue / LaneManager** | `9.3.x` / custom | Per-ticket serial lanes & throttle | Serializes mutations per work item (concurrency: 1 single-writer) and limits active test runs. | HIGH |
### Workspace & Execution Isolation
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **simple-git** | `3.36.x` | Git repository driver | Clean Node.js wrapper over native Git (`git 2.53` verified). Handles branch creation, sparse worktrees, commits, and diff calculation. | HIGH |
| **Execa** | `10.0.x` | Process & test execution | Modern process runner. Built-in execution timeouts (`timeout: 120_000`), cwd sandboxing, exit code tracking, sanitized env passing, and stream capture. | HIGH |
| **Docker / Container Engine** | `27.x+` (Cloud/Prod) | Untrusted runner sandbox | Sandboxes arbitrary agent bash runs (`npm test`, build commands). Dropped capabilities, read-only rootfs, egress filtering. | MEDIUM |
### Developer Tooling & Testing
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Vitest** | `5.0.x` | Unit & integration tests | Blazing fast ESM-native test runner. In-process execution, compatible with TypeScript 7, low configuration overhead. | HIGH |
| **tsx** | `4.23.x` | TypeScript executor | Runs TypeScript files directly without separate compile step during local development. | HIGH |
| **dotenv** | `17.4.x` | Environment management | Loads local `.env` variables for ADO PAT, API keys, and port bindings. | HIGH |
## Architecture Alignment
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| **Language / Runtime** | **Node.js 24 + TypeScript 7** | Python 3.12 (FastAPI / LangGraph) | Python not installed on target environment. Node v24 natively available. TypeScript guarantees shared type definitions with ADO REST schema and official TypeScript MCP SDK. Python agent frameworks suffer frequent breaking changes and heavy dependency bloat. |
| **Webhook Framework** | **Fastify 5** | Express.js 5 | Express is legacy, lacks native typed route schemas, slower JSON serialization, and has messy async middleware error handling. |
| **Webhook Framework** | **Fastify 5** | Hono 4 | Hono is optimized for serverless/edge environments. Fastify provides a richer Node.js enterprise plugin ecosystem (`@fastify/sensible`, raw body caching for HMAC). |
| **Agent / LLM Framework** | **Vercel AI SDK (`ai` 7)** | LangChain / LangGraph | LangChain has massive dependency trees, brittle abstractions, rapid API deprecations, and high token overhead. Vercel AI SDK provides direct, minimal tool execution loops and official MCP integration (`@ai-sdk/mcp`). |
| **Agent / LLM Framework** | **Vercel AI SDK (`ai` 7)** | CrewAI / AutoGen | Opinionated multi-agent frameworks add multi-turn chatter, high latency, and unpredictable looping. Single-loop state machine with targeted tool sets is far more reliable for SDLC tasks. |
| **Database & Persistence** | **File-backed StateStore** | SQLite / PostgreSQL | Zero-ops local markdown+frontmatter storage. Lane-serialized writes guarantee single-writer safety without native binary bindings or schema migrations. |
| **Queue / Task Scheduler** | **LaneManager + p-queue** | BullMQ + Redis | In-process AsyncLocalStorage lane serialization avoids external Redis dependency while enforcing strict per-ticket write atomicity. |
| **Git Automation** | **simple-git (Git CLI)** | isomorphic-git | `isomorphic-git` lacks support for Git worktrees, git-lfs, native credential helpers, and submodules. Native `git` CLI (v2.53 on host) is fast and supports full git functionality. |
| **Process Execution** | **Execa 10** | `child_process.exec` (Native) | Native `exec` buffers output in memory (crashes on large test outputs), uses unsafe shell interpolation vulnerable to command injection, and lacks robust process tree termination on timeout. `execa` handles timeouts, signal cleanup, and argument array safety. |
## What NOT to Use (Strict Anti-Patterns)
## Execution Sandboxing & Security Strategy
## Installation & Setup
# Initialize Node.js TypeScript project
# Core Webhook Server & Ingestion
# Azure DevOps Integration
# LLM Orchestration & MCP Standard
# Database, State Machine & Queue
# Git & Execution Engine
# Dev Dependencies
## Confidence Assessment
| Area | Confidence Level | Verification Source |
|------|------------------|---------------------|
| Core Runtime (Node 24 + TS 7) | **HIGH** | Verified directly on host machine (`node v24.0.2`, `git 2.53.0`). npm registry verified for TypeScript 7.0.2. |
| Ingestion & ADO SDK | **HIGH** | `azure-devops-node-api` v17.0.0 official Microsoft docs verified via Context7. Fastify v5.12.3 verified on npm. |
| LLM & MCP Integration | **HIGH** | `@modelcontextprotocol/sdk` v1.30.0 and `@ai-sdk/mcp` v2.0.45 verified. AI SDK v7.0.93 verified with native tool calling and MCP support. |
| Persistence & Queue | **HIGH** | File-backed `StateStore` (`node:fs`) and `LaneManager` (`p-queue`) verified. Single-writer lane queue eliminates external Redis overhead for v1. |
| Workspace & Runner | **HIGH** | `simple-git` v3.36.0 and `execa` v10.0.1 verified on npm. Standard production pattern for local process management. |
## Sources
- **Microsoft Azure DevOps Client for Node.js (`azure-devops-node-api`)**: Context7 `/microsoft/azure-devops-node-api` & GitHub [microsoft/azure-devops-node-api](https://github.com/microsoft/azure-devops-node-api)
- **Azure DevOps Services REST API Reference (v7.1 / v7.2-preview)**: Microsoft Learn [REST API Azure DevOps](https://learn.microsoft.com/en-us/rest/api/azure/devops)
- **Model Context Protocol (MCP) Specification & SDK**: `@modelcontextprotocol/sdk` npm package, Context7 MCP specification
- **Vercel AI SDK & MCP Client**: `@ai-sdk/mcp` & [ai-sdk.dev/docs/ai-sdk-core/mcp-tools](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)
- **Fastify Web Framework**: Fastify v5 Documentation [fastify.dev](https://fastify.dev)
- **File-backed StateStore**: `node:fs` and `node:path` built-in persistence
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
