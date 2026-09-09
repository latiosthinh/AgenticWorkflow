import 'dotenv/config';
import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_PATH: z.string().default('./data/gateway.db'),
  ADO_ORG_URL: z.string().url(),
  ADO_PAT: z.string().min(1, 'ADO_PAT is required'),
  ADO_BOT_ID: z.string().min(1, 'ADO_BOT_ID is required'),
  ADO_WEBHOOK_SECRET: z.string().min(1, 'ADO_WEBHOOK_SECRET is required'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  PREVIEW_URL_TEMPLATE: z.string().optional(),
  PR_URL_TEMPLATE: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export const env = EnvSchema.parse(process.env);
// ponytail: crash early on invalid config; add dynamic vault provider in v2
