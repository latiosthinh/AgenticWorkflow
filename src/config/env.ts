import 'dotenv/config';
import { z } from 'zod';
import { execFileSync } from 'node:child_process';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  STATE_STORE_DIR: z.string().default('./data/state'),
  ADO_ORG_URL: z.string().url(),
  ADO_PAT: z.string().min(1, 'ADO_PAT is required'),
  ADO_BOT_ID: z.string().min(1, 'ADO_BOT_ID is required'),
  ADO_WEBHOOK_SECRET: z.string().min(1, 'ADO_WEBHOOK_SECRET is required'),
  OPENAI_API_KEY: z.string().optional(),
  API_ENDPOINT: z.preprocess((val) => (val === '' ? undefined : val), z.string().url().optional()),
  API_KEY: z.preprocess((val) => (val === '' ? undefined : val), z.string().optional()),
  API_MODEL: z.string().default('gpt-4o'),
  LOCAL_AGENT_TYPE: z.literal('opencode'),
  OPENCODE_BIN: z.string().default('opencode').pipe(z.string().min(1, 'OPENCODE_BIN is required').refine(
    (val) => {
      if (process.env.NODE_ENV === 'test') return true;
      try {
        execFileSync(process.platform === 'win32' ? 'where' : 'which', [val], { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    },
    'OPENCODE_BIN not found on PATH — install opencode or set OPENCODE_BIN to absolute path'
  )),
  OPENCODE_TIMEOUT_MS: z.coerce.number().default(180_000),
  ADO_PROJECT: z.string().default('default-project'),
  ADO_REPOSITORY_ID: z.string().default('default-repo'),
  ADO_DEFAULT_BRANCH: z.string().default('main'),
  PREVIEW_URL_TEMPLATE: z.string().optional(),
  PR_URL_TEMPLATE: z.string().optional(),
  QA_TEST_COMMAND: z.string().default('npm run test:integration'),
  STAGING_HEALTH_URL: z.string().url().optional(),
  QA_TIMEOUT_MS: z.coerce.number().default(300_000),
  PRODUCTION_SMOKE_URL: z.string().url().optional(),
  SMOKE_TEST_COMMAND: z.string().default('npm run test:smoke'),
  SMOKE_TIMEOUT_MS: z.coerce.number().default(300_000),
  AZURE_APP_INSIGHTS_APP_ID: z.string().optional(),
  AZURE_APP_INSIGHTS_API_KEY: z.string().optional(),
  TELEMETRY_WINDOW_MINUTES: z.coerce.number().default(30),
  TELEMETRY_ERROR_THRESHOLD_PERCENT: z.coerce.number().default(1.0),
  TELEMETRY_P95_LATENCY_THRESHOLD_MS: z.coerce.number().default(500),
  ENABLE_ADO_POLLING: z.coerce.boolean().default(true),
  ADO_POLLING_INTERVAL_MS: z.coerce.number().default(10_000),
});

export type Env = z.infer<typeof EnvSchema>;

export const env = EnvSchema.parse(process.env);
// ponytail: crash early on invalid config; add dynamic vault provider in v2
