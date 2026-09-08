import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry, adoClient } from '../src/ado/client.js';
import { formatL1AuditComment } from '../src/ado/formatter.js';
import {
  buildReadyToDevPatch,
  buildFeedbackPatch,
  getWorkItemDetails,
  transitionToReadyToDev,
  postFeedbackComment,
} from '../src/ado/work-item.js';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import type { AuditResult } from '../src/auditor/schema.js';

describe('Azure DevOps Client & Work Item Integration', () => {
  describe('withRetry', () => {
    it('succeeds on first attempt without retrying', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const result = await withRetry(fn, 3, 1);
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('recovers from transient HTTP 429 errors', async () => {
      const rateLimitErr = { statusCode: 429, message: 'Too Many Requests' };
      const fn = vi
        .fn()
        .mockRejectedValueOnce(rateLimitErr)
        .mockRejectedValueOnce(rateLimitErr)
        .mockResolvedValue('recovered');

      const result = await withRetry(fn, 3, 1);
      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('recovers from 5xx server errors', async () => {
      const serverErr = { statusCode: 503, message: 'Service Unavailable' };
      const fn = vi.fn().mockRejectedValueOnce(serverErr).mockResolvedValue('ok');

      const result = await withRetry(fn, 3, 1);
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('recovers from transient network disconnect errors (ECONNRESET, ETIMEDOUT)', async () => {
      const networkErr = { code: 'ECONNRESET', message: 'socket hang up' };
      const fn = vi.fn().mockRejectedValueOnce(networkErr).mockResolvedValue('ok');

      const result = await withRetry(fn, 3, 1);
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('throws immediately on non-retryable 4xx errors', async () => {
      const clientErr = { statusCode: 400, message: 'Bad Request' };
      const fn = vi.fn().mockRejectedValue(clientErr);

      await expect(withRetry(fn, 3, 1)).rejects.toMatchObject({ statusCode: 400 });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('throws when retry limit is exhausted', async () => {
      const rateLimitErr = { statusCode: 429, message: 'Too Many Requests' };
      const fn = vi.fn().mockRejectedValue(rateLimitErr);

      await expect(withRetry(fn, 3, 1)).rejects.toMatchObject({ statusCode: 429 });
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('formatL1AuditComment', () => {
    it('generates HTML with [L1 Evidence] badge and [automated-agent] marker for passed audit', () => {
      const passedResult: AuditResult = {
        passed: true,
        reasons: [
          'Verifiable acceptance criteria provided',
          'Scope boundaries and actor roles defined',
          'Zero unresolved placeholders',
        ],
        criteria_summary: 'All Definition of Done criteria met.',
      };

      const html = formatL1AuditComment(passedResult);

      expect(html).toContain('<strong>[L1 Evidence] Contract Audit: PASSED</strong>');
      expect(html).toContain('Ready to Dev');
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>Verifiable acceptance criteria provided</li>');
      expect(html).toContain('<!-- [automated-agent] -->');
    });

    it('generates actionable HTML with instructions for incomplete audit', () => {
      const failedResult: AuditResult = {
        passed: false,
        reasons: [
          'Testability: lacks verifiable outcomes or concrete steps',
          'Completeness: contains unresolved placeholders ("TBD")',
        ],
        criteria_summary: 'Work item fails Definition of Done.',
      };

      const html = formatL1AuditComment(failedResult);

      expect(html).toContain('<strong>[L1 Evidence] Contract Audit: INCOMPLETE (Action Required)</strong>');
      expect(html).toContain('Retained in New');
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>Testability: lacks verifiable outcomes or concrete steps</li>');
      expect(html).toContain('Please address the missing requirements');
      expect(html).toContain('<!-- [automated-agent] -->');
    });

    it('sanitizes XSS payloads injected in reasons (T-1-06)', () => {
      const maliciousResult: AuditResult = {
        passed: false,
        reasons: [
          '<script>alert("xss")</script>Unsanitized reason<img src="x" onerror="alert(1)">',
        ],
        criteria_summary: '<b onclick="bad()">Summary</b>',
      };

      const html = formatL1AuditComment(maliciousResult);

      expect(html).not.toContain('<script>');
      expect(html).not.toContain('onerror');
      expect(html).not.toContain('onclick');
      expect(html).toContain('Unsanitized reason');
      expect(html).toContain('<!-- [automated-agent] -->');
    });
  });

  describe('Work Item JSON Patch & API Operations', () => {
    beforeEach(() => {
      adoClient.setWorkItemTrackingApi(null);
    });

    it('buildReadyToDevPatch generates state replace and history add patch', () => {
      const comment = '<p>Evidence</p>\n<!-- [automated-agent] -->';
      const patch = buildReadyToDevPatch(comment) as any[];

      expect(patch).toHaveLength(2);
      expect(patch[0]).toEqual({
        op: Operation.Replace,
        path: '/fields/System.State',
        value: 'Ready to Dev',
      });
      expect(patch[1]).toEqual({
        op: Operation.Add,
        path: '/fields/System.History',
        value: comment,
      });
    });

    it('buildFeedbackPatch generates history add patch without state modification', () => {
      const comment = '<p>Action required</p>\n<!-- [automated-agent] -->';
      const patch = buildFeedbackPatch(comment) as any[];

      expect(patch).toHaveLength(1);
      expect(patch[0]).toEqual({
        op: Operation.Add,
        path: '/fields/System.History',
        value: comment,
      });
    });

    it('getWorkItemDetails extracts fields correctly', async () => {
      const mockWitApi = {
        getWorkItem: vi.fn().mockResolvedValue({
          id: 42,
          rev: 3,
          fields: {
            'System.Title': 'Implement user auth',
            'System.Description': '<p>JWT auth implementation</p>',
            'Microsoft.VSTS.Common.AcceptanceCriteria': '<p>Given valid creds return 200</p>',
            'System.State': 'New',
          },
        }),
        updateWorkItem: vi.fn(),
      };

      adoClient.setWorkItemTrackingApi(mockWitApi as any);

      const details = await getWorkItemDetails(42);
      expect(details).toEqual({
        id: 42,
        rev: 3,
        title: 'Implement user auth',
        description: '<p>JWT auth implementation</p>',
        acceptanceCriteria: '<p>Given valid creds return 200</p>',
        state: 'New',
      });
      expect(mockWitApi.getWorkItem).toHaveBeenCalledWith(42);
    });

    it('transitionToReadyToDev dispatches JSON patch update', async () => {
      const mockWitApi = {
        getWorkItem: vi.fn(),
        updateWorkItem: vi.fn().mockResolvedValue({ id: 42 }),
      };

      adoClient.setWorkItemTrackingApi(mockWitApi as any);

      await transitionToReadyToDev(42, '<p>Passed</p>');
      expect(mockWitApi.updateWorkItem).toHaveBeenCalled();
      const callArgs = mockWitApi.updateWorkItem.mock.calls[0];
      // Arg can be (headers, patchDoc, id) or (patchDoc, id)
      const patchDoc = callArgs.find((a: any) => Array.isArray(a));
      expect(patchDoc).toBeDefined();
      expect(patchDoc[0]).toMatchObject({
        op: Operation.Replace,
        path: '/fields/System.State',
        value: 'Ready to Dev',
      });
    });

    it('postFeedbackComment dispatches JSON patch update without changing state', async () => {
      const mockWitApi = {
        getWorkItem: vi.fn(),
        updateWorkItem: vi.fn().mockResolvedValue({ id: 42 }),
      };

      adoClient.setWorkItemTrackingApi(mockWitApi as any);

      await postFeedbackComment(42, '<p>Incomplete</p>');
      expect(mockWitApi.updateWorkItem).toHaveBeenCalled();
      const callArgs = mockWitApi.updateWorkItem.mock.calls[0];
      const patchDoc = callArgs.find((a: any) => Array.isArray(a));
      expect(patchDoc).toBeDefined();
      expect(patchDoc).toHaveLength(1);
      expect(patchDoc[0]).toMatchObject({
        op: Operation.Add,
        path: '/fields/System.History',
        value: '<p>Incomplete</p>',
      });
    });
  });
});
