# Technology Stack

**Project:** Agentic SDLC Workflow (ADO + Coding Agents + Human Gates)  
**Researched:** 2026-09-07  
**Overall Confidence:** HIGH  

---

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
| **better-sqlite3** | `13.0.x` | Embedded database | Zero-ops local persistence. Synchronous C++ binding, microsecond reads/writes, WAL mode enables non-blocking concurrent reads. | HIGH |
| **Drizzle ORM** | `0.45.x` | Relational query builder | Type-safe SQL, zero boilerplate, lightweight footprint. Generates fast SQLite migrations via `drizzle-kit`. Seamless upgrade path to Postgres if team scales. | HIGH |
| **p-queue** | `9.3.x` | Concurrency throttle | In-memory concurrency controller. Limits active parallel agent test runs (e.g. max 2-3 parallel test suites) to prevent CPU starvation. | HIGH |

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

---

## Architecture Alignment

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Fastify 5.12 Webhook Ingress                  │
│                     (Receives ADO Service Hook Events)                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Zod 4.5 Payload Validation                      │
│                  (Filters bot echoes & verifies HMAC)                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 SQLite (better-sqlite3 + Drizzle ORM)                  │
│              - Deduplication key: (workItemId, revId)                  │
│              - Ticket lifecycle state machine & audit log              │
│              - Job queue table (pending -> running -> done)            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       p-queue Concurrency Throttle                     │
│                (Controls max parallel test/build runs)                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    Vercel AI SDK (ai 7.0 + @ai-sdk/mcp)                │
│                 Model: Claude 3.7 Sonnet / OpenAI GPT-4o               │
│                                   │                                    │
│       ┌───────────────────────────┴───────────────────────────┐        │
│       ▼                                                       ▼        │
│ ┌──────────────────────────┐             ┌───────────────────────────┐ │
│ │  MCP Stdio / Tools       │             │  Execution Workspace      │ │
│ │  - Git tool (simple-git) │             │  - simple-git worktree    │ │
│ │  - Test runner (execa)   │             │  - execa process runner   │ │
│ │  - ADO API client        │             │  - Docker sandbox (Prod)  │ │
│ └──────────────────────────┘             └───────────────────────────┘ │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   azure-devops-node-api (17.0)                         │
│               - Update Work Item State (JSON Patch)                    │
│               - Post diagnostic comments / audit notes                 │
│               - Create Pull Request & link Work Item                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| **Language / Runtime** | **Node.js 24 + TypeScript 7** | Python 3.12 (FastAPI / LangGraph) | Python not installed on target environment. Node v24 natively available. TypeScript guarantees shared type definitions with ADO REST schema and official TypeScript MCP SDK. Python agent frameworks suffer frequent breaking changes and heavy dependency bloat. |
| **Webhook Framework** | **Fastify 5** | Express.js 5 | Express is legacy, lacks native typed route schemas, slower JSON serialization, and has messy async middleware error handling. |
| **Webhook Framework** | **Fastify 5** | Hono 4 | Hono is optimized for serverless/edge environments. Fastify provides a richer Node.js enterprise plugin ecosystem (`@fastify/sensible`, raw body caching for HMAC). |
| **Agent / LLM Framework** | **Vercel AI SDK (`ai` 7)** | LangChain / LangGraph | LangChain has massive dependency trees, brittle abstractions, rapid API deprecations, and high token overhead. Vercel AI SDK provides direct, minimal tool execution loops and official MCP integration (`@ai-sdk/mcp`). |
| **Agent / LLM Framework** | **Vercel AI SDK (`ai` 7)** | CrewAI / AutoGen | Opinionated multi-agent frameworks add multi-turn chatter, high latency, and unpredictable looping. Single-loop state machine with targeted tool sets is far more reliable for SDLC tasks. |
| **Database & Persistence** | **better-sqlite3 + Drizzle** | PostgreSQL + Prisma | SQLite requires zero infrastructure setup for v1 local/single-team runner. Single `orchestrator.db` file with WAL mode handles required ACID transactions and locks. Prisma adds large binary engines and slow cold starts; Drizzle is lightweight and generates clean SQL. |
| **Queue / Task Scheduler** | **SQLite table + p-queue** | Temporal | Temporal requires running a Temporal Server cluster, PostgreSQL/Cassandra, and external worker processes. Massive over-engineering for v1 single-team orchestrator. |
| **Queue / Task Scheduler** | **SQLite table + p-queue** | BullMQ + Redis | BullMQ requires running and managing an external Redis instance. A transactional SQLite job lease table (`UPDATE jobs SET status = 'running' WHERE id = ...`) plus `p-queue` achieves crash-resilience with zero external dependencies. |
| **Git Automation** | **simple-git (Git CLI)** | isomorphic-git | `isomorphic-git` lacks support for Git worktrees, git-lfs, native credential helpers, and submodules. Native `git` CLI (v2.53 on host) is fast and supports full git functionality. |
| **Process Execution** | **Execa 10** | `child_process.exec` (Native) | Native `exec` buffers output in memory (crashes on large test outputs), uses unsafe shell interpolation vulnerable to command injection, and lacks robust process tree termination on timeout. `execa` handles timeouts, signal cleanup, and argument array safety. |

---

## What NOT to Use (Strict Anti-Patterns)

1. **Do NOT use LangChain or LangGraph**:
   - Complex abstraction layers obscure LLM inputs and outputs.
   - High memory overhead and constant breaking changes between minor versions.
   - Debugging failed tool calls inside LangGraph's state graph adds friction.

