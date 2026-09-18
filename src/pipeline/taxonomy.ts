export type ColumnId =
  | 'REFINEMENT'
  | 'EXECUTION'
  | 'ACCEPTANCE'
  | 'RELEASE'
  | 'RETRO';

export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type ActorRole = 'AI' | 'Human';
export type EvidenceLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7';
export type AdoState =
  | 'New'
  | 'Ready to Dev'
  | 'In Dev'
  | 'Dev Done'
  | 'Ready for QA'
  | 'Ready to Deploy'
  | 'Done';

export interface StepDefinition {
  readonly step: StepNumber;
  readonly name: string;
  readonly column: ColumnId;
  readonly actor: ActorRole;
  readonly actorDetail: string;
  readonly evidenceLevels: readonly EvidenceLevel[];
  readonly primaryEvidenceLevel: EvidenceLevel;
  readonly adoState: AdoState;
  readonly gateType: 'human_verdict' | 'automated_trigger';
  readonly keyTags?: readonly string[];
  readonly description?: string;
}

export const GOLDEN_PATH_V2: readonly StepDefinition[] = Object.freeze([
  Object.freeze({
    step: 1,
    name: 'Ticket & AC verify',
    column: 'REFINEMENT',
    actor: 'AI',
    actorDetail: 'AI Agent',
    evidenceLevels: Object.freeze(['L1'] as const),
    primaryEvidenceLevel: 'L1',
    adoState: 'New',
    gateType: 'automated_trigger',
    keyTags: Object.freeze(['[audit-passed]', '[awaiting-scope-lock]'] as const),
    description: 'Audit ticket acceptance criteria and determine readiness to dev',
  }),
  Object.freeze({
    step: 2,
    name: 'Scope review & verify',
    column: 'REFINEMENT',
    actor: 'Human',
    actorDetail: 'Human PM',
    evidenceLevels: Object.freeze(['L1'] as const),
    primaryEvidenceLevel: 'L1',
    adoState: 'Ready to Dev',
    gateType: 'human_verdict',
    keyTags: Object.freeze(['[awaiting-scope-lock]', '[scope-locked]'] as const),
    description: 'Human PM scope lock and specification review',
  }),
  Object.freeze({
    step: 3,
    name: 'Loop: Plan-Code-Test',
    column: 'EXECUTION',
    actor: 'AI',
    actorDetail: 'AI Agent',
    evidenceLevels: Object.freeze(['L2', 'L3'] as const),
    primaryEvidenceLevel: 'L3',
    adoState: 'In Dev',
    gateType: 'automated_trigger',
    keyTags: Object.freeze(['[awaiting-input]'] as const),
    description: 'Autonomous coding, repair loop, and unit test verification',
  }),
  Object.freeze({
    step: 4,
    name: 'Dev validate & PR',
    column: 'EXECUTION',
    actor: 'Human',
    actorDetail: 'Human Dev',
    evidenceLevels: Object.freeze(['L2', 'L3'] as const),
    primaryEvidenceLevel: 'L2',
    adoState: 'Dev Done',
    gateType: 'human_verdict',
    keyTags: Object.freeze(['[awaiting-acceptance]', '[acceptance-approved]'] as const),
    description: 'Developer acceptance validation and PR creation',
  }),
  Object.freeze({
    step: 5,
    name: 'PR review & CI deploy',
    column: 'ACCEPTANCE',
    actor: 'Human',
    actorDetail: 'Human TechLead/SA',
    evidenceLevels: Object.freeze(['L3', 'L4'] as const),
    primaryEvidenceLevel: 'L4',
    adoState: 'Dev Done',
    gateType: 'human_verdict',
    keyTags: Object.freeze(['[pr-merged]'] as const),
    description: 'Code review, branch policy verification, and PR merge',
  }),
  Object.freeze({
    step: 6,
    name: 'QA staging verify',
    column: 'ACCEPTANCE',
    actor: 'Human',
    actorDetail: 'Human QA',
    evidenceLevels: Object.freeze(['L3', 'L5'] as const),
    primaryEvidenceLevel: 'L5',
    adoState: 'Ready for QA',
    gateType: 'human_verdict',
    keyTags: Object.freeze(['[qa-verified]', '[qa-failed]'] as const),
    description: 'Staging environment deployment and QA verification',
  }),
  Object.freeze({
    step: 7,
    name: 'Release approval + deploy',
    column: 'RELEASE',
    actor: 'Human',
    actorDetail: 'Human QA/SA/Lead/PM',
    evidenceLevels: Object.freeze(['L5'] as const),
    primaryEvidenceLevel: 'L5',
    adoState: 'Ready to Deploy',
    gateType: 'human_verdict',
    keyTags: Object.freeze(['[deploying]'] as const),
    description: 'Production release gate approval and environment deployment',
  }),
  Object.freeze({
    step: 8,
    name: 'Smoke test & monitor',
    column: 'RELEASE',
    actor: 'AI',
    actorDetail: 'AI / Automation',
    evidenceLevels: Object.freeze(['L6'] as const),
    primaryEvidenceLevel: 'L6',
    adoState: 'Ready to Deploy',
    gateType: 'automated_trigger',
    keyTags: Object.freeze(['[deploy-regressed]', '[smoke-harness-error]'] as const),
    description: 'Post-deploy smoke test harness and telemetry monitor',
  }),
  Object.freeze({
    step: 9,
    name: 'Retro takeaways, docs, skill enhancement',
    column: 'RETRO',
    actor: 'AI',
    actorDetail: 'AI Agent & Team',
    evidenceLevels: Object.freeze(['L7'] as const),
    primaryEvidenceLevel: 'L7',
    adoState: 'Done',
    gateType: 'automated_trigger',
    keyTags: Object.freeze(['[golden-path-complete]', '[retro-failed]'] as const),
    description: 'Harvest learnings, update skills PR, and finalize DORA evidence',
  }),
]);

