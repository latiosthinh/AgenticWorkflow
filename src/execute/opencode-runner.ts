import { execa } from 'execa';
import { env } from '../config/env.js';
import { sanitizeEnv, scrubOutput } from '../sandbox/runner.js';

export interface OpenCodeEvent {
  type?: string;
  session_id?: string;
  sessionId?: string;
  data?: any;
  [key: string]: any;
}

export interface OpenCodeRunOptions {
  cwd: string;
  message: string;
  model?: string;
  sessionId?: string;
  timeoutMs?: number;
  binPath?: string;
  customEnv?: Record<string, string>;
  mockRunner?: (
    args: string[],
    cwd: string,
    childEnv?: NodeJS.ProcessEnv
  ) => Promise<{ stdout: string; stderr: string; exitCode: number; timedOut?: boolean }>;
}

export interface OpenCodeRunResult {
  success: boolean;
  sessionId?: string;
  output: string;
  events: OpenCodeEvent[];
  exitCode: number;
  timedOut: boolean;
  error?: string;
}

export function parseJsonlEvents(rawText: string): OpenCodeEvent[] {
  if (!rawText) return [];
  const events: OpenCodeEvent[] = [];
  const lines = rawText.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) {
        events.push(parsed);
      }
    } catch {
      // ignore non-json lines
    }
  }
  return events;
}

export function extractSessionId(events: OpenCodeEvent[]): string | undefined {
  for (const event of events) {
    if (typeof event.session_id === 'string' && event.session_id) {
      return event.session_id;
    }
    if (typeof event.sessionId === 'string' && event.sessionId) {
      return event.sessionId;
    }
    if (typeof event.session?.id === 'string' && event.session.id) {
      return event.session.id;
    }
    if (typeof event.session?.session_id === 'string' && event.session.session_id) {
      return event.session.session_id;
    }
    if (typeof event.data?.session_id === 'string' && event.data.session_id) {
      return event.data.session_id;
    }
    if (typeof event.data?.sessionId === 'string' && event.data.sessionId) {
      return event.data.sessionId;
    }
  }
  return undefined;
}

export function buildOpenCodeArgs(options: {
  cwd: string;
  message: string;
  model?: string;
  sessionId?: string;
}): string[] {
  const args = [
    'run',
    '--dir',
    options.cwd,
    '--auto',
    '--format',
    'json',
    '-m',
    options.model || 'gpt-4o',
  ];

  if (options.sessionId) {
    args.push('--session', options.sessionId);
  }

  args.push(options.message);
  return args;
}

function aggregateOutput(events: OpenCodeEvent[], fallbackStdout: string): string {
  const parts: string[] = [];
  for (const ev of events) {
    if (typeof ev.message === 'string' && ev.message) {
      parts.push(ev.message);
    } else if (typeof ev.content === 'string' && ev.content) {
      parts.push(ev.content);
    } else if (typeof ev.text === 'string' && ev.text) {
      parts.push(ev.text);
    } else if (typeof ev.data?.content === 'string' && ev.data.content) {
      parts.push(ev.data.content);
    } else if (typeof ev.data?.message === 'string' && ev.data.message) {
      parts.push(ev.data.message);
    }
  }
  return parts.length > 0 ? parts.join('\n') : fallbackStdout.trim();
}

export async function runOpenCode(options: OpenCodeRunOptions): Promise<OpenCodeRunResult> {
  const bin = options.binPath || env.OPENCODE_BIN || 'opencode';
  const model = options.model || env.API_MODEL || 'gpt-4o';
  const timeoutMs = options.timeoutMs ?? env.OPENCODE_TIMEOUT_MS ?? 180_000;

  const args = buildOpenCodeArgs({
    cwd: options.cwd,
    message: options.message,
    model,
    sessionId: options.sessionId,
  });

  const childEnv = sanitizeEnv(options.customEnv);
  if (env.API_KEY) childEnv.API_KEY = env.API_KEY;
  if (env.OPENAI_API_KEY) childEnv.OPENAI_API_KEY = env.OPENAI_API_KEY;
  if (env.API_ENDPOINT) childEnv.API_ENDPOINT = env.API_ENDPOINT;
  if (env.API_MODEL) childEnv.API_MODEL = env.API_MODEL;
  if (options.customEnv) {
    if (options.customEnv.API_KEY) childEnv.API_KEY = options.customEnv.API_KEY;
    if (options.customEnv.OPENAI_API_KEY) childEnv.OPENAI_API_KEY = options.customEnv.OPENAI_API_KEY;
    if (options.customEnv.API_ENDPOINT) childEnv.API_ENDPOINT = options.customEnv.API_ENDPOINT;
    if (options.customEnv.API_MODEL) childEnv.API_MODEL = options.customEnv.API_MODEL;
  }

  // Map OPENAI_BASE_URL and OPENAI_API_KEY whenever API_ENDPOINT and API_KEY are provided
  if (childEnv.API_ENDPOINT) {
    childEnv.OPENAI_BASE_URL = options.customEnv?.OPENAI_BASE_URL || childEnv.API_ENDPOINT;
  }
  if (childEnv.API_KEY) {
    childEnv.OPENAI_API_KEY = options.customEnv?.OPENAI_API_KEY || childEnv.API_KEY;
  }

  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  let timedOut = false;
  let errorMsg: string | undefined;

  try {
    const res = options.mockRunner
      ? await options.mockRunner(args, options.cwd, childEnv)
      : await execa(bin, args, {
          cwd: options.cwd,
          shell: false,
          timeout: timeoutMs,
          killSignal: 'SIGTERM',
          forceKillAfterDelay: 2000,
          env: childEnv,
          extendEnv: false,
          maxBuffer: 10 * 1024 * 1024,
        });

    stdout = typeof res.stdout === 'string' ? res.stdout : '';
    stderr = typeof res.stderr === 'string' ? res.stderr : '';
    exitCode = res.exitCode ?? 0;
    timedOut = Boolean(res.timedOut);
    if (exitCode !== 0 || timedOut) {
      errorMsg = stderr || stdout || (timedOut ? 'Process timed out' : `Process exited with code ${exitCode}`);
    }
  } catch (err: any) {
    stdout = typeof err.stdout === 'string' ? err.stdout : '';
    stderr = typeof err.stderr === 'string' ? err.stderr : (err.message || '');
    exitCode = err.exitCode ?? (err.timedOut ? 124 : 1);
    timedOut = Boolean(err.timedOut);
    errorMsg = stderr || err.message || (timedOut ? 'Process timed out' : `Process exited with code ${exitCode}`);
  }

  const knownSecrets = [
    env.ADO_PAT,
    env.ADO_WEBHOOK_SECRET,
    env.API_KEY,
    env.OPENAI_API_KEY,
    options.customEnv?.API_KEY,
    options.customEnv?.OPENAI_API_KEY,
  ].filter(Boolean) as string[];

  const scrubbedStdout = scrubOutput(stdout, knownSecrets);
  const scrubbedStderr = scrubOutput(stderr, knownSecrets);
  const events = parseJsonlEvents(scrubbedStdout);
  const extractedSessionId = extractSessionId(events) || options.sessionId;
  const output = aggregateOutput(events, scrubbedStdout);

  const success = exitCode === 0 && !timedOut;

  return {
    success,
    sessionId: extractedSessionId,
    output,
    events,
    exitCode,
    timedOut,
    error: success
      ? undefined
      : scrubOutput(errorMsg || scrubbedStderr || 'OpenCode execution failed', knownSecrets),
  };
}
// ponytail: headless CLI runner; add MCP streaming server endpoint in v3
