import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from '../src/config/env.js';
import {
  getKnownSecrets,
  scrubOutput,
  SENSITIVE_VALUE_PATTERN,
  runCommand,
} from '../src/sandbox/runner.js';
import { executeRepairLoop } from '../src/execute/repair.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';

describe('Known Secrets Scrubbing in Repair Loop & Sandboxes (REL-09)', () => {
  let harness: TestStateStoreContext;
  const originalStateDir = env.STATE_STORE_DIR;
  const originalPat = env.ADO_PAT;
  const originalWebhook = env.ADO_WEBHOOK_SECRET;
  const originalApiKey = env.API_KEY;
  const originalOpenAiKey = env.OPENAI_API_KEY;

  beforeEach(() => {
    harness = createTestStateStore();
    (env as any).STATE_STORE_DIR = harness.tempDir;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (env as any).STATE_STORE_DIR = originalStateDir;
    (env as any).ADO_PAT = originalPat;
    (env as any).ADO_WEBHOOK_SECRET = originalWebhook;
    (env as any).API_KEY = originalApiKey;
    (env as any).OPENAI_API_KEY = originalOpenAiKey;
    harness.cleanup();
  });

  describe('getKnownSecrets helper', () => {
    it('returns array of populated secrets from environment', () => {
      (env as any).ADO_PAT = 'mock-ado-pat-secret-value-12345';
      (env as any).ADO_WEBHOOK_SECRET = 'mock-webhook-secret-999';
      (env as any).API_KEY = 'mock-api-key-abc';
      (env as any).OPENAI_API_KEY = 'sk-mock-openai-key-xyz';

      const secrets = getKnownSecrets();
      expect(secrets).toContain('mock-ado-pat-secret-value-12345');
      expect(secrets).toContain('mock-webhook-secret-999');
      expect(secrets).toContain('mock-api-key-abc');
      expect(secrets).toContain('sk-mock-openai-key-xyz');
    });

    it('filters out empty or undefined secrets', () => {
      (env as any).ADO_PAT = '';
      (env as any).ADO_WEBHOOK_SECRET = undefined;
      (env as any).API_KEY = 'valid-key';
      (env as any).OPENAI_API_KEY = '';

      const secrets = getKnownSecrets();
      expect(secrets).toEqual(['valid-key']);
    });
  });

  describe('scrubOutput pattern and string scrubbing', () => {
    it('scrubs raw 52-character ADO PATs without prefixes', () => {
      // 52-character alphanumeric ADO PAT
      const raw52Pat = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP';
      expect(raw52Pat.length).toBe(52);

      const noisyOutput = `Connecting to Azure DevOps with PAT: ${raw52Pat} ... Error 401`;
      const scrubbed = scrubOutput(noisyOutput);

      expect(scrubbed).not.toContain(raw52Pat);
      expect(scrubbed).toContain('[REDACTED]');
      expect(scrubbed).toBe('Connecting to Azure DevOps with PAT: [REDACTED] ... Error 401');
    });

    it('scrubs Bearer tokens and GitHub PATs', () => {
      const ghpToken = 'ghp_1234567890abcdefghijklmnopqrstuvwxyz';
      const bearerToken = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig';

      const log = `Auth header: ${bearerToken}, Github: ${ghpToken}`;
      const scrubbed = scrubOutput(log);

      expect(scrubbed).not.toContain(ghpToken);
      expect(scrubbed).not.toContain('eyJhbGciOi');
      expect(scrubbed).toContain('Bearer [REDACTED]');
      expect(scrubbed).toContain('[REDACTED]');
    });

    it('scrubs explicit knownSecrets strings passed to scrubOutput', () => {
      const customSecret = 'super-secret-password-xyz';
      const text = `Failed command output: secret=${customSecret} in environment`;

      const scrubbed = scrubOutput(text, [customSecret]);
      expect(scrubbed).not.toContain(customSecret);
      expect(scrubbed).toBe('Failed command output: secret=[REDACTED] in environment');
    });
  });

  describe('executeRepairLoop knownSecrets propagation', () => {
    it('passes knownSecrets and scrubs raw PAT and secrets from returned diagnostics', async () => {
      const workItemId = 8801;
      const testSecretPat = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP'; // 52 chars
      const explicitSecret = 'custom-db-secret-key-9999';

      const mockGit = {
        diff: vi.fn().mockResolvedValue(''),
        status: vi.fn().mockResolvedValue({ not_added: [], staged: [], isClean: () => true }),
        checkout: vi.fn().mockResolvedValue(undefined),
        add: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue(undefined),
        push: vi.fn().mockResolvedValue(undefined),
      };

      const failingTestResult = {
        passed: false,
        exitCode: 1,
        stdout: `FAIL tests/unit.test.ts > fails\nAssertionError: Expected 200 with PAT: ${testSecretPat}\n  at test.ts:10 with secret ${explicitSecret}`,
        stderr: `Error: Connection failure with token ${testSecretPat}`,
        timedOut: false,
        durationMs: 250,
      };

      const mockTestRunner = vi.fn().mockResolvedValue(failingTestResult);
      const mockOpenCodeRunner = vi.fn().mockResolvedValue({ exitCode: 0 });

      const repairResult = await executeRepairLoop({
        worktreePath: harness.tempDir,
        git: mockGit as any,
        workItemId,
        maxCycles: 2,
        knownSecrets: [explicitSecret, testSecretPat],
        mockTestRunner,
        mockOpenCodeRunner,
      });

      expect(repairResult.success).toBe(false);
      expect(repairResult.diagnostics).toBeDefined();

      // Diagnostics must not leak the raw 52-char PAT or the explicit secret
      expect(repairResult.diagnostics).not.toContain(testSecretPat);
      expect(repairResult.diagnostics).not.toContain(explicitSecret);
      expect(repairResult.diagnostics).toContain('[REDACTED]');
    });
  });
});
