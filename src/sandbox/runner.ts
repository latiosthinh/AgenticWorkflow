import path from 'node:path';
import { execa } from 'execa';
import type { CommandOptions, CommandResult } from './types.js';

// ponytail: execa host runner with signal cascades; wrap in docker run when running untrusted public repos in v2

/** Frozen allowlist of permitted agent commands. Principle of least privilege — not configurable. */
export const ALLOWED_COMMANDS = Object.freeze([
  'npm', 'npx', 'node', 'vitest', 'tsc', 'git',
  // Windows .cmd/.exe variants
  'npm.cmd', 'npx.cmd', 'node.exe', 'vitest.cmd', 'tsc.cmd', 'git.exe',
] as const);

function assertAllowedCommand(file: string): void {
  const basename = path.basename(file).toLowerCase();
  if (!(ALLOWED_COMMANDS as readonly string[]).includes(basename)) {
    throw new Error(
      `Command '${file}' is not in the allowlist. ` +
      `Permitted: ${ALLOWED_COMMANDS.filter(c => !c.includes('.')).join(', ')}. ` +
      `Agent commands are restricted for security.`
    );
  }
}

export const SENSITIVE_KEY_PATTERN = /(PAT|API_KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY|AUTH_KEY)/i;
export const SENSITIVE_VALUE_PATTERN = /(?:ghp_[a-zA-Z0-9]{36}|Bearer\s+[a-zA-Z0-9_\-\.]+|ado-[a-zA-Z0-9]{40,})/g;
export const MAX_OUTPUT_BYTES = 50 * 1024; // 50KB

/**
 * Sanitizes environment variables for child processes.
 * Retains whitelisted system variables and excludes any variable
 * whose key matches SENSITIVE_KEY_PATTERN.
 */
export function sanitizeEnv(customEnv?: Record<string, string>): NodeJS.ProcessEnv {
  const safeEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH || '',
    HOME: process.env.HOME || process.env.USERPROFILE || '',
    NODE_ENV: process.env.NODE_ENV || 'development',
    SYSTEMROOT: process.env.SYSTEMROOT || '',
    COMSPEC: process.env.COMSPEC || '',
    PATHEXT: process.env.PATHEXT || '',
    TEMP: process.env.TEMP || '',
    TMP: process.env.TMP || '',
    APPDATA: process.env.APPDATA || '',
    LOCALAPPDATA: process.env.LOCALAPPDATA || '',
  };

  if (process.env.USERPROFILE) {
    safeEnv.USERPROFILE = process.env.USERPROFILE;
  }

  if (customEnv) {
    for (const [key, value] of Object.entries(customEnv)) {
      if (!SENSITIVE_KEY_PATTERN.test(key)) {
        safeEnv[key] = value;
      }
    }
  }

  return safeEnv;
}

/**
 * Scrubs known token patterns and explicit secret strings from command output.
 */
export function scrubOutput(text: string, knownSecrets: string[] = []): string {
  if (!text) return '';

  let cleaned = text.replace(SENSITIVE_VALUE_PATTERN, (match) => {
    if (match.startsWith('Bearer')) {
      return 'Bearer [REDACTED]';
    }
    return '[REDACTED]';
  });

  for (const secret of knownSecrets) {
    if (secret && secret.length >= 4) {
      cleaned = cleaned.replaceAll(secret, '[REDACTED]');
    }
  }

  return cleaned;
}

/**
 * Caps stdout/stderr string buffer at maxBytes (50KB default), appending [...truncated...].
 */
export function truncateBuffer(text: string, maxBytes = MAX_OUTPUT_BYTES): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
    return text;
  }

  const slicePoint = Math.max(0, maxBytes - 40);
  const truncatedString = Buffer.from(text, 'utf8')
    .subarray(0, slicePoint)
    .toString('utf8');

  return `${truncatedString}\n[...truncated...]`;
}

/**
 * Runs a command safely via execa with 120s timeout, SIGTERM/SIGKILL cascade,
 * sanitized environment variables, and scrubbed/truncated output.
 */
export async function runCommand(
  file: string,
  args: string[],
  options: CommandOptions,
  knownSecrets: string[] = []
): Promise<CommandResult> {
  assertAllowedCommand(file);
  const timeoutMs = options.timeoutMs ?? 120_000;

  try {
    const result = await execa(file, args, {
      cwd: options.cwd,
      shell: false,
      timeout: timeoutMs,
      killSignal: 'SIGTERM',
      forceKillAfterDelay: 2000,
      env: sanitizeEnv(options.env),
      extendEnv: false,
      maxBuffer: 10 * 1024 * 1024, // 10MB memory safety limit
    });

    const rawStdout = typeof result.stdout === 'string' ? result.stdout : '';
    const rawStderr = typeof result.stderr === 'string' ? result.stderr : '';

    return {
      stdout: truncateBuffer(scrubOutput(rawStdout, knownSecrets)),
      stderr: truncateBuffer(scrubOutput(rawStderr, knownSecrets)),
      exitCode: result.exitCode ?? 0,
      timedOut: false,
    };
  } catch (error: any) {
    const isTimeout = Boolean(error.timedOut);
    const rawStdout = typeof error.stdout === 'string' ? error.stdout : '';
    const rawStderr = typeof error.stderr === 'string'
      ? error.stderr
      : (error.message || '');

    return {
      stdout: truncateBuffer(scrubOutput(rawStdout, knownSecrets)),
      stderr: truncateBuffer(scrubOutput(rawStderr, knownSecrets)),
      exitCode: error.exitCode ?? (isTimeout ? 124 : 1),
      timedOut: isTimeout,
    };
  }
}
