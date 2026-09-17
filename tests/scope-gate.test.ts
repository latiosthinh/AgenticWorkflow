import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import type { ScopeLockState, TicketState } from '../src/state/types.js';
import {
  formatScopeReviewPacketComment,
  buildParkScopeLockPatch,
  type ScopePacketData,
} from '../src/scope/packet.js';

describe('PM Scope-Lock Gate - Packet & Schema (Task 1)', () => {
  it('defines ScopeLockState type contract with all required lifecycle properties', () => {
    const scopeLock: ScopeLockState = {
      status: 'pending',
      iterationCount: 0,
      requestedAt: '2026-09-17T00:00:00.000Z',
      lockedAt: null,
      lockedBy: null,
      feedback: null,
      remindedAt: null,
      escalatedAt: null,
      createdAt: '2026-09-17T00:00:00.000Z',
      updatedAt: '2026-09-17T00:00:00.000Z',
    };

    expect(scopeLock.status).toBe('pending');
    expect(scopeLock.iterationCount).toBe(0);

    const ticketPartial: Partial<TicketState> = {
      workItemId: 1001,
      scopeLock,
    };
    expect(ticketPartial.scopeLock?.status).toBe('pending');
  });

  it('formatScopeReviewPacketComment generates sanitized HTML with DoD checklist, actions, and bot shield', () => {
    const data: ScopePacketData = {
      workItemId: 1001,
      title: 'User Authentication Endpoint',
      criteriaSummary: 'Verified 3 acceptance criteria with given-when-then syntax.',
      reasons: ['Valid criteria format', 'System actor verified'],
    };

    const html = formatScopeReviewPacketComment(data);

    // Header and status table
    expect(html).toContain('[Scope Review Packet] L1 Audit Contract Passed');
    expect(html).toContain('AWAITING PM SCOPE LOCK');
    expect(html).toContain('Verified 3 acceptance criteria with given-when-then syntax.');

    // DoD collapsible section & PM actions
    expect(html).toContain('Scope Review Instructions &amp; Definition of Done');
    expect(html).toContain('[approve-scope]');
    expect(html).toContain('[reject-scope]');
    expect(html).toContain('[reset-scope]');

    // Loop shield marker
    expect(html).toContain('<!-- [automated-agent] -->');

    // Security: ensure script or iframe tags are stripped
    const maliciousData: ScopePacketData = {
      workItemId: 1002,
      title: 'Malicious Ticket',
      criteriaSummary: '<script>alert(1)</script><iframe src="evil.com"></iframe>Safe criteria',
      reasons: ['<script>evil()</script>'],
    };
    const sanitizedHtml = formatScopeReviewPacketComment(maliciousData);
    expect(sanitizedHtml).not.toContain('<script>');
    expect(sanitizedHtml).not.toContain('<iframe>');
    expect(sanitizedHtml).toContain('Safe criteria');
  });

  it('buildParkScopeLockPatch builds JSON patch appending tags and history without touching System.State', () => {
    const comment = '<p>Review packet</p>\n<!-- [automated-agent] -->';
    const currentTags = 'backend; high-priority';

    const patch = buildParkScopeLockPatch(comment, currentTags);

    // Must not touch System.State
    const stateOp = patch.find((op: any) => op.path === '/fields/System.State');
    expect(stateOp).toBeUndefined();

    // Must contain tag operation with both tags appended
    const tagOp = patch.find((op: any) => op.path === '/fields/System.Tags');
    expect(tagOp).toBeDefined();
    expect(tagOp.value).toContain('backend');
    expect(tagOp.value).toContain('high-priority');
    expect(tagOp.value).toContain('[awaiting-scope-lock]');
    expect(tagOp.value).toContain('[audit-passed]');

    // Must contain System.History add operation
    const historyOp = patch.find((op: any) => op.path === '/fields/System.History');
    expect(historyOp).toBeDefined();
    expect(historyOp.op).toBe(Operation.Add);
    expect(historyOp.value).toBe(comment);
  });
});
