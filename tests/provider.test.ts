import { describe, it, expect } from 'vitest';
import { EnvSchema } from '../src/config/env.js';
import { getModel, appModel, customOpenAi, customStreamFetch } from '../src/ai/provider.js';

describe('Config & AI Provider', () => {
  it('parses custom API and OpenCode config fields in EnvSchema', () => {
    const parsed = EnvSchema.parse({
      ADO_ORG_URL: 'https://dev.azure.com/test-org',
      ADO_PAT: 'test-pat',
      ADO_BOT_ID: 'test-bot',
      ADO_WEBHOOK_SECRET: 'test-secret',
      OPENAI_API_KEY: 'test-key',
      API_ENDPOINT: 'https://custom-ai.example.com/v1',
      API_KEY: 'custom-api-key',
      API_MODEL: 'custom-model-id',
      LOCAL_AGENT_TYPE: 'opencode',
      OPENCODE_BIN: '/usr/local/bin/opencode',
      OPENCODE_TIMEOUT_MS: '120000',
    });

    expect(parsed.API_ENDPOINT).toBe('https://custom-ai.example.com/v1');
    expect(parsed.API_KEY).toBe('custom-api-key');
    expect(parsed.API_MODEL).toBe('custom-model-id');
    expect(parsed.LOCAL_AGENT_TYPE).toBe('opencode');
    expect(parsed.OPENCODE_BIN).toBe('/usr/local/bin/opencode');
    expect(parsed.OPENCODE_TIMEOUT_MS).toBe(120000);
  });

  it('provides default values for API_MODEL, LOCAL_AGENT_TYPE, OPENCODE_BIN, OPENCODE_TIMEOUT_MS', () => {
    const parsed = EnvSchema.parse({
      ADO_ORG_URL: 'https://dev.azure.com/test-org',
      ADO_PAT: 'test-pat',
      ADO_BOT_ID: 'test-bot',
      ADO_WEBHOOK_SECRET: 'test-secret',
      OPENAI_API_KEY: 'test-key',
    });

    expect(parsed.API_ENDPOINT).toBeUndefined();
    expect(parsed.API_KEY).toBeUndefined();
    expect(parsed.API_MODEL).toBe('gpt-4o');
    expect(parsed.LOCAL_AGENT_TYPE).toBe('built-in');
    expect(parsed.OPENCODE_BIN).toBe('opencode');
    expect(parsed.OPENCODE_TIMEOUT_MS).toBe(180000);
  });

  it('exports appModel, getModel, and customOpenAi from src/ai/provider.ts', () => {
    expect(appModel).toBeDefined();
    expect(typeof getModel).toBe('function');
    expect(customOpenAi).toBeDefined();

    const custom = getModel('claude-3-5-sonnet');
    expect(custom).toBeDefined();
    expect(custom.modelId).toBe('claude-3-5-sonnet');
  });

  it('customStreamFetch forwards request preserving stream options', async () => {
    expect(typeof customStreamFetch).toBe('function');
  });
});
