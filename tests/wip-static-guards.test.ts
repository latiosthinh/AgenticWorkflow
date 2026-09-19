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

  it('execute worker skip branch records planDelegated + planNote governance deviation', () => {
    const src = readFileSync(
      new URL('../src/execute/worker.ts', import.meta.url),
      'utf8'
    );
    expect(src).toContain('planDelegated: true');
    expect(src).toContain("'plan delegated to opencode'");
    // escape hatch preserved in the skip condition
    expect(src).toContain('forceAiPlanner');
    // locked-branch comment call surfaces the note (call spans lines)
    expect(src).toMatch(/formatPlanLockedComment\([^)]*plan\.planNote/);
  });
});
