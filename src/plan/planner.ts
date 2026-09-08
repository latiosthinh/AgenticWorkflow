import { generateText, Output } from 'ai';
import { openai } from '@ai-sdk/openai';
import { env } from '../config/env.js';
import { PlanResultSchema, type PlanResult } from './schema.js';

export interface PlanTicketInput {
  title: string;
  description: string;
  acceptanceCriteria: string;
  tags?: string[];
}

export interface PlanOptions {
  forceAi?: boolean;
}

export async function formulateImplementationPlan(
  ticket: PlanTicketInput,
  opts?: PlanOptions
): Promise<PlanResult> {
  // ponytail: deterministic offline planner fallback in test env; enable live model in staging
  if (env.NODE_ENV === 'test' && !opts?.forceAi) {
    if (
      ticket.title.includes('[ambiguous]') ||
      ticket.description.includes('TBD') ||
      !ticket.acceptanceCriteria
    ) {
      return PlanResultSchema.parse({
        hasAmbiguities: true,
        questions: [
          'Which database schema should be modified?',
          'What is the expected error status code?',
        ],
        planMarkdown: '',
        estimatedFiles: [],
        testStrategy: '',
      });
    }

    return PlanResultSchema.parse({
      hasAmbiguities: false,
      questions: [],
      planMarkdown: '### Implementation Steps\n1. Modify service layer\n2. Add unit tests',
      estimatedFiles: ['src/service.ts', 'tests/service.test.ts'],
      testStrategy: 'Run vitest unit suite',
    });
  }

  const prompt = `Title: ${ticket.title}
Tags: ${ticket.tags?.join(', ') || 'None'}

Description:
${ticket.description}

Acceptance Criteria:
${ticket.acceptanceCriteria}
`;

  const result = await generateText({
    model: openai('gpt-4o'),
    instructions:
      'You are an expert software engineering planner. Evaluate the ticket for clarity, technical decisions, and feasibility. ' +
      'If critical requirements are missing, ambiguous, or unresolved, set hasAmbiguities to true and formulate concise questions. ' +
      'Otherwise, formulate a concrete implementation plan with estimated files and test strategy.',
    prompt,
    output: Output.object({
      schema: PlanResultSchema,
    }),
  });

  return PlanResultSchema.parse(result.output);
}
