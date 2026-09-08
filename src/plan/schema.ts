import { z } from 'zod';

export const PlanResultSchema = z.object({
  hasAmbiguities: z
    .boolean()
    .describe('True if clarification from human developer is required before coding'),
  questions: z
    .array(z.string())
    .describe('Structured questions addressing missing technical decisions or ambiguities'),
  planMarkdown: z.string().describe('Concrete step-by-step implementation plan'),
  estimatedFiles: z
    .array(z.string())
    .describe('List of files to be created or modified'),
  testStrategy: z
    .string()
    .describe('Unit and integration testing plan to verify changes'),
});

export type PlanResult = z.infer<typeof PlanResultSchema>;
