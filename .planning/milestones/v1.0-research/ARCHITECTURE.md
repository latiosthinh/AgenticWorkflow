# Architecture Patterns: Agentic SDLC Automation System with Azure DevOps

**Domain:** Autonomous Agentic SDLC Platform / Azure DevOps Workflow Orchestration  
**Researched:** 2026-09-07  
**Overall Confidence:** HIGH (Based on Azure DevOps Service Hooks/REST specifications, Model Context Protocol standard, and battle-tested distributed agent execution patterns)

---

## Recommended Architecture

The system uses an **Asynchronous Event-Driven Orchestration Architecture** decoupled from **Sandboxed Ephemeral Agent Workers**. Azure DevOps (ADO) acts as the primary human interface and source of truth for work items, code repositories, and pull requests.

```
                  ┌─────────────────────────────────────────────────────────┐
                  │                 Azure DevOps (Cloud/Server)             │
                  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
                  │  │  ADO Boards  │  │  ADO Repos   │  │ADO Pipelines │  │
                  │  │ (Work Items) │  │  (Git / PR)  │  │ (CI Checks)  │  │
                  └─────────┬───────────────▲─────────────────▲─────────────┘
                            │               │                 │
              Service Hooks │               │ REST / Git CLI  │ CI Status
                (Webhooks)  │               │                 │
                            ▼               │                 │
  ┌─────────────────────────────────────────┴─────────────────┴─────────────┐
  │                    Agentic SDLC Orchestration Service                   │
  │                                                                         │
  │  ┌────────────────────────┐         ┌────────────────────────────────┐  │
  │  │ Ingestion & Webhook    │         │ State Machine &                │  │
  │  │ Gateway (Auth/Verify)  │────────►│ Workflow Coordinator           │  │
  │  └────────────────────────┘         │ (FSM, Loop Caps, Gate Rules)   │  │
  │               │                     └───────────────┬────────────────┘  │
  │               ▼                                     │                   │
  │  ┌────────────────────────┐                         ▼                   │
  │  │ Idempotency & Event    │         ┌────────────────────────────────┐  │
  │  │ Deduplicator (Redis/DB)│         │ Dynamic Tool & Skill Registry  │  │
  │  └────────────────────────┘         │ (Tag-based MCP Server Hub)     │  │
  │                                     └───────────────┬────────────────┘  │
  │                                                     │                   │
  │                                     ┌───────────────▼────────────────┐  │
  │                                     │ Task Queue & Job Dispatcher    │  │
  │                                     │ (BullMQ / Celery / SQS)        │  │
  └─────────────────────────────────────────────────────┬───────────────────┘
                                                        │ Job Payload
                                                        ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                      Worker Host / Agent Runtime                        │
  │                                                                         │
  │  ┌───────────────────────────────────────────────────────────────────┐  │
  │  │ Agent Execution Sandbox (Ephemeral Docker / Pod / MicroVM)        │  │
  │  │                                                                   │  │
  │  │  ┌────────────────────┐    ┌─────────────────┐    ┌────────────┐  │  │
  │  │  │ LLM Reasoner       │◄──►│ Model Context   │◄──►│ Git Tree   │  │  │
  │  │  │ (Claude / GPT-4o)  │    │ Protocol (MCP)  │    │ (Worktree) │  │  │
  │  │  └────────────────────┘    │ Client Engine   │    └────────────┘  │  │
  │  │                            └────────┬────────┘          ▲         │  │
  │  │                                     │                   │         │  │
  │  │         ┌───────────────────────────┴──────────┐        │         │  │
  │  │         ▼                                      ▼        ▼         │  │
  │  │  ┌──────────────┐ ┌──────────────┐ ┌───────────────────────────┐  │  │
  │  │  │ Git/Repo MCP │ │ ADO API MCP  │ │ Isolated Test Runner MCP  │  │  │
  │  │  └──────────────┘ └──────────────┘ └───────────────────────────┘  │  │
  │  └───────────────────────────────────────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

### Component Boundaries

| Component | Responsibility | Communicates With | Protocol / Mechanism |
|-----------|---------------|-------------------|----------------------|
| **ADO Webhook Gateway** | Ingests incoming Service Hook payloads (`workitem.created`, `workitem.updated`, `git.pullrequest.created`, `ms.vss-code.git-pullrequest-comment-event`). Verifies HMAC/Basic secret signatures. Drops unhandled events. | External ADO, Idempotency Store, State Machine | HTTP POST (Incoming), In-Memory / Redis |
| **Idempotency & Deduplicator** | Deduplicates webhook storms, detects echo events (events caused by the bot's own writes), stores processed event hashes with TTL. | Webhook Gateway, State Machine | Redis / SQLite Key-Value lookup |
| **Workflow Coordinator & State Machine** | Enforces ADO board state transitions (`New` -> `Ready to Dev` -> `In Dev` -> `Dev Done` -> `Ready for QA` -> `Ready to Deploy`). Enforces iteration limits (max 3 rework loops). Determines agent role (Auditor vs Developer vs QA). | Deduplicator, Dynamic Tool Registry, Task Queue, ADO REST Client | In-process FSM / Event Bus |
| **Dynamic Skill & MCP Dispatcher** | Resolves work item domain tags (`frontend`, `backend`, `infra`) to contextual toolsets and skills. Mounts tailored MCP servers (e.g. database schema inspector for backend, component browser for frontend). | State Machine, Task Queue, MCP Server Catalog | JSON Configuration / MCP Registry |
| **Task Queue & Job Dispatcher** | Enqueues agent jobs with priority, concurrency locks per repository/ticket, exponential backoff retries, and timeout controls. Prevents concurrent executions on the same ticket. | State Machine, Worker Host | Redis (BullMQ) / Cloud Queue |
| **Agent Runtime & Sandbox** | Executes the reasoning and tool execution loop in isolation. Clones repo into ephemeral git worktree, executes code edits, runs local test suites, analyzes errors, and applies patches. | Task Queue, LLM Providers, Local MCP Servers | stdio / SSE (MCP), HTTPS (LLM API) |
| **ADO REST & Git Adapter** | Creates remote branches, commits code, opens Pull Requests, links PRs to Work Items (`System.LinkTypes.Hierarchy-Forward`), updates work item fields and board columns, posts diagnostic comments. | Worker Host, ADO REST API, Azure Repos | HTTPS REST (ADO v7.1 API), Git SSH/HTTPS |

---

### Data Flow & State Machine Transitions

#### 1. End-to-End Event Sequence

```
1. Ticket Intake:
   User creates/updates Work Item in ADO
   ──> ADO fires 'workitem.created' / 'workitem.updated'
   ──> Webhook Gateway verifies and deduplicates
   ──> State Machine checks: State == "New" && !Audited
   ──> Dispatches "Requirement Auditor Agent"
   ──> Agent reads criteria, checks ambiguity:
         - PASS: Updates ADO State -> "Ready to Dev", tags domain (frontend/backend).
         - FAIL: Leaves comment in ADO highlighting missing specs; remains in "New".

