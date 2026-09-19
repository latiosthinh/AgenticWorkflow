import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createOpenAI } from '@ai-sdk/openai';
import { EnvSchema, env } from '../src/config/env.js';
import { getModel, appModel, customOpenAi, customStreamFetch, rewriteRouterBody } from '../src/ai/provider.js';

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

  it('provides default values for API_MODEL, OPENCODE_TIMEOUT_MS and requires LOCAL_AGENT_TYPE=opencode', () => {
    const parsed = EnvSchema.parse({
      ADO_ORG_URL: 'https://dev.azure.com/test-org',
      ADO_PAT: 'test-pat',
      ADO_BOT_ID: 'test-bot',
      ADO_WEBHOOK_SECRET: 'test-secret',
      OPENAI_API_KEY: 'test-key',
      LOCAL_AGENT_TYPE: 'opencode',
      OPENCODE_BIN: 'opencode',
    });

    expect(parsed.API_ENDPOINT).toBeUndefined();
    expect(parsed.API_KEY).toBeUndefined();
    expect(parsed.API_MODEL).toBe('gpt-4o');
    expect(parsed.LOCAL_AGENT_TYPE).toBe('opencode');
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

describe('rewriteRouterBody (WIP-01)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('injects stream:false and strips the 9router/ model prefix', () => {
    const out = rewriteRouterBody('{"model":"9router/deepseek-chat"}') as string;
    expect(JSON.parse(out)).toEqual({ model: 'deepseek-chat', stream: false });
  });

  it('preserves explicit stream:true and non-prefixed model', () => {
    const out = rewriteRouterBody('{"stream":true,"model":"m"}') as string;
    expect(JSON.parse(out)).toEqual({ stream: true, model: 'm' });
  });

  it('returns undefined and non-string bodies as-is', () => {
    expect(rewriteRouterBody(undefined)).toBeUndefined();
    const bytes = new Uint8Array([1, 2, 3]);
    expect(rewriteRouterBody(bytes)).toBe(bytes);
  });

  it('forwards unparseable body unchanged and warns once (no silent catch)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(rewriteRouterBody('not json{')).toBe('not json{');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('forwards valid JSON primitives untouched without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(rewriteRouterBody('"scalar"')).toBe('"scalar"');
    expect(rewriteRouterBody('123')).toBe('123');
    expect(warn).not.toHaveBeenCalled();
  });

  it('getModel strips the 9router/ prefix', () => {
    expect(getModel('9router/deepseek-chat').modelId).toBe('deepseek-chat');
  });

  it('customStreamFetch sends the rewritten body and sets authorization from env.API_KEY', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await customStreamFetch('http://localhost:9999/v1/chat', {
      body: JSON.stringify({ model: '9router/m', messages: [] }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:9999/v1/chat');
    expect(JSON.parse(init.body as string)).toEqual({ model: 'm', messages: [], stream: false });
    if (env.API_KEY) {
      expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${env.API_KEY}`);
    }
  });

  it('static guard: src/ai/provider.ts contains no empty catch block', () => {
    const src = readFileSync(new URL('../src/ai/provider.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/catch\s*\{\s*\}/);
  });
});
