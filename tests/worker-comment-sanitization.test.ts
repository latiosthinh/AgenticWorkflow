import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatWorkerAlertComment } from '../src/ado/formatter.js';
import { flagTicketBlocked } from '../src/ado/work-item.js';
import { adoClient } from '../src/ado/client.js';

describe('Worker Comment Sanitization and Loop Shield (SEC-04)', () => {
  beforeEach(() => {
    adoClient.setWorkItemTrackingApi(null);
  });

  describe('formatWorkerAlertComment', () => {
    it('structures title, message, and details with loop shield', () => {
      const comment = formatWorkerAlertComment(
        '[Contract Conflict] Protected test files modified',
        'tests/locked.test.ts',
        'details: line 42 changed'
      );

      expect(comment).toContain('<h3>[Contract Conflict] Protected test files modified</h3>');
      expect(comment).toContain('<p>tests/locked.test.ts</p>');
      expect(comment).toContain('<pre>details: line 42 changed</pre>');
      expect(comment).toContain('<!-- [automated-agent] -->');
      expect(comment.endsWith('<!-- [automated-agent] -->')).toBe(true);
    });

    it('works without optional details parameter', () => {
      const comment = formatWorkerAlertComment(
        '[Diff Ceiling Exceeded] Diff ceiling exceeded',
        'Cumulative diff 280 LOC exceeds 250 LOC ceiling'
      );

      expect(comment).toContain('<h3>[Diff Ceiling Exceeded] Diff ceiling exceeded</h3>');
      expect(comment).toContain('<p>Cumulative diff 280 LOC exceeds 250 LOC ceiling</p>');
      expect(comment).not.toContain('<pre>');
      expect(comment.endsWith('<!-- [automated-agent] -->')).toBe(true);
    });

    it('sanitizes script tags and hostile handlers', () => {
      const comment = formatWorkerAlertComment(
        '<script>alert("title-xss")</script>[Push Failed]',
        '<img src=x onerror=alert("msg-xss")><p onclick="evil()">Body</p>',
        '<script>maliciousCode();</script><iframe src="http://evil.com"></iframe>'
      );

      // No raw executable script, iframe, or event handlers
      expect(comment).not.toContain('<script>');
      expect(comment).not.toContain('onerror');
      expect(comment).not.toContain('onclick');
      expect(comment).not.toContain('<iframe>');
      expect(comment).toContain('<!-- [automated-agent] -->');
    });

    it('allows safe formatting tags like code, strong, pre', () => {
      const comment = formatWorkerAlertComment(
        'Alert',
        'Check <code>src/index.ts</code> and <strong>re-run</strong>',
        'Stack trace line 1'
      );

      expect(comment).toContain('<code>src/index.ts</code>');
      expect(comment).toContain('<strong>re-run</strong>');
      expect(comment).toContain('<pre>Stack trace line 1</pre>');
    });
  });

  describe('Worker Alert Inventory Sanitization & Loop-Shielding', () => {
    const alerts: Array<{ name: string; comment: string }> = [
      {
        name: 'OpenCode error',
        comment: formatWorkerAlertComment(
          '[Agent Execution Failed] Execution Failed',
          'OpenCode execution failed (exit 1): error output',
          'details: stderr output'
        ),
      },
      {
        name: 'OpenCode timeout',
        comment: formatWorkerAlertComment(
          '[Agent Execution Failed] Execution Timed Out',
          'OpenCode execution timed out'
        ),
      },
      {
        name: 'Disallowed packages contract conflict',
        comment: formatWorkerAlertComment(
          '[Contract Conflict] Unauthorized package dependencies added',
          'axios, lodash'
        ),
      },
      {
        name: 'Protected test files modified contract conflict',
        comment: formatWorkerAlertComment(
          '[Contract Conflict] Protected test files modified',
          'tests/core.test.ts, tests/auth.test.ts'
        ),
      },
      {
        name: 'New test file lacks valid assertions contract conflict',
        comment: formatWorkerAlertComment(
          '[Contract Conflict] New test file lacks valid assertions',
          '<code>tests/empty.test.ts</code>'
        ),
      },
      {
        name: 'Repair budget exhausted',
        comment: formatWorkerAlertComment(
          '[Repair Exhausted] Test self-repair budget exhausted',
          'WIP branch created: <code>wip/ticket-123</code>',
          'AssertionError: expected true to be false'
        ),
      },
      {
        name: 'Diff ceiling exceeded',
        comment: formatWorkerAlertComment(
          '[Diff Ceiling Exceeded] Cumulative rework diff exceeded ceiling',
          'Cumulative rework diff 320 LOC exceeds 250 LOC ceiling'
        ),
      },
      {
        name: 'Remote push failed',
        comment: formatWorkerAlertComment(
          '[Push Failed] Remote push to origin failed',
          'fatal: could not read Username for remote: terminal prompts disabled'
        ),
      },
    ];

    for (const alert of alerts) {
      it(`verifies alert '${alert.name}' has loop-shield marker and no script tags`, () => {
        expect(alert.comment).toContain('<!-- [automated-agent] -->');
        expect(alert.comment).not.toContain('<script>');
        // Matches bot-shield detector regex/substring
        expect(alert.comment.includes('[automated-agent]')).toBe(true);
        expect(alert.comment.includes('<!-- [automated-agent] -->')).toBe(true);
      });
    }
  });

  describe('flagTicketBlocked Defense-in-Depth', () => {
    it('sanitizes unshielded raw comment and appends loop-shield marker', async () => {
      let patchDocPassed: any[] = [];
      const mockWitApi = {
        getWorkItem: vi.fn().mockResolvedValue({
          id: 5555,
          rev: 1,
          fields: {
            'System.State': 'In Dev',
            'System.Tags': 'frontend',
          },
        }),
        updateWorkItem: vi.fn().mockImplementation(async (_id: number, patchDoc: any[]) => {
          patchDocPassed = patchDoc;
          return { id: 5555 };
        }),
      };

      adoClient.setWorkItemTrackingApi(mockWitApi as any);

      const hostileRawComment = '<script>alert("pwned")</script><p onclick="hack()">Raw error</p>';
      await flagTicketBlocked(5555, hostileRawComment, 'contract-conflict');

      expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
      const historyOp = patchDocPassed.find((op: any) => op.path === '/fields/System.History');
      expect(historyOp).toBeDefined();
      expect(historyOp.value).not.toContain('<script>');
      expect(historyOp.value).not.toContain('onclick');
      expect(historyOp.value).toContain('Raw error');
      expect(historyOp.value).toContain('<!-- [automated-agent] -->');
    });

    it('does not double-append loop-shield marker if already present', async () => {
      let patchDocPassed: any[] = [];
      const mockWitApi = {
        getWorkItem: vi.fn().mockResolvedValue({
          id: 5556,
          rev: 1,
          fields: {
            'System.State': 'In Dev',
            'System.Tags': '',
          },
        }),
        updateWorkItem: vi.fn().mockImplementation(async (_id: number, patchDoc: any[]) => {
          patchDocPassed = patchDoc;
          return { id: 5556 };
        }),
      };

      adoClient.setWorkItemTrackingApi(mockWitApi as any);

      const alreadyShielded = '<p>Something broke</p>\n<!-- [automated-agent] -->';
      await flagTicketBlocked(5556, alreadyShielded, 'repair-exhausted');

      const historyOp = patchDocPassed.find((op: any) => op.path === '/fields/System.History');
      const matches = (historyOp.value.match(/<!-- \[automated-agent\] -->/g) || []).length;
      expect(matches).toBe(1);
    });
  });
});