2. Human Triage & Trigger:
   Developer reviews ticket in "Ready to Dev"
   ──> Developer assigns domain tags or specific instructions
   ──> Developer moves ticket: "Ready to Dev" ──> "In Dev"
   ──> ADO fires 'workitem.updated' (System.State == "In Dev")
   ──> Webhook Gateway receives event
   ──> State Machine verifies actor is Human (not Bot ID)
   ──> State Machine locks ticket execution, enqueues "Developer Agent Job".

3. Autonomous Implementation Loop:
   Worker receives Job:
   ──> Clones target repo, checks out base branch, creates feature branch: `agent/ticket-{id}-{slug}`
   ──> Mounts dynamic MCP tools based on ticket tags (Git MCP, Test Runner MCP)
   ──> Planner step: Agent reads ticket description, acceptance criteria, codebase structure
   ──> Loop: [Plan ──> Edit Code ──> Run Local Unit Tests ──> Read Test Failure ──> Fix Code]
   ──> Loop terminates when tests pass OR max repair steps (e.g., 5) reached
   ──> If tests pass:
         - Commits changes to feature branch
         - Pushes feature branch to Azure Repos
         - Creates Pull Request via ADO REST API
         - Links PR to Work Item
         - Transitions Work Item: "In Dev" ──> "Dev Done"
         - Adds summary comment with test results and PR link
   ──> If tests fail (budget exhausted):
         - Pushes WIP branch
         - Transitions Work Item to "In Dev" (blocked) with failure log comment
         - Pings assigned developer.