2. **Do NOT use Redis + BullMQ for v1**:
   - Adds external dependency and operational maintenance for a single-team tool.
   - SQLite in WAL mode handles transactional job leases, deduplication, and state history with zero operational cost.
   - If distributed multi-node scaling is needed later, Drizzle schemas and queue interfaces can migrate cleanly to Postgres + BullMQ.

3. **Do NOT use unconstrained Shell Execution (`child_process.exec`)**:
   - Passing user-provided strings from ADO tickets directly to shell strings causes Remote Code Execution (RCE) via prompt injection.
   - Always invoke commands using argument arrays via `execa('npm', ['test', '--', 'file.test.ts'])`.

4. **Do NOT use `isomorphic-git`**:
   - Incomplete Git implementation. Breaks on large code repositories, struggles with merge conflicts, and lacks git worktree support. Use `simple-git` wrapping native `git`.

5. **Do NOT run long-running agent loops directly inside the Webhook Handler**:
   - ADO Service Hooks time out after 20-30 seconds.
   - Agent execution (cloning, planning, writing code, running tests) takes 2-8 minutes.
   - Always acknowledge webhooks immediately with `202 Accepted`, persist the job to SQLite, and execute in the background worker queue.

---

## Execution Sandboxing & Security Strategy

CRITICAL SECURITY WARNING:
Autonomous coding agents execute arbitrary code generated by LLMs or influenced by untrusted ADO work items. Without isolation, untrusted code can read orchestrator environment variables (ADO PATs, LLM API keys), tamper with host files, or access internal network services.

Multi-step sandboxing requirements:
1. **Local Development Mode**:
   - Run tests using `execa` with a restricted working directory (`cwd: sandboxPath`).
   - Hard execution timeout (`timeout: 120_000` ms) to prevent infinite loops.
   - Explicitly scrub sensitive environment variables (`ADO_PAT`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) from the child process `env`.
   - Prevent test code file tampering: Mark test files as read-only or verify via `git diff --name-only` that no test assertions were modified unless explicitly tagged.
2. **Production / Cloud Deployment Mode**:
   - Run agent implementation and test loops inside ephemeral Docker containers.
   - Non-root user inside container (`USER node` or `USER 1000`).
   - Read-only root filesystem with a mounted ephemeral volume for the checked-out workspace.
   - Drop all Linux capabilities (`--cap-drop=ALL`).
   - Block cloud metadata endpoint (`169.254.169.254`) and internal VPC ranges via network egress filtering.

---

## Installation & Setup

```bash
# Initialize Node.js TypeScript project
npm init -y

# Core Webhook Server & Ingestion
npm install fastify@^5.12.0 @fastify/sensible@^6.0.0 zod@^4.5.0 pino@^10.3.0

# Azure DevOps Integration
npm install azure-devops-node-api@^17.0.0

# LLM Orchestration & MCP Standard
npm install ai@^7.0.0 @ai-sdk/mcp@^2.0.0 @modelcontextprotocol/sdk@^1.30.0 @ai-sdk/anthropic@^4.0.0 @ai-sdk/openai@^4.0.0

# Database, State Machine & Queue
npm install better-sqlite3@^13.0.0 drizzle-orm@^0.45.0 p-queue@^9.3.0 dotenv@^17.4.0

# Git & Execution Engine
npm install simple-git@^3.36.0 execa@^10.0.0

# Dev Dependencies
npm install -D typescript@^7.0.0 @types/node@^24.0.0 @types/better-sqlite3@^7.6.0 drizzle-kit@^0.31.0 vitest@^5.0.0 tsx@^4.23.0 pino-pretty@^13.1.0
```

---

## Confidence Assessment

| Area | Confidence Level | Verification Source |
|------|------------------|---------------------|
| Core Runtime (Node 24 + TS 7) | **HIGH** | Verified directly on host machine (`node v24.0.2`, `git 2.53.0`). npm registry verified for TypeScript 7.0.2. |
| Ingestion & ADO SDK | **HIGH** | `azure-devops-node-api` v17.0.0 official Microsoft docs verified via Context7. Fastify v5.12.3 verified on npm. |
| LLM & MCP Integration | **HIGH** | `@modelcontextprotocol/sdk` v1.30.0 and `@ai-sdk/mcp` v2.0.45 verified. AI SDK v7.0.93 verified with native tool calling and MCP support. |
| Persistence & Queue | **HIGH** | `better-sqlite3` v13.0.3 and `drizzle-orm` v0.45.2 verified. SQLite transactional locking eliminates external Redis overhead for v1. |
| Workspace & Runner | **HIGH** | `simple-git` v3.36.0 and `execa` v10.0.1 verified on npm. Standard production pattern for local process management. |

---

## Sources

- **Microsoft Azure DevOps Client for Node.js (`azure-devops-node-api`)**: Context7 `/microsoft/azure-devops-node-api` & GitHub [microsoft/azure-devops-node-api](https://github.com/microsoft/azure-devops-node-api)
- **Azure DevOps Services REST API Reference (v7.1 / v7.2-preview)**: Microsoft Learn [REST API Azure DevOps](https://learn.microsoft.com/en-us/rest/api/azure/devops)
- **Model Context Protocol (MCP) Specification & SDK**: `@modelcontextprotocol/sdk` npm package, Context7 MCP specification
- **Vercel AI SDK & MCP Client**: `@ai-sdk/mcp` & [ai-sdk.dev/docs/ai-sdk-core/mcp-tools](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)
- **Fastify Web Framework**: Fastify v5 Documentation [fastify.dev](https://fastify.dev)
- **SQLite Engine & Drizzle ORM**: [orm.drizzle.team](https://orm.drizzle.team)
