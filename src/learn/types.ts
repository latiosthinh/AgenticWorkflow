export interface TicketLifecycleData {
  workItemId: number;
  title: string;
  description: string;
  acceptanceCriteria: string;
  reworkBounces: number;
  reworkSourceGates: string[];
  unitTestsPassed: number;
  unitTestsTotal: number;
  qaPassed: boolean;
  qaFlakeCleared: boolean;
  errorRate: string;
  p95LatencyMs: number;
  reviewComments: string[];
  smokePassed?: boolean;
  smokeStatus?: string;
  scopeRejections?: number;
  qaStrikes?: number;
  smokeFlakes?: number;
}

export interface RetroActionItem {
  action: string;
  owner: string;
  priority: 'P1' | 'P2' | 'P3';
  trackingRef: string;
}

export interface DoraTrendDeltas {
  leadTimeMinutes: number;
  leadTimeDeltaMinutes: number;
  reworkBounces: number;
  reworkDelta: number;
  historicalDeployedCount: number;
  trend: 'improving' | 'stable' | 'regressing';
}

export interface RetroReport {
  takeaways: string;
  actionItems: RetroActionItem[];
  gateFriction: {
    scopeRejections: number;
    reworkBounces: number;
    qaStrikes: number;
    smokeFlakes: number;
  };
  trendDeltas: DoraTrendDeltas;
}

export interface LearnedRunbook {
  frontmatter: {
    name: string;
    skill: string;
    ticket: string;
    updatedAt: string;
  };
  markdownContent: string;
  hasChanges: boolean;
  summary: string;
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  domain: 'backend' | 'frontend' | 'infra' | 'common';
  tags: string[];
}

export interface LearnedSkill {
  frontmatter: SkillFrontmatter;
  markdownContent: string;
  summary: string;
}
