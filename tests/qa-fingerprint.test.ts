import { describe, it, expect } from 'vitest';
import {
  normalizeErrorSignature,
  extractFailureFingerprints,
  compareFailures,
  type TestFailure,
} from '../src/qa/fingerprint.js';

describe('QA Failure Fingerprinting', () => {
  it('normalizes error messages by stripping ephemeral timestamps, ports, and UUIDs', () => {
    const rawMsg1 = `Error: Connect failed at http://127.0.0.1:49213 at 2026-09-09T04:12:07.629Z with id 123e4567-e89b-12d3-a456-426614174000:45:10`;
    const rawMsg2 = `Error: Connect failed at http://127.0.0.1:51888 at 2026-09-09T05:30:11.100Z with id 987fcdeb-51a2-43f1-b987-123456789abc:99:20`;

    const norm1 = normalizeErrorSignature(rawMsg1);
    const norm2 = normalizeErrorSignature(rawMsg2);

    expect(norm1).toBe(norm2);
    expect(norm1).toContain('http://127.0.0.1:<PORT>');
    expect(norm1).toContain('<TIMESTAMP>');
    expect(norm1).toContain('<UUID>');
  });

  it('generates stable SHA-256 hashes for identical normalized failures', () => {
    const failuresA: TestFailure[] = [
      {
        testFile: 'tests/auth.test.ts',
        testName: 'should verify JWT token',
        errorMessage: 'AssertionError: expected 401 at 2026-09-09T10:00:00Z on port :3000',
      },
    ];

    const failuresB: TestFailure[] = [
      {
        testFile: 'tests/auth.test.ts',
        testName: 'should verify JWT token',
        errorMessage: 'AssertionError: expected 401 at 2026-09-09T11:00:00Z on port :4567',
      },
    ];

    const fpsA = extractFailureFingerprints(failuresA);
    const fpsB = extractFailureFingerprints(failuresB);

    expect(fpsA).toHaveLength(1);
    expect(fpsB).toHaveLength(1);
    expect(fpsA[0].hash).toBe(fpsB[0].hash);
  });

  it('detects identical failure sets across runs', () => {
    const run1: TestFailure[] = [
      {
        testFile: 'tests/checkout.test.ts',
        testName: 'payment failure',
        errorMessage: 'PaymentGatewayError: timeout at 12:00:00',
      },
      {
        testFile: 'tests/inventory.test.ts',
        testName: 'stock check',
        errorMessage: 'ItemOutOfStockError: sku-101',
      },
    ];

    const run2: TestFailure[] = [
      {
        testFile: 'tests/inventory.test.ts',
        testName: 'stock check',
        errorMessage: 'ItemOutOfStockError: sku-101',
      },
      {
        testFile: 'tests/checkout.test.ts',
        testName: 'payment failure',
        errorMessage: 'PaymentGatewayError: timeout at 12:05:00',
      },
    ];

    const fps1 = extractFailureFingerprints(run1);
    const fps2 = extractFailureFingerprints(run2);

    const result = compareFailures(fps1, fps2);
    expect(result.isIdentical).toBe(true);
    expect(result.matchingCount).toBe(2);
    expect(result.diff).toHaveLength(0);
  });

  it('detects different failures between runs (flake scenario)', () => {
    const run1: TestFailure[] = [
      {
        testFile: 'tests/checkout.test.ts',
        testName: 'payment failure',
        errorMessage: 'PaymentGatewayError: timeout',
      },
    ];

    const run2: TestFailure[] = [
      {
        testFile: 'tests/checkout.test.ts',
        testName: 'shipping calculation',
        errorMessage: 'InvalidAddressError: missing zip',
      },
    ];

    const fps1 = extractFailureFingerprints(run1);
    const fps2 = extractFailureFingerprints(run2);

    const result = compareFailures(fps1, fps2);
    expect(result.isIdentical).toBe(false);
    expect(result.matchingCount).toBe(0);
    expect(result.diff.length).toBeGreaterThan(0);
  });

  it('returns not identical if one of the runs has 0 failures', () => {
    const fps1 = extractFailureFingerprints([
      { testFile: 'a.test.ts', testName: 'foo', errorMessage: 'boom' },
    ]);
    const result = compareFailures(fps1, []);
    expect(result.isIdentical).toBe(false);
  });
});
