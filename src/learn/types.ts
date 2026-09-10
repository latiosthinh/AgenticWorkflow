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
