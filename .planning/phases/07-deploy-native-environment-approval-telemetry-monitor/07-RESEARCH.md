# Phase 7: DEPLOY — Native Environment Approval & Telemetry Monitor - Research

**Phase:** 07 - DEPLOY — Native Environment Approval & Telemetry Monitor
**Confidence:** HIGH

## Executive Summary

Phase 7 implements the final production delivery and confidence stages of the Golden Path Standard:
- **DPLY-01**: Deployment gated behind native Azure DevOps Environment approvals (human ◆) with structured L5 evidence (release notes, migration risk assessment, rollback command, commit SHA).
- **DPLY-02**: Post-deployment production confidence monitoring via Azure Monitor / Application Insights evaluating a 30-minute window for error-rate spikes and p95-latency regressions. Threshold breaches bounce the release to "In Dev" with actionable diagnostics.
- **DPLY-03**: Work item workflow completion ("Done") strictly after the telemetry evaluation window passes without breaches, attaching a complete, unified L1–L6 evidence index.

## Architecture & Integration Points

### 1. Native Azure DevOps Environment Approval (L5)
- Azure Pipelines Environments (`Pipelines -> Environments`) provide native human approval checks.
- When an approval check is pending, our system does NOT implement a custom approval interface.
- Instead, upon entering deployment preparation, the orchestrator generates an **L5 Deployment Readiness Packet**:
  - Release notes summarizing committed features and fixes
  - Database schema migration safety analysis (Drizzle schema changes, backwards compatibility)
  - Rollback procedure (git revert commit, deployment rollback command)
  - Target commit SHA and preview/staging verification links
- The orchestrator posts this formatted HTML comment with loop shield to the work item so the designated approver has all governance context in ADO.
- The pipeline stage completion is signaled via Azure DevOps Service Hook event `ms.vss-pipelines.stage-state-changed-event` (or polling fallback) when the environment deployment succeeds.

### 2. Post-Deploy Telemetry Monitor (L6)
- **Azure Monitor / App Insights REST Query**:
  - Endpoint: `https://api.applicationinsights.io/v1/apps/{appId}/metrics` or Azure Monitor Metrics REST API.
  - Metrics evaluated:
    - Error Rate: `requests/failed` count divided by total `requests/count` over `timespan=PT30M`.
    - Latency: `requests/duration` percentiles (p95) over `timespan=PT30M`.
  - Regression Thresholds:
    - Error rate spike > 1.0% (or increase > 0.5% over baseline).
    - p95 latency > 500ms (or >20% increase over pre-deploy baseline).
  - Pluggable Driver:
    - An `AzureMonitorClient` interface with a live REST client and a deterministic mock driver for local testing.
- **Breach Handling**:
  - If a threshold breach is detected, the monitor records the telemetry evaluation as breached.
  - Posts a formatted `[Deploy Telemetry Alert]` comment with detailed breach metrics and emergency rollback commands.
  - Transitions work item state back to `In Dev` with tag `[deploy-regressed]` and alerts the on-call/ticket owner.

### 3. Unified L1–L6 Evidence Index & "Done" Transition (DPLY-03)
- When the telemetry evaluation window passes without any threshold breaches:
  - Aggregate the complete Golden Path evidence from local SQLite tables and ADO records:
    - **L1 (Contract)**: DoD completeness, testability, scope boundaries from `audit_log`.
    - **L2 (Code Quality & Review)**: Human code reviewer approval, reviewer votes, discussion resolution from PR.
    - **L3 (Functional Evidence)**: Local unit test self-repair report (`l3_evidence`) and staging integration test report (`qa_evidence`).
    - **L4 (Security Gate)**: Native SAST / security scan branch policy evaluations.
    - **L5 (Deployment Approval)**: Native ADO Environment approver, release notes, migration assessment (`deployment_records`).
    - **L6 (Production Telemetry)**: Evaluated error rate, p95 latency, and monitoring duration (`telemetry_evaluations`).
  - Persist structured record in `evidence_index` table.
  - Post formatted sanitized HTML `[Golden Path Complete] L1–L6 Evidence Index` comment with `<!-- [automated-agent] -->` loop shield.
  - Transition work item state to `Done`, remove `[deploying]`, and apply `[golden-path-complete]`.

## Database Schema Extensions

1. `deployment_records`:
   - `id`: integer primary key autoincrement
   - `workItemId`: integer not null
   - `pipelineRunId`: text
   - `stageName`: text not null
   - `environmentName`: text not null
   - `commitSha`: text not null
   - `status`: text not null ('pending_approval' | 'deployed' | 'failed' | 'rejected')
   - `releaseNotes`: text
   - `rollbackPlan`: text
   - `migrationRisk`: text
   - `createdAt`: integer (timestamp)
   - `deployedAt`: integer (timestamp)

2. `telemetry_evaluations`:
   - `id`: integer primary key autoincrement
   - `workItemId`: integer not null
   - `windowMinutes`: integer not null default 30
   - `errorRate`: text not null
   - `p95LatencyMs`: integer not null
   - `baselineErrorRate`: text
   - `baselineP95Ms`: integer
   - `breached`: integer not null default 0
   - `breachReasons`: text
   - `evaluatedAt`: integer (timestamp)

3. `evidence_indices`:
   - `workItemId`: integer primary key
   - `l1Summary`: text not null
   - `l2Summary`: text not null
   - `l3Summary`: text not null
   - `l4Summary`: text not null
   - `l5Summary`: text not null
   - `l6Summary`: text not null
   - `completedAt`: integer (timestamp)
