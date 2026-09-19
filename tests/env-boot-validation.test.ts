import { describe, it, expect } from 'vitest';
import { EnvSchema } from '../src/config/env.js';

const BASE_ENV = {
  ADO_ORG_URL: 'https://dev.azure.com/test-org',
  ADO_PAT: 'test-pat',
  ADO_BOT_ID: 'test-bot',
  ADO_WEBHOOK_SECRET: 'test-secret',
  NODE_ENV: 'test',
};

describe('Boot validation: LOCAL_AGENT_TYPE and OPENCODE_BIN', () => {
  it('fails fast when LOCAL_AGENT_TYPE is unset', () => {
    expect(() =>
      EnvSchema.parse({ ...BASE_ENV, OPENCODE_BIN: 'opencode' })
    ).toThrow();
  });

  it('fails fast when LOCAL_AGENT_TYPE is built-in', () => {
    expect(() =>
      EnvSchema.parse({ ...BASE_ENV, LOCAL_AGENT_TYPE: 'built-in', OPENCODE_BIN: 'opencode' })
    ).toThrow();
  });

  it('accepts LOCAL_AGENT_TYPE=opencode', () => {
    const parsed = EnvSchema.parse({ ...BASE_ENV, LOCAL_AGENT_TYPE: 'opencode', OPENCODE_BIN: 'opencode' });
    expect(parsed.LOCAL_AGENT_TYPE).toBe('opencode');
  });

  it('fails fast when OPENCODE_BIN is empty', () => {
    expect(() =>
      EnvSchema.parse({ ...BASE_ENV, LOCAL_AGENT_TYPE: 'opencode', OPENCODE_BIN: '' })
    ).toThrow();
  });

  it('accepts OPENCODE_BIN as existing absolute path outside test mode', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const parsed = EnvSchema.parse({
        ...BASE_ENV,
        NODE_ENV: 'production',
        LOCAL_AGENT_TYPE: 'opencode',
        OPENCODE_BIN: process.execPath,
        APPROVER_IDS: 'approver1@example.com',
      });
      expect(parsed.OPENCODE_BIN).toBe(process.execPath);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('fails fast when APPROVER_IDS is missing in production', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(() =>
        EnvSchema.parse({
          ...BASE_ENV,
          NODE_ENV: 'production',
          LOCAL_AGENT_TYPE: 'opencode',
          OPENCODE_BIN: process.execPath,
        })
      ).toThrow(/APPROVER_IDS is required/);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
