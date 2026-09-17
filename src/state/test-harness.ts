import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FileStateStore } from './store.js';
import type { StateStore } from './types.js';

export interface TestStateStoreContext {
  store: StateStore;
  tempDir: string;
  cleanup: () => void;
}

export function createTestStateStore(): TestStateStoreContext {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-state-'));
  const store = new FileStateStore(tempDir);
  const cleanup = () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
  return { store, tempDir, cleanup };
}
