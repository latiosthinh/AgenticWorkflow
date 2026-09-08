export interface PrunedDiagnostics {
  failingTests: string[];
  assertionErrors: string[];
  prunedStackTrace: string[];
  summary: string;
}

export interface ParsedVitestOutput {
  totalTests: number;
  passed: number;
  failed: number;
  durationMs: number;
}

export function parseVitestSummary(stdout: string, fallbackDurationMs = 0): ParsedVitestOutput {
  const clean = stdout.replace(/\u001b\[[0-9;]*m/g, '');
  const passMatch = clean.match(/(\d+)\s+passed/);
  const failMatch = clean.match(/(\d+)\s+failed/);
  const totalMatch = clean.match(/Tests\s+.*\((\d+)\)/);

  const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
  const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
  const totalTests = totalMatch ? parseInt(totalMatch[1], 10) : passed + failed;

  return {
    totalTests,
    passed,
    failed,
    durationMs: fallbackDurationMs,
  };
}

export function pruneTestDiagnostics(stdout: string, stderr: string): PrunedDiagnostics {
  const combined = `${stdout}\n${stderr}`.replace(/\u001b\[[0-9;]*m/g, '');
  const lines = combined.split('\n');

  const failingTests: string[] = [];
  const assertionErrors: string[] = [];
  const rawFrames: string[] = [];

  for (const line of lines) {
    if (/FAIL\s+([^\n>]+)/.test(line)) {
      failingTests.push(line.trim());
    } else if (/(?:AssertionError|Error|TypeError|ReferenceError):\s*([^\n]+)/.test(line)) {
      assertionErrors.push(line.trim());
    } else if (/^\s*(?:at|❯)\s+(.*)/.test(line)) {
      if (!line.includes('node_modules') && !line.includes('node:internal')) {
        rawFrames.push(line.trim());
      }
    }
  }

  const prunedStackTrace = rawFrames.slice(0, 15);
  return {
    failingTests: Array.from(new Set(failingTests)),
    assertionErrors: Array.from(new Set(assertionErrors)).slice(0, 5),
    prunedStackTrace,
    summary: `${failingTests.length} tests failed`,
  };
}
