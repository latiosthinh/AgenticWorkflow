import { env } from '../config/env.js';
import { FileStateStore } from './store.js';
import type { StateStore } from './types.js';

export * from './types.js';
export { OffLaneMutationError } from './store.js';

let _store: StateStore = new FileStateStore(env.STATE_STORE_DIR);

export const stateStore: StateStore = {
  getTicketState: (workItemId) => _store.getTicketState(workItemId),
  getArchivedTicketState: (workItemId) => _store.getArchivedTicketState?.(workItemId) ?? Promise.resolve(null),
  getTicketNotes: (workItemId) => _store.getTicketNotes(workItemId),
  updateTicketState: (workItemId, mutator, notesAppend) =>
    _store.updateTicketState(workItemId, mutator, notesAppend),
  listTickets: (options?: { includeArchived?: boolean }) => _store.listTickets(options),
  archiveTicket: (workItemId) => _store.archiveTicket(workItemId),
  recordDedupEvent: (workItemId, revId, payloadHash) =>
    _store.recordDedupEvent(workItemId, revId, payloadHash),
  updateDedupStatus: (workItemId, revId, status, errorMessage) =>
    _store.updateDedupStatus(workItemId, revId, status, errorMessage),
  purgeOldDedupEvents: (retentionDays) => _store.purgeOldDedupEvents(retentionDays),
  getDedupEvent: (workItemId, revId) => _store.getDedupEvent?.(workItemId, revId) ?? null,
};

export function setStateStore(newStore: StateStore): void {
  _store = newStore;
}

export function resetStateStore(): void {
  _store = new FileStateStore(env.STATE_STORE_DIR);
}

export function purgeOldDedupEvents(retentionDays = 7): { changes: number } {
  return stateStore.purgeOldDedupEvents(retentionDays);
}
