import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Permanent guards for WIP-resolution invariants (Phase 8).
// Removal of the guarded behavior must fail these tests.

describe('WIP static guards', () => {
  it('auditor worker contains no hardcoded gpt-4o model literal', () => {
    const src = readFileSync(
      new URL('../src/auditor/worker.ts', import.meta.url),
      'utf8'
    );
    expect(src).not.toMatch(/gpt-4o/);
  });
});