4. Developer Review & Iterative Rework Gate:
   Developer reviews Pull Request in ADO:
   ──> OPTION A: Request Changes / Comment
         - Developer adds PR comments and moves Work Item back to "In Dev"
         - ADO fires webhook
         - State Machine detects Rework Trigger (Previous: "Dev Done", Current: "In Dev")
         - Checks iteration counter (Counter < MaxLoops, default 3)
         - Worker checks out existing feature branch, pulls PR comments, executes localized fixes, re-runs tests
         - Worker pushes new commit to existing PR
         - Transitions Work Item back to "Dev Done"
   ──> OPTION B: Approve & Merge PR
         - Developer approves and completes/merges PR to target branch
         - Developer (or automated policy) moves Work Item: "Dev Done" ──> "Ready for QA"

5. QA Verification Loop:
   Ticket enters "Ready for QA":
   ──> QA Tester or Automated QA Agent runs integration / regression suite against staging build
   ──> PASS:
         - Transition: "Ready for QA" ──> "Ready to Deploy"
         - Workflow execution completes.
   ──> FAIL:
         - Bug details & reproduction steps commented on ticket
         - Transition: "Ready for QA" ──> "In Dev"
         - State Machine increments QA bounce counter, dispatches Bugfix Agent.
```

---

### Comprehensive State Transition Matrix

| Current ADO State | Event / Trigger | Trigger Actor | Guard Condition | Executed Action | Next ADO State |
|-------------------|-----------------|---------------|-----------------|-----------------|----------------|
| `New` | `workitem.created` / `updated` | Human | Unaudited & non-bot edit | Enqueue Audit Agent | `New` (evaluating) |
| `New` | Audit Passed | Auditor Agent | Acceptance criteria unambiguous | Post audit summary comment | `Ready to Dev` |
| `New` | Audit Failed | Auditor Agent | Missing required AC | Post questions comment | `New` |
| `Ready to Dev` | Column moved to `In Dev` | Developer (Human) | Has domain tag (`frontend`/`backend`) | Allocate sandbox, enqueue Dev Agent | `In Dev` |
| `In Dev` | Unit tests green & PR created | Developer Agent | Clean working directory, CI pass | Create PR, link Work Item, post diff summary | `Dev Done` |
| `In Dev` | Repair budget exhausted | Developer Agent | Local test retry limit hit (5) | Push draft branch, post error diagnostic | `In Dev` (Blocked) |
| `Dev Done` | Review Rejected / Moved to `In Dev` | Developer (Human) | Rework count < MaxRework (3) | Fetch PR comments, enqueue Review-Fix Agent | `In Dev` |
| `Dev Done` | Review Rejected (Exceeded Max) | Developer (Human) | Rework count >= MaxRework (3) | Reject automation, notify human lead | `In Dev` (Manual) |
| `Dev Done` | PR Merged & Moved to `Ready for QA` | Developer (Human) | PR merged to target branch | Trigger QA test suite / notify QA team | `Ready for QA` |
| `Ready for QA` | QA Failed / Moved to `In Dev` | QA Tester (Human/Agent) | QA failure log attached | Increment QA bounce counter, enqueue Fix Agent | `In Dev` |
| `Ready for QA` | QA Passed / Moved to `Ready to Deploy` | QA Tester (Human/Agent) | All test runs green | Mark workflow complete, post release note | `Ready to Deploy` |

---

## Execution Isolation & Security Model

Agent code generation executes arbitrary commands (e.g., `npm test`, `pytest`, build scripts). Running these directly on the orchestration host poses catastrophic security and stability risks.

### Isolation Architecture

```
Host OS (Orchestrator Host)
  │
  ├── Process Boundary: Task Queue Worker
  │     │
  │     └── Docker / DevContainer Engine
  │           │
  │           ▼
  │     ┌─────────────────────────────────────────────────────────┐
  │     │ Container Sandbox (One container per task execution)    │
  │     │                                                         │
  │     │ • Resource limits: CPU (2 cores), RAM (4GB), Disk (10GB)│
  │     │ • Network: Restricted egress (LLM API, ADO Git, npm/pip)│
  │     │ • Filesystem: Ephemeral bind-mount to isolated worktree │
  │     │ • User: Non-root user (`agent:1001`)                    │
  │     │ • Read-only root filesystem where possible             │
  │     │ • No Docker socket exposure (No sibling container escape)│
  │     └─────────────────────────────────────────────────────────┘
