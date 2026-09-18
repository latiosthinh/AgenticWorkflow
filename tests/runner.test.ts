import { describe, it, expect } from 'vitest';
import {
  sanitizeEnv,
  scrubOutput,
  truncateBuffer,
  runCommand,
  MAX_OUTPUT_BYTES,
} from '../src/sandbox/runner.js';

describe('subprocess runner', () => {
  describe('sanitizeEnv', () => {
    it('strips sensitive environment variables matching PAT, API_KEY, TOKEN, SECRET, PASSWORD, PASSWD, CREDENTIAL', () => {
      const sanitized = sanitizeEnv({
        ADO_PAT: 'pat-secret-value-12345',
        OPENAI_API_KEY: 'sk-proj-secret-key',
        MY_SECRET_TOKEN: 'token-abc-xyz',
        APP_SECRET: 'super-app-secret',
        DB_PASSWORD: 'super-secret-db-pass',
        USER_PASSWD: 'secret-user-passwd',
        AWS_CREDENTIAL: 'aws-secret-credential',
        SSH_PRIVATE_KEY: 'ssh-rsa-priv-key',
        CUSTOM_SAFE_FLAG: 'true',
        NODE_ENV: 'test',
      });

      expect(sanitized.ADO_PAT).toBeUndefined();
      expect(sanitized.OPENAI_API_KEY).toBeUndefined();
      expect(sanitized.MY_SECRET_TOKEN).toBeUndefined();
      expect(sanitized.APP_SECRET).toBeUndefined();
      expect(sanitized.DB_PASSWORD).toBeUndefined();
      expect(sanitized.USER_PASSWD).toBeUndefined();
      expect(sanitized.AWS_CREDENTIAL).toBeUndefined();
      expect(sanitized.SSH_PRIVATE_KEY).toBeUndefined();
      expect(sanitized.CUSTOM_SAFE_FLAG).toBe('true');
      expect(sanitized.NODE_ENV).toBe('test');
      expect(sanitized.PATH).toBeDefined();
      expect(sanitized.APPDATA).toBeDefined();
      expect(sanitized.LOCALAPPDATA).toBeDefined();
    });
  });

  describe('scrubOutput', () => {
    it('redacts bearer tokens, GitHub PATs, and explicit known secret strings', () => {
      const inputBearer = 'HTTP Header Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test.sig sent';
      expect(scrubOutput(inputBearer)).toBe('HTTP Header Authorization: Bearer [REDACTED] sent');

      const inputGhp = 'Clone url https://ghp_123456789012345678901234567890123456@github.com/repo.git';
      expect(scrubOutput(inputGhp)).toBe('Clone url https://[REDACTED]@github.com/repo.git');

      const inputAdo = 'ADO credential: ado-1234567890123456789012345678901234567890';
      expect(scrubOutput(inputAdo)).toBe('ADO credential: [REDACTED]');

      const customText = 'Database connected at postgres://user:super_secret_pw_99@db:5432/app';
      expect(scrubOutput(customText, ['super_secret_pw_99'])).toBe(
        'Database connected at postgres://user:[REDACTED]@db:5432/app'
      );
    });

    it('ignores secrets shorter than 4 characters to avoid corrupting output', () => {
      const input = 'value: abc';
      expect(scrubOutput(input, ['abc', 'a', ''])).toBe('value: abc');
    });
  });

  describe('truncateBuffer', () => {
    it('preserves text within MAX_OUTPUT_BYTES limit', () => {
      const text = 'Normal command output line 1\nNormal command output line 2';
      expect(truncateBuffer(text)).toBe(text);
    });

    it('truncates 100KB output to <= 50KB with [...truncated...] indicator', () => {
      const largeOutput = 'X'.repeat(100 * 1024);
      const truncated = truncateBuffer(largeOutput);

      expect(truncated.endsWith('\n[...truncated...]')).toBe(true);
      expect(Buffer.byteLength(truncated, 'utf8')).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);
    });
  });

  describe('runCommand', () => {
    it('captures stdout and stderr from child process', async () => {
      const res = await runCommand(
        process.execPath,
        ['-e', 'console.log("runner stdout message"); console.error("runner stderr message");'],
        { cwd: process.cwd() }
      );

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toBe('runner stdout message');
      expect(res.stderr).toBe('runner stderr message');
      expect(res.timedOut).toBe(false);
    });

    it('prevents sensitive environment variables from leaking into child process', async () => {
      const res = await runCommand(
        process.execPath,
        [
          '-e',
          'console.log(JSON.stringify({ pat: process.env.ADO_PAT, safe: process.env.SAFE_CONFIG }));',
        ],
        {
          cwd: process.cwd(),
          env: {
            ADO_PAT: 'leak-test-pat-token',
            SAFE_CONFIG: 'safe-public-setting',
          },
        }
      );

      expect(res.exitCode).toBe(0);
      const envs = JSON.parse(res.stdout);
      expect(envs.pat).toBeUndefined();
      expect(envs.safe).toBe('safe-public-setting');
    });

    it('terminates command on timeout and marks timedOut true with exit code 124', async () => {
      const res = await runCommand(
        process.execPath,
        ['-e', 'setInterval(() => {}, 1000);'],
        {
          cwd: process.cwd(),
          timeoutMs: 500,
        }
      );

      expect(res.timedOut).toBe(true);
      expect(res.exitCode).toBe(124);
    }, 10_000);
  });
});
