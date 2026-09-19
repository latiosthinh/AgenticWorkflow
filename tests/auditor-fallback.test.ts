import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { generateTextMock } = vi.hoisted(() => ({ generateTextMock: vi.fn() }));
vi.mock('ai', async (importOriginal) => {
  const mod = await importOriginal<typeof import('ai')>();
  return { ...mod, generateText: generateTextMock };
});

import { auditTicketContract } from '../src/auditor/evaluator.js';
import { env } from '../src/config/env.js';

const passingTicket = {
  title: 'Add user endpoint',
  description: 'API service returns 200 response',
  acceptanceCriteria: 'Given a user, when GET /users, then returns 200 with JSON body',
};

const failingTicket = {
  title: 'Add user endpoint',
  description: 'API service response format TBD',
  acceptanceCriteria: 'Given a user, when GET /users, then returns 200 with JSON body',
};

const validAudit = {
  passed: true,
  reasons: ['LLM judged criteria complete'],
  criteria_summary: 'LLM-produced summary of the contract audit.',
};

describe('auditTicketContract fallback evidence (WIP-02)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    generateTextMock.mockReset();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('LLM failure returns deterministic DoD rubric result stamped fallbackUsed:true + producer "deterministic-rubric"', async () => {
    generateTextMock.mockRejectedValue(new Error('router down'));

    const res = await auditTicketContract(passingTicket, { forceAi: true });

    expect(res.passed).toBe(true);
    expect(res.reasons.length).toBe(3);
    expect(res.criteria_summary).toContain('satisfies Definition of Done');
    expect(res.fallbackUsed).toBe(true);
    expect(res.model).toBe('deterministic-rubric');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('LLM failure on a failing ticket returns passed:false rubric result with fallbackUsed:true', async () => {
    generateTextMock.mockRejectedValue(new Error('router down'));

    const res = await auditTicketContract(failingTicket, { forceAi: true });

    expect(res.passed).toBe(false);
    expect(res.reasons.join(' ')).toMatch(/Completeness/);
    expect(res.fallbackUsed).toBe(true);
    expect(res.model).toBe('deterministic-rubric');
  });

  it('success path captures the actual response model and fallbackUsed:false', async () => {
    generateTextMock.mockResolvedValue({ output: validAudit, response: { modelId: 'm-actual' } });

    const res = await auditTicketContract(passingTicket, { forceAi: true });

    expect(res.passed).toBe(true);
    expect(res.reasons).toEqual(validAudit.reasons);
    expect(res.criteria_summary).toBe(validAudit.criteria_summary);
    expect(res.fallbackUsed).toBe(false);
    expect(res.model).toBe('m-actual');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('success path without response.modelId falls back to env.API_MODEL', async () => {
    generateTextMock.mockResolvedValue({ output: validAudit, response: {} });

    const res = await auditTicketContract(passingTicket, { forceAi: true });

    expect(res.fallbackUsed).toBe(false);
    expect(res.model).toBe(env.API_MODEL);
  });

  it('deterministic test-env path carries fallbackUsed:false + resolved model without calling the LLM', async () => {
    const res = await auditTicketContract(passingTicket);

    expect(res.passed).toBe(true);
    expect(res.fallbackUsed).toBe(false);
    expect(res.model).toBe(env.API_MODEL);
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('mock path carries fallbackUsed:false + model "mock"', async () => {
    const res = await auditTicketContract(passingTicket, { mock: async () => validAudit });

    expect(res.passed).toBe(true);
    expect(res.reasons).toEqual(validAudit.reasons);
    expect(res.fallbackUsed).toBe(false);
    expect(res.model).toBe('mock');
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
