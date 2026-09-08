import { describe, it, expect } from 'vitest';
import {
  checkTestImmutability,
  hasValidAssertions,
} from '../src/test-runner/immutability.js';

describe('Test Immutability and Assertion Presence', () => {
  it('detects and flags modification of baseline test files', () => {
    const baseline = ['tests/auth.test.ts', 'tests/order.spec.ts'];
    const diff = 'M\ttests/auth.test.ts\nA\tsrc/auth.ts';

    const result = checkTestImmutability(diff, baseline);
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBe(1);
    expect(result.violations[0]).toContain('tests/auth.test.ts');
  });

  it('detects and flags deletion of baseline test files', () => {
    const baseline = ['tests/auth.test.ts', 'tests/order.spec.ts'];
    const diff = 'D\ttests/order.spec.ts\nM\tsrc/order.ts';

    const result = checkTestImmutability(diff, baseline);
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBe(1);
    expect(result.violations[0]).toContain('tests/order.spec.ts');
  });

  it('detects and flags renaming of baseline test files', () => {
    const baseline = ['tests/auth.test.ts'];
    const diff = 'R100\ttests/auth.test.ts\ttests/auth-renamed.test.ts';

    const result = checkTestImmutability(diff, baseline);
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBe(1);
    expect(result.violations[0]).toContain('tests/auth.test.ts');
  });

  it('handles absolute or Windows path variants in baseline test files', () => {
    const baseline = ['D:/Projects/AgenticWorkflow/tests/auth.test.ts'];
    const diff = 'M\ttests/auth.test.ts';

    const result = checkTestImmutability(diff, baseline);
    expect(result.valid).toBe(false);
    expect(result.violations[0]).toContain('tests/auth.test.ts');
  });

  it('permits modified source code files when baseline test files are untouched', () => {
    const baseline = ['tests/auth.test.ts'];
    const diff = 'M\tsrc/auth.ts\nM\tsrc/models/user.ts';

    const result = checkTestImmutability(diff, baseline);
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.newTestFiles).toEqual([]);
  });

  it('permits newly created test files and lists them in newTestFiles', () => {
    const baseline = ['tests/auth.test.ts'];
    const diff = 'A\ttests/payment.test.ts\nA\ttests/sub/billing.spec.js\nM\tsrc/payment.ts';

    const result = checkTestImmutability(diff, baseline);
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.newTestFiles).toEqual([
      'tests/payment.test.ts',
      'tests/sub/billing.spec.js',
    ]);
  });

  it('handles empty diff input cleanly', () => {
    const baseline = ['tests/auth.test.ts'];
    const result = checkTestImmutability('', baseline);
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.newTestFiles).toEqual([]);
  });

  it('validates presence of expect and assert statements in test content', () => {
    expect(
      hasValidAssertions('test("works", () => { expect(true).toBe(true); });')
    ).toBe(true);
    expect(
      hasValidAssertions('it("calculates sum", () => { assert.equal(1 + 1, 2); });')
    ).toBe(true);
    expect(
      hasValidAssertions('assert(result !== null);')
    ).toBe(true);
    expect(
      hasValidAssertions('assert.deepStrictEqual(actual, expected);')
    ).toBe(true);
  });

  it('rejects empty test files lacking expect or assert assertions', () => {
    expect(hasValidAssertions('test("empty test without body", () => {});')).toBe(false);
    expect(
      hasValidAssertions('describe("suite", () => { it("does nothing", () => { const x = 1; }); });')
    ).toBe(false);
    expect(hasValidAssertions('')).toBe(false);
    expect(hasValidAssertions('// Just a comment with the word expected')).toBe(false);
  });
});