```

1. **Ephemeral Git Worktrees**:
   - The agent never works on the main repository working directory.
   - For every job, the runner creates a dedicated git worktree (`git worktree add ../worktrees/ticket-1234 agent/ticket-1234`).
   - Clean deletion after execution (`git worktree remove --force`), preventing cross-ticket contamination.

2. **Network Policy & Egress Filtering**:
   - Sandboxes are placed on an isolated Docker bridge network.
   - Outbound requests are filtered via egress proxy / firewall:
     - Allowed: Package registries (internal Artifactory/npm/PyPI), Azure DevOps endpoints (`dev.azure.com`), LLM API endpoints.
     - Blocked: Internal VPC metadata endpoints (`169.254.169.254`), LAN corporate services, unauthenticated egress.

3. **Credential Scoping & Injection**:
   - **Never** mount the host's global `.gitconfig` or developer SSH keys into the container.
   - Inject short-lived Azure DevOps scoped tokens (Service Principal or OAuth token scoped strictly to the target repository and work item area path).
   - LLM API keys injected via environment variables inside the container runner process, never written to disk or repository.

4. **Command Execution Guardrails**:
   - High-risk commands blocked by the local bash execution tool:
     - `rm -rf /`, formatting commands, network tunneling (`nc`, `ngrok`), modification of `.git/config` or CI pipeline definitions (`azure-pipelines.yml`).

---

## Patterns to Follow

### Pattern 1: Asynchronous Webhook Ingestion with Queue-Driven Execution
**What:** Webhook receiver immediately validates signature, saves raw payload to an append-only store, returns HTTP 200/202 within 200ms, and pushes the event to an asynchronous task queue.  
**When:** All external Azure DevOps Service Hook integrations.  
**Why:** Azure DevOps Service Hooks enforce strict HTTP timeouts (5-10s). LLM reasoning cycles run from 30 seconds to 5 minutes. Processing synchronously inside the HTTP handler causes webhook delivery timeouts, ADO webhook disabling, and thread starvation.

```typescript
// Webhook endpoint: fast acknowledgment + decoupled queueing
app.post("/api/ado/webhook", async (req, res) => {
  const signature = req.headers["x-hub-signature-256"];
  if (!verifyAdoSignature(req.rawBody, signature, WEBHOOK_SECRET)) {
    return res.status(401).send("Invalid signature");
  }

  const event = req.body;
  const eventId = `${event.eventType}:${event.resource?.id}:${event.resource?.rev}`;

  // Atomic idempotency check (Redis SET NX with 24h TTL)
  const isNew = await redis.set(`event:${eventId}`, "processing", "EX", 86400, "NX");
  if (!isNew) {
    return res.status(200).json({ status: "duplicate_ignored" });
  }

  // Push to persistent worker queue
  await workflowQueue.add("ado-event", event, {
    jobId: eventId,
    removeOnComplete: true,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 }
  });

  return res.status(202).json({ status: "accepted" });
});
```

### Pattern 2: Actor Attribution & Webhook Loop Breakers
**What:** Tagging every mutation made by the automated system with an explicit Bot identity or metadata header, and verifying `revisedBy` / `changedBy` in incoming webhooks.  
**When:** Processing any `workitem.updated` or `git.pullrequest` event.  
**Why:** When the agent updates the ticket state from "In Dev" to "Dev Done", ADO generates another `workitem.updated` webhook. If not filtered, the orchestrator triggers another agent job, creating an infinite, expensive loop.

```typescript
function isSelfTriggered(event: AdoWorkItemUpdatedEvent): boolean {
  const changedById = event.resource.fields["System.ChangedBy"]?.id;
  const botServicePrincipalId = process.env.ADO_BOT_SERVICE_PRINCIPAL_ID;
  
  // Guard 1: Event triggered by the bot itself
  if (changedById === botServicePrincipalId) {
    return true;
  }

  // Guard 2: Explicit automated marker field or comment token
  const comment = event.resource.fields["System.History"] || "";
  if (comment.includes("[Automated-Agentic-SDLC]")) {
    return true;
  }

  return false;
}
```

### Pattern 3: Dynamic MCP Tool Scoping via Ticket Taxonomy
**What:** Loading only the MCP servers and system instructions needed for the ticket's domain tags (`frontend`, `backend`, `database`, `infra`).  
**When:** Starting the Agent Execution Sandbox.  
**Why:** Dumping 50+ tool definitions (Git, DB, Docker, Kubernetes, Figma, Azure CLI, React doc tools) into the prompt consumes 15,000+ tokens of context before the agent even reads the ticket, degrades LLM instruction-following accuracy, and increases tool-calling hallucination.

```typescript
function resolveMcpToolsets(tags: string[]): McpConfig {
  // Base tools always present
  const activeServers = ["git-tools", "test-runner", "ado-workitem"];

  if (tags.includes("frontend")) {
    activeServers.push("playwright-browser", "css-inspector");
  }
  if (tags.includes("backend") || tags.includes("database")) {
    activeServers.push("db-schema-inspector", "api-contract-linter");
  }
  if (tags.includes("infra")) {
    activeServers.push("terraform-linter", "azure-resource-mock");
  }

  return buildMcpConfigForServers(activeServers);
}
```

### Pattern 4: Test-Driven Autonomous Repair Loop
**What:** The agent must run tests in the isolated sandbox, capture stdout/stderr, evaluate pass/fail, and iteratively self-correct before pushing a PR.  
**When:** Implementation stage in `In Dev`.  
**Why:** Prevents breaking PRs from flooding human reviewers. Fixes simple typos, missing imports, and broken test assertions autonomously.

```
Agent Loop:
[Write Code] 
     │
     ▼
