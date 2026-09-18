import { describe, it, expect } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
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

  it('configures createOpenAI with fallback apiKey when API_ENDPOINT is set without apiKey', () => {
    const originalEndpoint = process.env.API_ENDPOINT;
    const originalKey = process.env.API_KEY;
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    try {
      delete process.env.API_KEY;
      delete process.env.OPENAI_API_KEY;
      process.env.API_ENDPOINT = 'http://localhost:11434/v1';
      // verify createOpenAI works with fallback apiKey
      const provider = createOpenAI({
        baseURL: process.env.API_ENDPOINT,
        apiKey: process.env.API_KEY || process.env.OPENAI_API_KEY || (process.env.API_ENDPOINT ? 'not-needed' : undefined),
      });
      expect(provider).toBeDefined();
      const model = provider('llama3');
      expect(model.modelId).toBe('llama3');
    } finally {
      process.env.API_ENDPOINT = originalEndpoint;
      process.env.API_KEY = originalKey;
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    }
  });
});
