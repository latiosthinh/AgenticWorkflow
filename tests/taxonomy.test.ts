import { describe, it, expect } from 'vitest';
import {
  GOLDEN_PATH_V2,
  resolveRoutingStep,
  getStepByNumber,
  getStepsByColumn,
  getStepsByAdoState,
  type ColumnId,
  type StepNumber,
  type EvidenceLevel,
} from '../src/pipeline/taxonomy.js';

describe('Golden Path v2 Taxonomy Definition (TAX-01)', () => {
  it('defines exactly 9 steps covering all 5 columns and L1-L7 evidence levels', () => {
    expect(GOLDEN_PATH_V2).toHaveLength(9);

    const stepNumbers = GOLDEN_PATH_V2.map((s) => s.step);
    expect(stepNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const columns = new Set(GOLDEN_PATH_V2.map((s) => s.column));
    expect(columns).toEqual(
      new Set<ColumnId>([
        'REFINEMENT',
        'EXECUTION',
        'ACCEPTANCE',
        'RELEASE',
        'RETRO',
      ])
    );

    const allEvidenceLevels = new Set<EvidenceLevel>();
    for (const step of GOLDEN_PATH_V2) {
      for (const level of step.evidenceLevels) {
        allEvidenceLevels.add(level);
      }
    }
    expect(allEvidenceLevels).toEqual(
      new Set<EvidenceLevel>(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'])
    );
  });

  it('guarantees immutability via Object.freeze', () => {
    expect(Object.isFrozen(GOLDEN_PATH_V2)).toBe(true);
    for (const step of GOLDEN_PATH_V2) {
      expect(Object.isFrozen(step)).toBe(true);
      expect(Object.isFrozen(step.evidenceLevels)).toBe(true);
      if (step.keyTags) {
        expect(Object.isFrozen(step.keyTags)).toBe(true);
      }
    }
  });

  it('maps correct actor roles, detail strings, and evidence levels across all steps', () => {
    const step1 = getStepByNumber(1);
    expect(step1).toBeDefined();
    expect(step1?.name).toBe('Ticket & AC verify');
    expect(step1?.column).toBe('REFINEMENT');
    expect(step1?.actor).toBe('AI');
    expect(step1?.actorDetail).toBe('AI Agent');
    expect(step1?.evidenceLevels).toEqual(['L1']);
    expect(step1?.primaryEvidenceLevel).toBe('L1');
    expect(step1?.adoState).toBe('New');
    expect(step1?.gateType).toBe('automated_trigger');
    expect(step1?.keyTags).toEqual(['[audit-passed]', '[awaiting-scope-lock]']);

    const step2 = getStepByNumber(2);
    expect(step2).toBeDefined();
    expect(step2?.name).toBe('Scope review & verify');
    expect(step2?.column).toBe('REFINEMENT');
    expect(step2?.actor).toBe('Human');
    expect(step2?.actorDetail).toBe('Human PM');
    expect(step2?.evidenceLevels).toEqual(['L1']);
    expect(step2?.primaryEvidenceLevel).toBe('L1');
    expect(step2?.adoState).toBe('Ready to Dev');
    expect(step2?.gateType).toBe('human_verdict');
    expect(step2?.keyTags).toEqual(['[awaiting-scope-lock]', '[scope-locked]']);

    const step3 = getStepByNumber(3);
    expect(step3).toBeDefined();
    expect(step3?.name).toBe('Loop: Plan-Code-Test');
    expect(step3?.column).toBe('EXECUTION');
    expect(step3?.actor).toBe('AI');
    expect(step3?.actorDetail).toBe('AI Agent');
    expect(step3?.evidenceLevels).toEqual(['L2', 'L3']);
    expect(step3?.primaryEvidenceLevel).toBe('L3');
    expect(step3?.adoState).toBe('In Dev');
    expect(step3?.gateType).toBe('automated_trigger');
    expect(step3?.keyTags).toEqual(['[awaiting-input]']);

    const step4 = getStepByNumber(4);
    expect(step4).toBeDefined();
    expect(step4?.name).toBe('Dev validate & PR');
    expect(step4?.column).toBe('EXECUTION');
    expect(step4?.actor).toBe('Human');
    expect(step4?.actorDetail).toBe('Human Dev');
    expect(step4?.evidenceLevels).toEqual(['L2', 'L3']);
    expect(step4?.primaryEvidenceLevel).toBe('L2');
    expect(step4?.adoState).toBe('Dev Done');
    expect(step4?.gateType).toBe('human_verdict');
    expect(step4?.keyTags).toEqual(['[awaiting-acceptance]', '[acceptance-approved]']);

    const step5 = getStepByNumber(5);
    expect(step5).toBeDefined();
    expect(step5?.name).toBe('PR review & CI deploy');
    expect(step5?.column).toBe('ACCEPTANCE');
    expect(step5?.actor).toBe('Human');
    expect(step5?.actorDetail).toBe('Human TechLead/SA');
    expect(step5?.evidenceLevels).toEqual(['L3', 'L4']);
    expect(step5?.primaryEvidenceLevel).toBe('L4');
    expect(step5?.adoState).toBe('Dev Done');
    expect(step5?.gateType).toBe('human_verdict');
    expect(step5?.keyTags).toEqual(['[pr-merged]']);

    const step6 = getStepByNumber(6);
    expect(step6).toBeDefined();
    expect(step6?.name).toBe('QA staging verify');
    expect(step6?.column).toBe('ACCEPTANCE');
    expect(step6?.actor).toBe('Human');
    expect(step6?.actorDetail).toBe('Human QA');
    expect(step6?.evidenceLevels).toEqual(['L3', 'L5']);
    expect(step6?.primaryEvidenceLevel).toBe('L5');
    expect(step6?.adoState).toBe('Ready for QA');
    expect(step6?.gateType).toBe('human_verdict');
    expect(step6?.keyTags).toEqual(['[qa-verified]', '[qa-failed]']);

    const step7 = getStepByNumber(7);
    expect(step7).toBeDefined();
    expect(step7?.name).toBe('Release approval + deploy');
    expect(step7?.column).toBe('RELEASE');
    expect(step7?.actor).toBe('Human');
    expect(step7?.actorDetail).toBe('Human QA/SA/Lead/PM');
    expect(step7?.evidenceLevels).toEqual(['L5']);
    expect(step7?.primaryEvidenceLevel).toBe('L5');
    expect(step7?.adoState).toBe('Ready to Deploy');
    expect(step7?.gateType).toBe('human_verdict');
    expect(step7?.keyTags).toEqual(['[deploying]']);

    const step8 = getStepByNumber(8);
    expect(step8).toBeDefined();
    expect(step8?.name).toBe('Smoke test & monitor');
    expect(step8?.column).toBe('RELEASE');
    expect(step8?.actor).toBe('AI');
    expect(step8?.actorDetail).toBe('AI / Automation');
    expect(step8?.evidenceLevels).toEqual(['L6']);
    expect(step8?.primaryEvidenceLevel).toBe('L6');
    expect(step8?.adoState).toBe('Ready to Deploy');
    expect(step8?.gateType).toBe('automated_trigger');
    expect(step8?.keyTags).toEqual(['[deploy-regressed]', '[smoke-harness-error]']);

    const step9 = getStepByNumber(9);
    expect(step9).toBeDefined();
    expect(step9?.name).toBe('Retro takeaways, docs, skill enhancement');
    expect(step9?.column).toBe('RETRO');
    expect(step9?.actor).toBe('AI');
    expect(step9?.actorDetail).toBe('AI Agent & Team');
    expect(step9?.evidenceLevels).toEqual(['L7']);
    expect(step9?.primaryEvidenceLevel).toBe('L7');
    expect(step9?.adoState).toBe('Done');
    expect(step9?.gateType).toBe('automated_trigger');
    expect(step9?.keyTags).toEqual(['[golden-path-complete]', '[retro-failed]']);
  });
});

describe('Taxonomy Resolution Helpers (TAX-03)', () => {
  it('resolves routing steps by ADO state and tags', () => {
    expect(resolveRoutingStep('New')?.step).toBe(1);
    expect(resolveRoutingStep('Ready to Dev')?.step).toBe(2);
    expect(resolveRoutingStep('In Dev')?.step).toBe(3);
    expect(resolveRoutingStep('AnyState', ['[awaiting-input]'])?.step).toBe(3);
    expect(resolveRoutingStep('AnyState', 'backend; [awaiting-input]')?.step).toBe(3);
    expect(resolveRoutingStep('Dev Done')?.step).toBe(4);
    expect(resolveRoutingStep('Ready for QA')?.step).toBe(6);
    expect(resolveRoutingStep('Ready to Deploy')?.step).toBe(7);
    expect(resolveRoutingStep('Done')?.step).toBe(9);
    expect(resolveRoutingStep('UnknownState')).toBeUndefined();
    expect(resolveRoutingStep('Blocked')).toBeUndefined();
  });

  it('filters steps by column and state', () => {
    expect(getStepsByColumn('REFINEMENT')).toHaveLength(2);
    expect(getStepsByColumn('EXECUTION')).toHaveLength(2);
    expect(getStepsByColumn('ACCEPTANCE')).toHaveLength(2);
    expect(getStepsByColumn('RELEASE')).toHaveLength(2);
    expect(getStepsByColumn('RETRO')).toHaveLength(1);

    expect(getStepsByAdoState('New')).toHaveLength(1);
    expect(getStepsByAdoState('Ready to Dev')).toHaveLength(1);
    expect(getStepsByAdoState('In Dev')).toHaveLength(1);
    expect(getStepsByAdoState('Dev Done')).toHaveLength(2); // Step 4 and Step 5
    expect(getStepsByAdoState('Ready for QA')).toHaveLength(1);
    expect(getStepsByAdoState('Ready to Deploy')).toHaveLength(2); // Step 7 and Step 8
    expect(getStepsByAdoState('Done')).toHaveLength(1);
    expect(getStepsByAdoState('NonExistentState')).toHaveLength(0);
  });

  it('retrieves steps by valid and invalid step numbers', () => {
    for (let i = 1; i <= 9; i++) {
      expect(getStepByNumber(i as StepNumber)?.step).toBe(i);
    }
    expect(getStepByNumber(0 as StepNumber)).toBeUndefined();
    expect(getStepByNumber(10 as StepNumber)).toBeUndefined();
  });
});
