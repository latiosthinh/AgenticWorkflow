import PQueue from 'p-queue';

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

  public clearLane(workItemId: number): void {
    const lane = this.lanes.get(workItemId);
    if (lane && lane.size === 0 && lane.pending === 0) {
      this.lanes.delete(workItemId);
    }
  }

  public getActiveLaneCount(): number {
    return this.lanes.size;
  }
}

export const workItemQueueManager = new WorkItemQueueManager();
