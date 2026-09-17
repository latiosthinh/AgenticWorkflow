import { env } from '../config/env.js';
import { FileStateStore } from './store.js';
import type { StateStore } from './types.js';

export * from './types.js';
export { OffLaneMutationError } from './store.js';

export const stateStore: StateStore = new FileStateStore(env.STATE_STORE_DIR);

export function purgeOldDedupEvents(retentionDays = 7): { changes: number } {
  return stateStore.purgeOldDedupEvents(retentionDays);
}
