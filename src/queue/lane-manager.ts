import { AsyncLocalStorage } from 'node:async_hooks';
import PQueue from 'p-queue';

export const laneContext = new AsyncLocalStorage<{ workItemId: number }>();

export class WorkItemQueueManager {
  private lanes = new Map<number, PQueue>();

  public getLane(workItemId: number): PQueue {
    let lane = this.lanes.get(workItemId);
    if (!lane) {
      lane = new PQueue({ concurrency: 1 });
      this.lanes.set(workItemId, lane);
    }
    return lane;
  }

  public async runInLane<T>(workItemId: number, fn: () => Promise<T>): Promise<T> {
    const current = laneContext.getStore();
    if (current && current.workItemId === workItemId) {
      return await fn();
    }
    const lane = this.getLane(workItemId);
    return (await lane.add(() => laneContext.run({ workItemId }, fn))) as T;
  }

  public clearLane(workItemId: number): void {
    const lane = this.lanes.get(workItemId);
    if (lane && lane.size === 0 && lane.pending === 0) {
      this.lanes.delete(workItemId);
    }
  }

  public getActiveLaneCount(): number {
    return this.lanes.size;
  }

  public async drainAll(): Promise<void> {
    await Promise.all(Array.from(this.lanes.values()).map((lane) => lane.onIdle()));
    this.lanes.clear();
  }
}

export const workItemQueueManager = new WorkItemQueueManager();
