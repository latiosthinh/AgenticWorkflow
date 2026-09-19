import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ALLOWED_COMMANDS, runCommand } from '../src/sandbox/runner.js';

describe('SEC-02: Command Allowlist + File-Read Jail', () => {
  describe('ALLOWED_COMMANDS constant', () => {
    it('is a frozen array', () => {
      expect(Object.isFrozen(ALLOWED_COMMANDS)).toBe(true);
    });

    it('contains base commands: npm, npx, node, vitest, tsc, git', () => {
      for (const cmd of ['npm', 'npx', 'node', 'vitest', 'tsc', 'git']) {
        expect(ALLOWED_COMMANDS).toContain(cmd);
      }
    });

    it('contains Windows variants: npm.cmd, npx.cmd, node.exe, git.exe', () => {
      for (const cmd of ['npm.cmd', 'npx.cmd', 'node.exe', 'git.exe']) {
        expect(ALLOWED_COMMANDS).toContain(cmd);
      }
    });
  });

  describe('runCommand allowlist enforcement', () => {
    it('allows npm', async () => {
      // npm --version is harmless and fast
      const result = await runCommand('npm', ['--version'], { cwd: process.cwd() });
      expect(result.exitCode).toBe(0);
    });

    it('allows npx', async () => {
      const result = await runCommand('npx', ['--version'], { cwd: process.cwd() });
      expect(result.exitCode).toBe(0);
    });

    it('allows node', async () => {
      const result = await runCommand('node', ['--version'], { cwd: process.cwd() });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/^v\d+/);
    });

    it('allows npm.cmd on Windows', async () => {
      if (os.platform() !== 'win32') return; // skip on non-Windows
      const result = await runCommand('npm.cmd', ['--version'], { cwd: process.cwd() });
      expect(result.exitCode).toBe(0);
    });

    it('rejects curl with descriptive error', async () => {
      await expect(
        runCommand('curl', ['https://evil.com'], { cwd: process.cwd() })
      ).rejects.toThrow('not in the allowlist');
    });

    it('rejects cat', async () => {
      await expect(
        runCommand('cat', ['../../.env'], { cwd: process.cwd() })
      ).rejects.toThrow('not in the allowlist');
    });

    it('rejects bash', async () => {
      await expect(
        runCommand('bash', ['-c', 'echo pwned'], { cwd: process.cwd() })
      ).rejects.toThrow('not in the allowlist');
    });

    it('rejects powershell', async () => {
      await expect(
        runCommand('powershell', ['-Command', 'Get-Process'], { cwd: process.cwd() })
      ).rejects.toThrow('not in the allowlist');
    });

    it('rejects python', async () => {
      await expect(
        runCommand('python', ['-c', 'import os'], { cwd: process.cwd() })
      ).rejects.toThrow('not in the allowlist');
    });

    it('rejects wget', async () => {
      await expect(
        runCommand('wget', ['https://evil.com'], { cwd: process.cwd() })
      ).rejects.toThrow('not in the allowlist');
    });

    it('rejects path-qualified disallowed command', async () => {
      await expect(
        runCommand('/usr/bin/curl', ['https://evil.com'], { cwd: process.cwd() })
      ).rejects.toThrow('not in the allowlist');
    });

    it('error message lists permitted commands', async () => {
      try {
        await runCommand('curl', [], { cwd: process.cwd() });
        expect.unreachable('should have thrown');
      } catch (e: any) {
        expect(e.message).toContain('npm');
        expect(e.message).toContain('Agent commands are restricted');
      }
    });
  });

  describe('File-read jail (structural worktree containment)', () => {
    it('scrubs secrets from traversal-read output via knownSecrets', async () => {
      // Simulated worktree structure: tmp/.env + tmp/worktrees/123/
      const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sec02-jail-'));
      const secretFile = path.join(tmpBase, '.env');
      const worktreeDir = path.join(tmpBase, 'worktrees', '123');
      fs.mkdirSync(worktreeDir, { recursive: true });
      // Use a value matching SENSITIVE_VALUE_PATTERN (ghp_ token)
      fs.writeFileSync(secretFile, 'TOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234567890');

      try {
        const traversalPath = path.join('..', '..', '.env');
        const result = await runCommand(
          'node',
          ['-e', `console.log(require('fs').readFileSync('${traversalPath.replace(/\\/g, '\\\\')}', 'utf8'))`],
          { cwd: worktreeDir },
          // Belt-and-suspenders: pass as knownSecrets too
          ['ghp_abcdefghijklmnopqrstuvwxyz1234567890']
        );

        // Even if filesystem allows the read, output is scrubbed
        expect(result.stdout).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz1234567890');
        expect(result.stdout).toContain('[REDACTED]');
      } finally {
        fs.rmSync(tmpBase, { recursive: true, force: true });
      }
    });

    it('extendEnv:false prevents host env leak to child process', () => {
      const runnerSrc = fs.readFileSync(
        path.resolve(__dirname, '../src/sandbox/runner.ts'),
        'utf8'
      );
      expect(runnerSrc).toContain('extendEnv: false');
    });
  });

  describe('Source file verification', () => {
    const runnerSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/sandbox/runner.ts'),
      'utf8'
    );

    it('runner.ts exports ALLOWED_COMMANDS', () => {
      expect(runnerSrc).toContain('ALLOWED_COMMANDS');
      expect(runnerSrc).toContain('Object.freeze');
    });

    it('runner.ts validates command before execa', () => {
      expect(runnerSrc).toContain('assertAllowedCommand');
    });
  });
});
