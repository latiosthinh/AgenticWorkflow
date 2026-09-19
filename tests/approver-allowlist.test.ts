import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseApproverIds, isActorAuthorized, env } from '../src/config/env.js';
import { detectScopeVerdict } from '../src/scope/verdict.js';
import { detectAcceptanceVerdict } from '../src/accept/verdict.js';
import { routeWorkItemEvent } from '../src/execute/router.js';
import { adoClient } from '../src/ado/client.js';
import { stateStore, resetStateStore } from '../src/state/index.js';
import { createTestStateStore, type TestStateStoreContext } from '../src/state/test-harness.js';

describe('SEC-03: Approver Allowlist for Verdict Tokens', () => {
  describe('parseApproverIds & isActorAuthorized helper logic', () => {
    it('parses comma-separated IDs, trimming and lowercasing entries', () => {
      const parsed = parseApproverIds(' alice@example.com, BOB, Charlie Dev <charlie@example.com> ');
      expect(parsed).toEqual([
        'alice@example.com',
        'bob',
        'charlie dev <charlie@example.com>',
      ]);
    });

    it('returns empty array when raw string is empty or undefined', () => {
      expect(parseApproverIds(undefined)).toEqual([]);
      expect(parseApproverIds('')).toEqual([]);
      expect(parseApproverIds('   ')).toEqual([]);
    });

    it('isActorAuthorized returns true when allowlist is empty or undefined (unrestricted)', () => {
      expect(isActorAuthorized('any-user@example.com', [])).toBe(true);
      expect(isActorAuthorized(undefined, [])).toBe(true);
      expect(isActorAuthorized('any-user@example.com', undefined)).toBe(true);
    });

    it('isActorAuthorized returns false when allowlist is set but actor is undefined or empty', () => {
      const allowlist = ['alice@example.com', 'bob'];
      expect(isActorAuthorized(undefined, allowlist)).toBe(false);
      expect(isActorAuthorized('', allowlist)).toBe(false);
      expect(isActorAuthorized('   ', allowlist)).toBe(false);
    });

    it('isActorAuthorized matches exact ID/email/name case-insensitively', () => {
      const allowlist = ['alice@example.com', 'bob'];
      expect(isActorAuthorized('Alice@example.com', allowlist)).toBe(true);
      expect(isActorAuthorized('BOB', allowlist)).toBe(true);
      expect(isActorAuthorized('eve@example.com', allowlist)).toBe(false);
    });

    it('isActorAuthorized extracts email and displayName from ADO formatted actor string', () => {
      const allowlist = ['pm@company.com', 'lead developer'];
      // Matches by extracted email
      expect(isActorAuthorized('Alice PM <pm@company.com>', allowlist)).toBe(true);
      // Matches by extracted displayName
      expect(isActorAuthorized('Lead Developer <lead@other.com>', allowlist)).toBe(true);
      // Fails when neither matches
      expect(isActorAuthorized('Eve Hacker <eve@other.com>', allowlist)).toBe(false);
    });
  });

  describe('detectScopeVerdict authorization', () => {
    const approverIds = ['pm@example.com', 'alice'];

    it('accepts [approve-scope] token when actor is in allowlist', () => {
      const verdict = detectScopeVerdict({
        currentState: 'New',
        historyComment: 'Looks good! [approve-scope]',
        revisedBy: 'pm@example.com',
        approverIds,
      });
      expect(verdict.type).toBe('approve');
      if (verdict.type === 'approve') {
        expect(verdict.actor).toBe('pm@example.com');
      }
    });

    it('rejects [approve-scope] token with unauthorized verdict when actor is not in allowlist', () => {
      const verdict = detectScopeVerdict({
        currentState: 'New',
        historyComment: 'Trying to sneak approval [approve-scope]',
        revisedBy: 'unauthorized-dev@example.com',
        approverIds,
      });
      expect(verdict.type).toBe('unauthorized');
      if (verdict.type === 'unauthorized') {
        expect(verdict.actor).toBe('unauthorized-dev@example.com');
        expect(verdict.token).toBe('[approve-scope]');
      }
    });

    it('accepts [reject-scope] token when actor is in allowlist', () => {
      const verdict = detectScopeVerdict({
        currentState: 'New',
        historyComment: '[reject-scope] Missing DoD test specifications.',
        revisedBy: 'alice',
        approverIds,
      });
      expect(verdict.type).toBe('reject');
      if (verdict.type === 'reject') {
        expect(verdict.feedback).toBe('Missing DoD test specifications.');
      }
    });

    it('rejects [reject-scope] token with unauthorized verdict when actor is not in allowlist', () => {
      const verdict = detectScopeVerdict({
        currentState: 'New',
        historyComment: '[reject-scope] Spurious rejection',
        revisedBy: 'random-user',
        approverIds,
      });
      expect(verdict.type).toBe('unauthorized');
      if (verdict.type === 'unauthorized') {
        expect(verdict.token).toBe('[reject-scope]');
      }
    });

    it('accepts [reset-scope] token when actor is in allowlist', () => {
      const verdict = detectScopeVerdict({
        currentState: 'Blocked',
        historyComment: 'Resetting breaker [reset-scope]',
        revisedBy: 'pm@example.com',
        approverIds,
      });
      expect(verdict.type).toBe('reset_scope');
    });

    it('rejects [reset-scope] token with unauthorized verdict when actor is not in allowlist', () => {
      const verdict = detectScopeVerdict({
        currentState: 'Blocked',
        historyComment: 'Resetting breaker [reset-scope]',
        revisedBy: 'unauthorized@example.com',
        approverIds,
      });
      expect(verdict.type).toBe('unauthorized');
      if (verdict.type === 'unauthorized') {
        expect(verdict.token).toBe('[reset-scope]');
      }
    });

    it('allows board drag-and-drop state transition without comment tokens regardless of actor', () => {
      const verdict = detectScopeVerdict({
        currentState: 'Ready to Dev',
        previousState: 'New',
        revisedBy: 'unauthorized-dev@example.com',
        approverIds,
      });
      expect(verdict.type).toBe('approve');
    });

    it('allows tag-based transitions without comment tokens regardless of actor', () => {
      const verdict = detectScopeVerdict({
        currentState: 'New',
        tags: '[awaiting-scope-lock]; [scope-locked]',
        previousTags: '[awaiting-scope-lock]',
        revisedBy: 'anyone',
        approverIds,
      });
      expect(verdict.type).toBe('approve');
    });
  });

  describe('detectAcceptanceVerdict authorization', () => {
    const approverIds = ['qa-lead@example.com', 'alice'];

    it('accepts [approve-acceptance] token when actor is authorized', () => {
      const verdict = detectAcceptanceVerdict({
        currentState: 'Dev Done',
        historyComment: 'Verified on staging [approve-acceptance]',
        revisedBy: 'qa-lead@example.com',
        approverIds,
      });
      expect(verdict.type).toBe('approve');
    });

    it('rejects [approve-acceptance] token when actor is not authorized', () => {
      const verdict = detectAcceptanceVerdict({
        currentState: 'Dev Done',
        historyComment: 'Self-approving [approve-acceptance]',
        revisedBy: 'developer@example.com',
        approverIds,
      });
      expect(verdict.type).toBe('unauthorized');
      if (verdict.type === 'unauthorized') {
        expect(verdict.token).toBe('[approve-acceptance]');
        expect(verdict.actor).toBe('developer@example.com');
      }
    });

    it('accepts [reject-acceptance] token when actor is authorized', () => {
      const verdict = detectAcceptanceVerdict({
        currentState: 'Dev Done',
        historyComment: '[reject-acceptance] Fails on null inputs.',
        revisedBy: 'qa-lead@example.com',
        approverIds,
      });
      expect(verdict.type).toBe('reject');
      if (verdict.type === 'reject') {
        expect(verdict.feedback).toBe('Fails on null inputs.');
      }
    });

    it('rejects [reject-acceptance] token when actor is not authorized', () => {
      const verdict = detectAcceptanceVerdict({
        currentState: 'Dev Done',
        historyComment: '[reject-acceptance] Unauthorized rejection',
        revisedBy: 'hacker@example.com',
        approverIds,
      });
      expect(verdict.type).toBe('unauthorized');
      if (verdict.type === 'unauthorized') {
        expect(verdict.token).toBe('[reject-acceptance]');
      }
    });

    it('accepts [reset-rework] token when actor is authorized', () => {
      const verdict = detectAcceptanceVerdict({
        currentState: 'Blocked',
        historyComment: '[reset-rework]',
        revisedBy: 'alice',
        approverIds,
      });
      expect(verdict.type).toBe('reset_rework');
    });

    it('rejects [reset-rework] token when actor is not authorized', () => {
      const verdict = detectAcceptanceVerdict({
        currentState: 'Blocked',
        historyComment: '[reset-rework]',
        revisedBy: 'bob',
        approverIds,
      });
      expect(verdict.type).toBe('unauthorized');
      if (verdict.type === 'unauthorized') {
        expect(verdict.token).toBe('[reset-rework]');
      }
    });

    it('allows board drag-and-drop state transition without comment tokens regardless of actor', () => {
      const verdict = detectAcceptanceVerdict({
        currentState: 'Ready for QA',
        previousState: 'Dev Done',
        revisedBy: 'unauthorized@example.com',
        approverIds,
      });
      expect(verdict.type).toBe('approve');
    });
  });

  describe('router integration with unauthorized verdict tokens', () => {
    let harness: TestStateStoreContext;
    let mockWitApi: any;
    let warnSpy: any;
    const originalApproverIds = env.APPROVER_IDS;

    beforeEach(() => {
      harness = createTestStateStore();
      resetStateStore(harness.store);
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      (env as any).APPROVER_IDS = 'authorized-pm@example.com';

      mockWitApi = {
        getWorkItem: vi.fn(),
        updateWorkItem: vi.fn().mockResolvedValue({ id: 999 }),
      };
      adoClient.setWorkItemTrackingApi(mockWitApi as any);
    });

    afterEach(() => {
      (env as any).APPROVER_IDS = originalApproverIds;
      warnSpy.mockRestore();
      harness.cleanup();
    });

    it('rejects unauthorized scope verdict token: posts warning comment with loop shield and completes dedup without state transition', async () => {
      const workItemId = 6001;
      const revId = 2;

      mockWitApi.getWorkItem.mockImplementation((id: number, rev?: number) => {
        if (rev === 1) {
          return Promise.resolve({
            id: workItemId,
            rev: 1,
            fields: {
              'System.State': 'New',
              'System.Tags': '[awaiting-scope-lock]',
            },
          });
        }
        return Promise.resolve({
          id: workItemId,
          rev: 2,
          revisedBy: { displayName: 'Attacker <attacker@evil.com>' },
          fields: {
            'System.Title': 'Test Scope Token Work Item',
            'System.State': 'New',
            'System.Tags': '[awaiting-scope-lock]',
            'System.History': 'I approve this myself [approve-scope]',
          },
        });
      });

      stateStore.recordDedupEvent(workItemId, revId, 'hash-scope-unauthorized');
      await routeWorkItemEvent(workItemId, revId);

      // Warning comment posted
      expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
      const updateCall = mockWitApi.updateWorkItem.mock.calls[0];
      const patchDoc = updateCall[1];
      const historyPatch = patchDoc.find((op: any) => op.path === '/fields/System.History');
      expect(historyPatch.value).toContain('[Unauthorized Verdict]');
      expect(historyPatch.value).toContain('Attacker &lt;attacker@evil.com&gt;');
      expect(historyPatch.value).toContain('<!-- [automated-agent] -->');

      // Console warning logged
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unauthorized scope verdict token '[approve-scope]'")
      );

      // Dedup completed, state was NOT locked
      const dedup = stateStore.getDedupEvent(workItemId, revId);
      expect(dedup?.status).toBe('completed');

      const ticket = await stateStore.getTicketState(workItemId);
      expect(ticket?.scopeLock?.status).not.toBe('locked');
    });

    it('rejects unauthorized acceptance verdict token: posts warning comment with loop shield and completes dedup', async () => {
      const workItemId = 6002;
      const revId = 2;

      mockWitApi.getWorkItem.mockImplementation((id: number, rev?: number) => {
        if (rev === 1) {
          return Promise.resolve({
            id: workItemId,
            rev: 1,
            fields: {
              'System.State': 'Dev Done',
              'System.Tags': '[awaiting-acceptance]',
            },
          });
        }
        return Promise.resolve({
          id: workItemId,
          rev: 2,
          revisedBy: { displayName: 'Dev <dev@company.com>' },
          fields: {
            'System.Title': 'Acceptance Token Work Item',
            'System.State': 'Dev Done',
            'System.Tags': '[awaiting-acceptance]',
            'System.History': '[approve-acceptance] Skipping QA',
          },
        });
      });

      stateStore.recordDedupEvent(workItemId, revId, 'hash-accept-unauthorized');
      await routeWorkItemEvent(workItemId, revId);

      // Warning comment posted
      expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
      const updateCall = mockWitApi.updateWorkItem.mock.calls[0];
      const patchDoc = updateCall[1];
      const historyPatch = patchDoc.find((op: any) => op.path === '/fields/System.History');
      expect(historyPatch.value).toContain('[Unauthorized Verdict]');
      expect(historyPatch.value).toContain('Dev &lt;dev@company.com&gt;');
      expect(historyPatch.value).toContain('<!-- [automated-agent] -->');

      // Console warning logged
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unauthorized acceptance verdict token '[approve-acceptance]'")
      );

      // Dedup completed
      const dedup = stateStore.getDedupEvent(workItemId, revId);
      expect(dedup?.status).toBe('completed');
    });

    it('processes verdict normally when actor is authorized', async () => {
      const workItemId = 6003;
      const revId = 2;

      mockWitApi.getWorkItem.mockImplementation((id: number, rev?: number) => {
        if (rev === 1) {
          return Promise.resolve({
            id: workItemId,
            rev: 1,
            fields: {
              'System.State': 'New',
              'System.Tags': '[awaiting-scope-lock]',
            },
          });
        }
        return Promise.resolve({
          id: workItemId,
          rev: 2,
          revisedBy: { displayName: 'Authorized PM <authorized-pm@example.com>' },
          fields: {
            'System.Title': 'Authorized Scope Ticket',
            'System.State': 'New',
            'System.Tags': '[awaiting-scope-lock]',
            'System.History': 'Approved by PM [approve-scope]',
          },
        });
      });

      stateStore.recordDedupEvent(workItemId, revId, 'hash-scope-authorized');
      await routeWorkItemEvent(workItemId, revId);

      // Scope approval executed
      expect(mockWitApi.updateWorkItem).toHaveBeenCalledTimes(1);
      const updateCall = mockWitApi.updateWorkItem.mock.calls[0];
      const patchDoc = updateCall[1];
      const statePatch = patchDoc.find((op: any) => op.path === '/fields/System.State');
      expect(statePatch.value).toBe('Ready to Dev');

      const ticket = await stateStore.getTicketState(workItemId);
      expect(ticket?.scopeLock?.status).toBe('locked');
      expect(ticket?.scopeLock?.lockedBy).toBe('Authorized PM <authorized-pm@example.com>');
    });
  });
});