[Execute Test Suite (MCP test-runner)] ◄──────────┐
     │                                            │
   Pass?                                          │
    ├──► YES ──► [Commit & Push PR]               │
    │                                             │
    └──► NO  ──► [Read Stack Trace & Errors]      │
                      │                           │
                   Retries < 5?                   │
                      ├──► YES ──► [Patch Code] ──┘
                      │
                      └──► NO  ──► [Abort, Push WIP & Alert Human]
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Synchronous Webhook Processing
- **What:** Processing the LLM planning and code generation directly within the HTTP handler of the ADO Service Hook endpoint.
- **Why bad:** ADO Service Hooks drop connections after 10 seconds and flag the webhook subscription as unhealthy, disabling it. If the server crashes, all in-flight jobs are permanently lost.
- **Instead:** Ingest webhook -> enqueue job in Redis/DB queue -> return HTTP 202 immediately.

### Anti-Pattern 2: Unsandboxed Host Execution
- **What:** Running `exec("npm test")` or `exec("git checkout")` directly on the machine hosting the orchestration server.
- **Why bad:** Agent prompt injection or faulty LLM generation can run `rm -rf /`, overwrite project files, leak server environment variables, or hog 100% of host CPU and crash the orchestrator.
- **Instead:** Spawn a dedicated Docker container or isolated microVM per execution run with CPU/memory limits and non-root users.

### Anti-Pattern 3: Shared Git Working Trees
- **What:** Running multiple agent jobs in the same cloned repository folder.
- **Why bad:** Race conditions on `git checkout`, index lockfile collisions (`.git/index.lock`), mixed commits across different tickets.
- **Instead:** Use `git worktree add` for every ticket or clone an isolated copy in ephemeral container storage.

### Anti-Pattern 4: Direct Git Push to Main Branch
- **What:** Letting the autonomous agent merge directly into `main` or release branches when tests pass.
- **Why bad:** Destroys human trust. Misses architectural considerations, security reviews, and business context that unit tests do not cover.
- **Instead:** Agents ONLY open Pull Requests. Human gate (`Dev Done` -> review & approve) is mandatory before merging.

### Anti-Pattern 5: Unbounded Rework Loops
- **What:** Allowing unlimited re-triggers between `In Dev` and `Dev Done`.
- **Why bad:** If a human writes ambiguous comments or a flaky test continually fails, the agent will loop dozens of times, burning hundreds of dollars in LLM API tokens.
- **Instead:** Strict circuit breaker: enforce `max_iterations = 3`. If the ticket returns to `In Dev` a 4th time, lock the ticket to `In Dev (Manual Escalation)` and assign a human developer.

---

## Scalability Considerations

