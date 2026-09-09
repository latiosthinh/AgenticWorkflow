import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import {
  formatAcceptancePacketComment,
  buildDevDoneAcceptancePatch,
} from '../src/accept/packet.js';
import { resolvePreviewUrl, resolvePrUrl } from '../src/accept/urls.js';
import { env } from '../src/config/env.js';

describe('Acceptance Packet Formatting & Patch Builders', () => {
  it('formats collapsible acceptance packet with table, PR link, preview link, and bot shield', () => {
    const comment = formatAcceptancePacketComment({
      workItemId: 1001,
      testSuite: 'vitest',
      totalTests: 12,
      passed: 12,
      failed: 0,
      durationMs: 250,
      gitDiffStat: {
        filesChanged: 3,
        insertions: 50,
        deletions: 10,
        totalLoc: 60,
        rawStat: '3 files changed, 50 insertions(+), 10 deletions(-)',
      },
      prUrl: 'https://dev.azure.com/org/proj/_git/repo/pullrequest/42',
      previewUrl: 'https://preview-1001.internal.net',
    });

    expect(comment).toContain('<h3>[Acceptance Packet] Functional Verification Complete</h3>');
    expect(comment).toContain('READY FOR ACCEPTANCE');
    expect(comment).toContain('12/12 passed (250ms)');
    expect(comment).toContain('&lt;250 LOC ceiling verified');
    expect(comment).toContain('View Pull Request');
    expect(comment).toContain('Open Staging Preview');
    expect(comment).toContain('<details>');
    expect(comment).toContain('<summary>');
    expect(comment).toContain('Verification Details &amp; Instructions');
    expect(comment).toContain('[approve-acceptance]');
    expect(comment).toContain('[reject-acceptance]');
    expect(comment).toContain('[reset-rework]');
    expect(comment.endsWith('<!-- [automated-agent] -->')).toBe(true);
  });

  it('formats failed status verdict when failed tests > 0', () => {
    const comment = formatAcceptancePacketComment({
      workItemId: 1002,
      testSuite: 'vitest',
      totalTests: 10,
      passed: 8,
      failed: 2,
      durationMs: 310,
      gitDiffStat: {
        filesChanged: 1,
        insertions: 10,
        deletions: 5,
        totalLoc: 15,
        rawStat: '1 file changed, 10 insertions(+), 5 deletions(-)',
      },
    });

    expect(comment).toContain('TESTS FAILED');
    expect(comment).toContain('8/10 passed (310ms)');
    expect(comment).toContain('PR pending branch push');
    expect(comment).toContain('No preview environment configured');
    expect(comment.endsWith('<!-- [automated-agent] -->')).toBe(true);
  });

  it('uses totalLoc fallback when rawStat is empty', () => {
    const comment = formatAcceptancePacketComment({
      workItemId: 1003,
      testSuite: 'vitest',
      totalTests: 5,
      passed: 5,
      failed: 0,
      durationMs: 120,
      gitDiffStat: {
        filesChanged: 2,
        insertions: 20,
        deletions: 5,
        totalLoc: 25,
        rawStat: '',
      },
    });

    expect(comment).toContain('<code>25 LOC</code> (&lt;250 LOC ceiling verified)');
  });

  it('builds Dev Done patch with [awaiting-acceptance] tag and clears [awaiting-input]', () => {
    const patch = buildDevDoneAcceptancePatch('<div>Packet</div>', 'backend; [awaiting-input]');

    const stateOp = patch.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp).toEqual({
      op: Operation.Replace,
      path: '/fields/System.State',
      value: 'Dev Done',
    });

    const tagOp = patch.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp?.value).toContain('[awaiting-acceptance]');
    expect(tagOp?.value).not.toContain('[awaiting-input]');
    expect(tagOp?.value).toContain('backend');

    const historyOp = patch.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp).toEqual({
      op: Operation.Add,
      path: '/fields/System.History',
      value: '<div>Packet</div>',
    });
  });

  it('builds Dev Done patch when currentTags is undefined', () => {
    const patch = buildDevDoneAcceptancePatch('<div>Packet</div>', undefined);

    const tagOp = patch.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp?.value).toBe('[awaiting-acceptance]');
  });
});

describe('URL Template Resolvers', () => {
  const originalPreviewEnv = process.env.PREVIEW_URL_TEMPLATE;
  const originalPrEnv = process.env.PR_URL_TEMPLATE;

  afterEach(() => {
    if (originalPreviewEnv !== undefined) {
      process.env.PREVIEW_URL_TEMPLATE = originalPreviewEnv;
    } else {
      delete process.env.PREVIEW_URL_TEMPLATE;
    }

    if (originalPrEnv !== undefined) {
      process.env.PR_URL_TEMPLATE = originalPrEnv;
    } else {
      delete process.env.PR_URL_TEMPLATE;
    }
  });

  it('resolves preview URL using localhost fallback when PREVIEW_URL_TEMPLATE is unset', () => {
    delete process.env.PREVIEW_URL_TEMPLATE;
    const url = resolvePreviewUrl(101);
    expect(url).toBe(`http://localhost:${env.PORT}/preview/101`);
  });

  it('resolves preview URL with template interpolation when PREVIEW_URL_TEMPLATE is set', () => {
    process.env.PREVIEW_URL_TEMPLATE = 'https://preview.internal/{workItemId}';
    const url = resolvePreviewUrl(101);
    expect(url).toBe('https://preview.internal/101');
  });

  it('resolves PR URL using ADO branch compare fallback when PR_URL_TEMPLATE is unset', () => {
    delete process.env.PR_URL_TEMPLATE;
    const url = resolvePrUrl(101, 'task/ticket-101');
    expect(url).toBe(`${env.ADO_ORG_URL}/_git?version=GBtask%2Fticket-101`);
  });

  it('resolves PR URL with workItemId template interpolation when PR_URL_TEMPLATE is set', () => {
    process.env.PR_URL_TEMPLATE = 'https://dev.azure.com/org/proj/_git/repo/pullrequest/{workItemId}';
    const url = resolvePrUrl(101, 'task/ticket-101');
    expect(url).toBe('https://dev.azure.com/org/proj/_git/repo/pullrequest/101');
  });

  it('resolves PR URL with branchName and workItemId interpolation', () => {
    process.env.PR_URL_TEMPLATE = 'https://dev.azure.com/org/proj/_git/repo/pullrequest/{workItemId}?branch={branchName}';
    const url = resolvePrUrl(202, 'feature/foo bar');
    expect(url).toBe('https://dev.azure.com/org/proj/_git/repo/pullrequest/202?branch=feature%2Ffoo%20bar');
  });
});
