import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 15000,
    environment: 'node',
    fileParallelism: false,
    exclude: [...configDefaults.exclude, '**/.worktrees/**'],
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      ADO_ORG_URL: 'https://dev.azure.com/test-org',
      ADO_PAT: 'test-pat-token',
      ADO_BOT_ID: 'test-bot-id',
      ADO_WEBHOOK_SECRET: 'test-webhook-secret-12345',
      OPENAI_API_KEY: 'test-openai-api-key',
    },
  },
});