export function normalizeTags(
  tags?: readonly string[] | string[] | string | null
): string[] {
  if (!tags) return [];
  const rawList = typeof tags === 'string' ? [tags] : Array.isArray(tags) ? tags : [];
  return rawList.flatMap((t) =>
    typeof t === 'string'
      ? t
          .split(/[;,]/)
          .map((item) => item.trim())
          .filter(Boolean)
      : []
  );
}

export function resolveRoutingStep(
  stateOrColumn: string,
  tags?: readonly string[] | string[] | string | null
): StepDefinition | undefined {
  const normalizedTags = normalizeTags(tags);
  if (normalizedTags.some((t) => t.includes('[awaiting-input]'))) {
    return getStepByNumber(3);
  }
  const key = stateOrColumn?.trim().toLowerCase();
  switch (key) {
    case 'new':
    case 'to do':
    case 'proposed':
      return getStepByNumber(1);
    case 'ready to dev':
    case 'ready for dev':
      return getStepByNumber(2);
    case 'in dev':
    case 'doing':
    case 'active':
    case 'in progress':
      return getStepByNumber(3);
    case 'dev done':
    case 'ready for pr':
    case 'in pr review':
    case 'resolved':
      return getStepByNumber(4);
    case 'ready for qa':
    case 'in qa':
      return getStepByNumber(6);
    case 'ready to deploy':
    case 'ready to release':
    case 'in deployment':
    case 'in release':
      return getStepByNumber(7);
    case 'done':
    case 'closed':
      return getStepByNumber(9);
    default:
      return undefined;
  }
}

export function getStepByNumber(step: StepNumber): StepDefinition | undefined {
  return GOLDEN_PATH_V2.find((s) => s.step === step);
}

export function getStepsByColumn(column: ColumnId): readonly StepDefinition[] {
  return GOLDEN_PATH_V2.filter((s) => s.column === column);
}

export function getStepsByAdoState(state: string): readonly StepDefinition[] {
  return GOLDEN_PATH_V2.filter((s) => s.adoState === state);
}

// ponytail: static step descriptors; load from project taxonomy schema in v2.x
