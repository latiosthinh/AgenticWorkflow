import { describe, it, expect } from 'vitest';
import { PlanResultSchema } from '../src/plan/schema.js';
import { formulateImplementationPlan } from '../src/plan/planner.js';
import {
  formatPlanQuestionsComment,
  formatPlanLockedComment,
} from '../src/plan/formatter.js';

describe('PlanResultSchema', () => {
  it('validates a valid ambiguous plan result', () => {
    const valid = {
      hasAmbiguities: true,
      questions: ['What error status should be returned?'],
      planMarkdown: '',
      estimatedFiles: [],
      testStrategy: '',
    };
    const parsed = PlanResultSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('validates a valid clear plan result', () => {
    const valid = {
      hasAmbiguities: false,
      questions: [],
      planMarkdown: 'Step 1: add migration\nStep 2: add endpoint',
      estimatedFiles: ['src/api.ts'],
      testStrategy: 'vitest run tests/api.test.ts',
    };
    const parsed = PlanResultSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid plan result missing required fields', () => {
    const invalid = {
      hasAmbiguities: false,
      // missing questions, planMarkdown, estimatedFiles, testStrategy
    };
    const parsed = PlanResultSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });
});

describe('formulateImplementationPlan', () => {
  it('returns ambiguous result when title contains [ambiguous]', async () => {
    const res = await formulateImplementationPlan({
      title: '[ambiguous] User auth endpoint',
      description: 'Implement auth',
      acceptanceCriteria: 'Given user credentials, return token',
    });
    expect(res.hasAmbiguities).toBe(true);
    expect(res.questions.length).toBeGreaterThan(0);
    expect(res.planMarkdown).toBe('');
    expect(res.estimatedFiles).toEqual([]);
  });

  it('returns ambiguous result when description contains TBD', async () => {
    const res = await formulateImplementationPlan({
      title: 'User auth endpoint',
      description: 'Implement auth with session store TBD',
      acceptanceCriteria: 'Given user credentials, return token',
    });
    expect(res.hasAmbiguities).toBe(true);
    expect(res.questions.length).toBeGreaterThan(0);
  });

  it('returns ambiguous result when acceptance criteria is missing', async () => {
    const res = await formulateImplementationPlan({
      title: 'User auth endpoint',
      description: 'Implement auth',
      acceptanceCriteria: '',
    });
    expect(res.hasAmbiguities).toBe(true);
    expect(res.questions.length).toBeGreaterThan(0);
  });

  it('returns concrete plan when ticket is clear', async () => {
    const res = await formulateImplementationPlan({
      title: 'Implement user password reset',
      description: 'Provide an endpoint to reset forgotten passwords',
      acceptanceCriteria: 'Given valid token, reset password and return 200 OK',
    });
    expect(res.hasAmbiguities).toBe(false);
    expect(res.questions).toEqual([]);
    expect(res.planMarkdown).toContain('### Implementation Steps');
    expect(res.estimatedFiles).toContain('src/service.ts');
    expect(res.testStrategy).toContain('vitest');
  });
});

describe('Plan Comment Formatters', () => {
  it('formatPlanQuestionsComment outputs sanitized HTML with header and bot marker', () => {
    const questions = [
      'Which database schema should be modified?',
      'What HTTP status code should be returned?',
    ];
    const html = formatPlanQuestionsComment(questions);
    expect(html).toMatch(/\[Plan Q(&amp;|&)A\]/);
    expect(html).toContain('Implementation Clarification Required');
    expect(html).toContain('<li>Which database schema should be modified?</li>');
    expect(html).toContain('[awaiting-input]');
    expect(html).toContain('<!-- [automated-agent] -->');
  });

  it('formatPlanLockedComment outputs sanitized HTML with header and bot marker', () => {
    const plan = '1. Create migration\n2. Add endpoint handler';
    const files = ['src/routes.ts', 'src/db/schema.ts'];
    const html = formatPlanLockedComment(plan, files);
    expect(html).toContain('[Plan Checkpoint]');
    expect(html).toContain('Implementation Plan Locked');
    expect(html).toContain('<code>src/routes.ts</code>');
    expect(html).toContain('<!-- [automated-agent] -->');
  });
});
