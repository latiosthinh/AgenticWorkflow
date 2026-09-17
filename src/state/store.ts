import type { StateStore, TicketState, DedupRecord } from './types.js';

export class FileStateStore implements StateStore {
  constructor(public baseDir: string = './data/state') {}

  async getTicketState(_workItemId: number): Promise<TicketState | null> {
    return null;
  }

  async getTicketNotes(_workItemId: number): Promise<string> {
    return '';
  }

  async updateTicketState(
    _workItemId: number,
    _mutator: (state: TicketState) => void | Promise<void>,
    _notesAppend?: string
  ): Promise<TicketState> {
    throw new Error('Not implemented');
  }

  async listTickets(): Promise<TicketState[]> {
    return [];
  }

  async archiveTicket(_workItemId: number): Promise<void> {}

  recordDedupEvent(
    workItemId: number,
    revId: number,
    payloadHash: string
  ): { isDuplicate: boolean; event: DedupRecord } {
    return {
      isDuplicate: false,
      event: {
        workItemId,
        revId,
        status: 'pending',
        payloadHash,
        receivedAt: new Date().toISOString(),
      },
    };
  }

  updateDedupStatus(
    _workItemId: number,
    _revId: number,
    _status: DedupRecord['status'],
    _errorMessage?: string
  ): void {}

  purgeOldDedupEvents(_retentionDays?: number): { changes: number } {
    return { changes: 0 };
  }
}
