export interface MigrationRiskAssessment {
  riskLevel: 'low' | 'medium' | 'high';
  details: string[];
  recommendation: string;
  hasSchemaChanges: boolean;
}

export interface RollbackProcedure {
  commitSha: string;
  revertCommand: string;
  redeployCommand: string;
  environmentName: string;
}

export interface L5ReadinessPacket {
  workItemId: number;
  title: string;
  commitSha: string;
  environmentName: string;
  releaseNotes: string;
  migrationRisk: MigrationRiskAssessment;
  rollback: RollbackProcedure;
}

export interface DeploymentEvent {
  workItemId: number;
  pipelineRunId?: string;
  stageName: string;
  environmentName: string;
  status: 'pending_approval' | 'deployed' | 'failed' | 'rejected';
}
