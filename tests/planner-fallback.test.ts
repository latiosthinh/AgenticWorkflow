import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const { generateTextMock } = vi.hoisted(() => ({ generateTextMock: vi.fn() }));
vi.mock('ai', async (importOriginal) => {
  const mod = await importOriginal<typeof import('ai')>();
  return { ...mod, generateText: generateTextMock };
});

import { formulateImplementationPlan } from '../src/plan/planner.js';
import { PlanResultSchema } from '../src/plan/schema.js';
import { env } from '../src/config/env.js';

const clearTicket = {
  title: 'Add endpoint',
  description: 'Returns 200 with JSON',
  acceptanceCriteria: 'GET /x returns 200',
};

const validPlan = {
  hasAmbiguities: false,
  questions: [],
  planMarkdown: '### Implementation Steps\n1. Add route\n2. Add tests',
  estimatedFiles: ['src/routes.ts'],
  testStrategy: 'Run vitest unit suite',
};

describe('formulateImplementationPlan fallback (WIP-03 + WIP-02)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    generateTextMock.mockReset();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('LLM failure parks the ticket for human review instead of auto-proceeding', async () => {
    generateTextMock.mockRejectedValue(new Error('router down'));

    const res = await formulateImplementationPlan(clearTicket, { forceAi: true });

    expect(res.hasAmbiguities).toBe(true);
    expect(res.questions).toEqual(['LLM planning unavailable — human plan review required']);
    expect(res.planMarkdown).toBe('');
    expect(res.estimatedFiles).toEqual([]);
    expect(res.testStrategy).toBe('');
    expect(res.fallbackUsed).toBe(true);
    expect(res.model).toBe('deterministic-park');
    expect(warnSpy).toHaveBeenCalled();
    // boilerplate auto-proceed plan is gone
    expect(res.planMarkdown).not.toContain('Implement');
  });

  it('fallback result is schema-valid for the worker hasAmbiguities branch', async () => {
    generateTextMock.mockRejectedValue(new Error('router down'));

    const res = await formulateImplementationPlan(clearTicket, { forceAi: true });
    const parsed = PlanResultSchema.safeParse(res);

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.hasAmbiguities).toBe(true);
  });

  it('success path captures the actual response model and fallbackUsed:false', async () => {
    generateTextMock.mockResolvedValue({ output: validPlan, response: { modelId: 'router-actual-1' } });

    const res = await formulateImplementationPlan(clearTicket, { forceAi: true });

    expect(res.hasAmbiguities).toBe(false);
    expect(res.planMarkdown).toBe(validPlan.planMarkdown);
    expect(res.estimatedFiles).toEqual(validPlan.estimatedFiles);
    expect(res.fallbackUsed).toBe(false);
    expect(res.model).toBe('router-actual-1');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('success path without response.modelId falls back to env.API_MODEL', async () => {
    generateTextMock.mockResolvedValue({ output: validPlan, response: {} });

    const res = await formulateImplementationPlan(clearTicket, { forceAi: true });

    expect(res.fallbackUsed).toBe(false);
    expect(res.model).toBe(env.API_MODEL);
  });

  it('deterministic test-env branch (clear ticket) is unchanged and carries fallbackUsed:false', async () => {
    const res = await formulateImplementationPlan(clearTicket);

    expect(res.hasAmbiguities).toBe(false);
    expect(res.planMarkdown).toContain('### Implementation Steps');
    expect(res.estimatedFiles).toContain('src/service.ts');
    expect(res.fallbackUsed).toBe(false);
    expect(res.model).toBe(env.API_MODEL);
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('deterministic test-env branch (ambiguous ticket) is unchanged and carries fallbackUsed:false', async () => {
    const res = await formulateImplementationPlan({
      title: '[ambiguous] Add endpoint',
      description: 'Returns 200 with JSON',
      acceptanceCriteria: 'GET /x returns 200',
    });

    expect(res.hasAmbiguities).toBe(true);
    expect(res.questions.length).toBeGreaterThan(0);
    expect(res.fallbackUsed).toBe(false);
    expect(res.model).toBe(env.API_MODEL);
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('static guard: rework-worker never calls the planner; worker routes hasAmbiguities to createPlanCheckpoint', () => {
    const reworkSrc = readFileSync(new URL('../src/execute/rework-worker.ts', import.meta.url), 'utf8');
    expect(reworkSrc).not.toContain('formulateImplementationPlan');

    const workerSrc = readFileSync(new URL('../src/execute/worker.ts', import.meta.url), 'utf8');
    expect(workerSrc).toContain('plan.hasAmbiguities');
    expect(workerSrc).toContain('createPlanCheckpoint');
  });
});
