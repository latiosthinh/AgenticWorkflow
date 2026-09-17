import { describe, it, expect } from 'vitest';
import { laneContext, workItemQueueManager } from '../src/queue/lane-manager.js';

describe('WorkItemQueueManager.runInLane and laneContext', () => {
  it('executes task within laneContext bound to workItemId', async () => {
    let capturedId: number | undefined;
    const result = await workItemQueueManager.runInLane(123, async () => {
      capturedId = laneContext.getStore()?.workItemId;
      return 'done-123';
    });

    expect(capturedId).toBe(123);
    expect(result).toBe('done-123');
  });

  it('runs tasks concurrently across different lanes but sequentially within same lane', async () => {
    const order: string[] = [];

    const task1 = workItemQueueManager.runInLane(456, async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push('t1');
    });

    const task2 = workItemQueueManager.runInLane(456, async () => {
      order.push('t2');
    });

    await Promise.all([task1, task2]);
    expect(order).toEqual(['t1', 't2']);
  });
});
