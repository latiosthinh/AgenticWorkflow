import crypto from 'node:crypto';

export interface TestFailure {
  testFile: string;
  testName: string;
  errorMessage: string;
  stackTrace?: string;
}

export interface FailureFingerprint {
  testFile: string;
  testName: string;
  normalizedError: string;
  hash: string;
}

export function normalizeErrorSignature(rawMessage: string): string {
  if (!rawMessage) return '';

  return rawMessage
    // Strip ANSI escape sequences
    .replace(/\u001b\[[0-9;]*m/g, '')
    // Strip ISO timestamps (e.g. 2026-09-09T04:12:07.629Z or 2026-09-09 12:34:56)
    .replace(/\b\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\b/g, '<TIMESTAMP>')
    // Strip time-only stamps (e.g. 12:34:56.789)
    .replace(/\b\d{2}:\d{2}:\d{2}(?:\.\d+)?\b/g, '<TIME>')
    // Strip ephemeral ports (e.g. localhost:54321 -> localhost:<PORT>)
    .replace(/(localhost|127\.0\.0\.1|0\.0\.0\.0):\d{4,5}\b/g, '$1:<PORT>')
    // Strip random UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    // Strip hex object IDs / memory addresses (e.g. 0x7ffd234a or 24-char mongo id)
    .replace(/\b0x[0-9a-fA-F]+\b/g, '<HEX>')
    // Normalize file paths to relative Unix style
    .replace(/[a-zA-Z]:\\[^:\n]+/g, (match) => match.replace(/\\/g, '/').split('/').slice(-2).join('/'))
    // Normalize line numbers in stack traces (e.g. :123:45 -> :<LINE>:<COL>)
    .replace(/:\d+:\d+/g, ':<LINE>:<COL>')
    .replace(/:\d+/g, ':<LINE>')
    // Normalize CRLF to LF and trim
    .replace(/\r\n/g, '\n')
    .trim();
}

export function extractFailureFingerprints(failures: TestFailure[]): FailureFingerprint[] {
  const fingerprints: FailureFingerprint[] = failures.map((failure) => {
    const normalizedError = normalizeErrorSignature(failure.errorMessage);
    const key = `${failure.testFile}:::${failure.testName}:::${normalizedError}`;
    const hash = crypto.createHash('sha256').update(key).digest('hex');

    return {
      testFile: failure.testFile,
      testName: failure.testName,
      normalizedError,
      hash,
    };
  });

  return fingerprints.sort((a, b) => a.hash.localeCompare(b.hash));
}

export function compareFailures(
  run1Failures: FailureFingerprint[],
  run2Failures: FailureFingerprint[]
): { isIdentical: boolean; matchingCount: number; diff: string[] } {
  if (run1Failures.length === 0 || run2Failures.length === 0) {
    return {
      isIdentical: false,
      matchingCount: 0,
      diff: ['One or both runs have 0 failures'],
    };
  }

  const run1Hashes = new Set(run1Failures.map((f) => f.hash));
  const run2Hashes = new Set(run2Failures.map((f) => f.hash));

  const diff: string[] = [];
  let matchingCount = 0;

  for (const f of run1Failures) {
    if (run2Hashes.has(f.hash)) {
      matchingCount++;
    } else {
      diff.push(`Failure in Run 1 missing in Run 2: [${f.testFile}] ${f.testName}`);
    }
  }

  for (const f of run2Failures) {
    if (!run1Hashes.has(f.hash)) {
      diff.push(`Failure in Run 2 missing in Run 1: [${f.testFile}] ${f.testName}`);
    }
  }

  const isIdentical =
    run1Failures.length === run2Failures.length &&
    diff.length === 0 &&
    matchingCount === run1Failures.length;

  return {
    isIdentical,
    matchingCount,
    diff,
  };
}
