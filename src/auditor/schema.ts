import { z } from 'zod';

export const AuditResultSchema = z.object({
  passed: z.boolean().describe('True if work item satisfies Definition of Done, false otherwise'),
  reasons: z.array(z.string()).describe('Checklist of met criteria if passed; specific missing requirements if failed'),
  criteria_summary: z.string().describe('Executive evaluation of acceptance criteria testability, persona clarity, and scope completeness'),
});

export type AuditResult = z.infer<typeof AuditResultSchema>;
