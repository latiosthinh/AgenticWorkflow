export interface DedupRecord {
  workItemId: number;
  revId: number;
  status: 'pending' | 'completed' | 'skipped' | 'failed';
  payloadHash: string;
  errorMessage?: string;
  receivedAt: string;
}

export interface AuditLogEntry {
  id?: number;
  revId: number;
  verdict: 'passed' | 'failed';
  reasons: string;
  criteriaSummary: string;
  model: string;
  evaluatedAt: string;
}

export interface PlanCheckpointState {
  id?: number;
  revId: number;
  status: 'pending_human_input' | 'resumed' | 'locked' | 'blocked' | 'expired';
  questions: string;
  answers?: string | null;
  planMarkdown?: string | null;
  estimatedFiles?: string | null;
  testStrategy?: string | null;
  remindedAt?: string | null;
  escalatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface L3EvidenceEntry {
  id?: number;
  revId: number;
  testSuite: string;
  totalTests: number;
  passed: number;
  failed: number;
  durationMs: number;
  coverageSummary?: string | null;
  gitDiffStat: string;
  createdAt: string;
}

export interface ScopeLockState {
  status: 'pending' | 'locked' | 'rejected' | 'blocked';
  iterationCount: number;
  requestedAt: string;
  lockedAt?: string | null;
  lockedBy?: string | null;
  feedback?: string | null;
  remindedAt?: string | null;
  escalatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReworkCycleState {
  bounceCount: number;
  lastBounceAt?: string | null;
  sourceGate: 'accept' | 'pr_review';
  escalatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QaRunEntry {
  id?: number;
  runIndex: number;
  strikeCount: number;
  status: 'passed' | 'failed' | 'flaked';
  failedTestSignatures?: string | null;
  stdout?: string | null;
  stderr?: string | null;
  durationMs?: number | null;
  createdAt: string;
}

export interface QaBounceState {
  bounceCount: number;
  lastBouncedAt?: string | null;
  escalated: number;
}

export interface QaEvidenceState {
  totalTests: number;
  passedCount: number;
  failedCount: number;
  durationMs: number;
  commitSha: string;
  stagingUrl?: string | null;
  flakeCleared: number;
  createdAt: string;
}

export interface SmokeRunEntry {
  id?: number;
  runIndex: number;
  strikeCount: number;
  status: 'passed' | 'failed' | 'flaked';
  classification?: 'INFRA' | 'APP' | 'NONE';
  failedCheckSignatures?: string | null;
  stdout?: string | null;
  stderr?: string | null;
  durationMs?: number | null;
  createdAt: string;
}

export interface SmokeEvidenceState {
  status: 'passed' | 'failed' | 'flaked';
  classification?: 'INFRA' | 'APP' | 'NONE';
  commitSha: string;
  smokeUrl?: string | null;
  checksTotal: number;
  checksPassed: number;
  checksFailed: number;
  durationMs: number;
  flakeCleared: boolean;
  createdAt: string;
}

export interface DeploymentRecordEntry {
  id?: number;
  pipelineRunId?: string | null;
  stageName: string;
  environmentName: string;
  commitSha: string;
  status: 'pending_approval' | 'deployed' | 'failed' | 'rejected';
  releaseNotes?: string | null;
  rollbackPlan?: string | null;
  migrationRisk?: string | null;
  createdAt: string;
  deployedAt?: string | null;
}

export interface TelemetryEvaluationEntry {
  id?: number;
  windowMinutes: number;
  errorRate: string;
  p95LatencyMs: number;
  baselineErrorRate?: string | null;
  baselineP95Ms?: number | null;
  breached: number;
  breachReasons?: string | null;
  evaluatedAt: string;
}

export interface EvidenceIndexState {
  l1Summary: string;
  l2Summary: string;
  l3Summary: string;
  l4Summary: string;
  l5Summary: string;
  l6Summary: string;
  l7Summary?: string | null;
  completedAt: string;
}

export interface L7EvidenceState {
  id?: number;
  takeaways: string;
  actionItems: string[];
  runbookDiffPrUrl?: string | null;
  skillPrUrl?: string | null;
  gateFriction?: {
    scopeRejections?: number;
    reworkBounces?: number;
    qaStrikes?: number;
    smokeFlakes?: number;
  } | null;
  trendDeltas?: Record<string, unknown> | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface SkillsPrEntry {
  id?: number;
  skillName: string;
  branchName: string;
  pullRequestId?: number | null;
  prUrl?: string | null;
  status: 'pending_review' | 'merged' | 'closed';
  summary: string;
  createdAt: string;
}

export interface TicketState {
  workItemId: number;
  revId: number;
  createdAt: string;
  updatedAt: string;
  auditLogs: AuditLogEntry[];
  planCheckpoints: PlanCheckpointState[];
  l3Evidence: L3EvidenceEntry[];
  scopeLock?: ScopeLockState | null;
  reworkCycles?: ReworkCycleState | null;
  qaRuns: QaRunEntry[];
  qaBounces?: QaBounceState | null;
  qaEvidence?: QaEvidenceState | null;
  deploymentRecords: DeploymentRecordEntry[];
  telemetryEvaluations: TelemetryEvaluationEntry[];
  evidenceIndex?: EvidenceIndexState | null;
  skillsPrs: SkillsPrEntry[];
  smokeRuns?: SmokeRunEntry[];
  smokeEvidence?: SmokeEvidenceState | null;
  retroRecords?: L7EvidenceState[];
  l7Evidence?: L7EvidenceState | null;
}

export interface StateStore {
  getTicketState(workItemId: number): Promise<TicketState | null>;
  getTicketNotes(workItemId: number): Promise<string>;
  updateTicketState(
    workItemId: number,
    mutator: (state: TicketState) => void | Promise<void>,
    notesAppend?: string
  ): Promise<TicketState>;
  listTickets(options?: { includeArchived?: boolean }): Promise<TicketState[]>;
  archiveTicket(workItemId: number): Promise<void>;
  recordDedupEvent(
    workItemId: number,
    revId: number,
    payloadHash: string
  ): { isDuplicate: boolean; event: DedupRecord };
  updateDedupStatus(
    workItemId: number,
    revId: number,
    status: DedupRecord['status'],
    errorMessage?: string
  ): void;
  purgeOldDedupEvents(retentionDays?: number): { changes: number };
  getDedupEvent?(workItemId: number, revId: number): DedupRecord | null;
}