| Concern | Small Team (10-50 Work Items/day) | Engineering Org (500-2,000 Work Items/day) | Enterprise Scale (10,000+ Work Items/day) |
|---------|-----------------------------------|--------------------------------------------|-------------------------------------------|
| **Webhook Ingestion** | Single Node.js Express server + SQLite deduplication table. | Clustered Fastify/Go ingestion nodes behind cloud load balancer; Redis Cluster deduplicator. | Serverless ingestion (Azure Functions / Cloudflare Workers) streaming into Azure Event Hubs / Kafka. |
| **Task Queue & State** | In-memory / local Redis instance with BullMQ. | Redis Cluster with persistent state backing (PostgreSQL for audit logs and FSM). | Distributed event-driven orchestrator (Temporal.io, Azure Durable Functions, or Kafka + PostgreSQL). |
| **Worker Execution** | Local Docker daemon running on worker VM with pre-pulled base images. | Auto-scaling Kubernetes cluster (KEDA) spawning ephemeral Pods with localized resource quotas. | Elastic fleet of dedicated ephemeral microVMs (AWS Firecracker / Azure Container Instances) with warm pool pre-provisioning. |
| **Repository Caching**| Local bare git mirror (`--bare`) used as reference for fast worktree creation. | Shared read-only NFS/EFS volume caching bare git mirrors to avoid repeated network clones. | Distributed Git cache proxy with warm cache layers per active repository. |
| **LLM Token & Rate Limits** | Direct API calls to OpenAI / Anthropic with basic retry logic. | LLM Gateway / Proxy (LiteLLM, Portkey) with token rate limit queuing, fallbacks, and multi-model routing. | Enterprise Azure OpenAI / Anthropic provisioned throughput units (PTU) with local fallback models (DeepSeek-Coder on-prem). |

---

## Suggested Build Order & Dependencies

Based on component dependencies, the agentic SDLC system should be constructed in the following sequence:

```
Phase 1: ADO Ingestion & Infrastructure Foundation
  │   - Service Hook Webhook Gateway (HMAC verification, fast 202 ack)
  │   - Idempotency & Deduplication Engine (loop breaker)
  │   - ADO REST Client (Authentication, Work Item read/update, comments)
  ▼
Phase 2: SDLC State Machine & Requirement Auditor
  │   - Finite State Machine core (State transition rules, history tracking)
  │   - Auditor Agent (reads AC, evaluates clarity, transitions `New` -> `Ready to Dev`)
  │   - Human Triage tags & state transition verifier
  ▼
Phase 3: Execution Sandbox & MCP Tooling
  │   - Docker/Worktree sandbox orchestrator (ephemeral worktree manager)
  │   - Model Context Protocol (MCP) server integration:
  │       * ADO Work Item & PR MCP
  │       * Git operations MCP
  │       * Local test execution MCP
  │   - Dynamic tag-based tool injector
  ▼
Phase 4: Autonomous Developer Agent Loop
  │   - Coder Agent reasoning loop (Plan -> Code -> Local Test -> Self-repair)
  │   - Test failure parser and iterative patcher
  │   - PR generation, work item linking, transition `In Dev` -> `Dev Done`
  ▼
Phase 5: Human Review & Iterative Rework Gate
  │   - PR webhook listener (Review submitted, changes requested)
  │   - Rework transition handler (`Dev Done` -> `In Dev` with comment extraction)
  │   - Branch checkout, feedback patcher, and iteration limit circuit breaker
  ▼
Phase 6: QA Gate & Deployment Readiness
      - QA state handler (`Ready for QA` -> `Ready to Deploy` or bounce to `In Dev`)
      - Automated verification test runner / smoke test agent
      - Final completion gate and delivery audit
```

### Build Order Rationale

1. **Phase 1 before Phase 2:** You cannot test state transitions or audits without reliable, authenticated communication with the Azure DevOps REST API and a robust webhook loop breaker.
2. **Phase 2 before Phase 3:** Building the requirement audit agent first validates the LLM interaction pattern and ADO state updates on low-risk read-only tasks before granting code-execution capabilities.
3. **Phase 3 before Phase 4:** The coder agent cannot run safely without the sandboxed runtime, worktree isolation, and MCP tool infrastructure in place. Writing code on the host without sandboxing creates extreme technical debt and security risks.
4. **Phase 4 before Phase 5:** Iteration and rework loops operate on the PR and branch artifacts produced by the developer agent. You cannot test review rework without an initial PR creation loop.
5. **Phase 5 before Phase 6:** Developer code review is the primary human-in-the-loop safety gate that protects the codebase before any QA validation or deployment gate is triggered.

---

## Sources & References

- [Azure DevOps Service Hooks Documentation (Microsoft Learn)](https://learn.microsoft.com/en-us/azure/devops/service-hooks/overview?view=azure-devops) — HIGH Confidence
- [Azure DevOps REST API 7.1 Specifications](https://learn.microsoft.com/en-us/rest/api/azure/devops/?view=azure-devops-rest-7.1) — HIGH Confidence
- [Model Context Protocol (MCP) Specification (Anthropic)](https://modelcontextprotocol.io/) — HIGH Confidence
- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree) — HIGH Confidence
- [Container Security & Isolation Best Practices (Docker / OCI)](https://docs.docker.com/engine/security/) — HIGH Confidence
