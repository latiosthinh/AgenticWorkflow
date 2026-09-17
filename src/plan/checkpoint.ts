import { stateStore } from '../state/index.js';
import type { PlanCheckpointState } from '../state/types.js';
import { workItemQueueManager, laneContext } from '../queue/lane-manager.js';

export interface CreateCheckpointInput {
  workItemId: number;
  revId: number;
  questions: string[];
  planMarkdown?: string;
  estimatedFiles?: string[];
  testStrategy?: string;
}

export async function createPlanCheckpoint(
  data: CreateCheckpointInput
): Promise<PlanCheckpointState> {
  let created: PlanCheckpointState | undefined;

  const mutate = async () => {
    await stateStore.updateTicketState(data.workItemId, (draft) => {
      created = {
        id: draft.planCheckpoints.length + 1,
        revId: data.revId,
        status: 'pending_human_input',
        questions: JSON.stringify(data.questions),
        planMarkdown: data.planMarkdown || null,
        estimatedFiles: data.estimatedFiles ? JSON.stringify(data.estimatedFiles) : null,
        testStrategy: data.testStrategy || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      draft.planCheckpoints.push(created);
    });
  };

  if (laneContext.getStore()?.workItemId === data.workItemId) {
    await mutate();
  } else {
    await workItemQueueManager.runInLane(data.workItemId, mutate);
  }

  return created!;
}

export async function getPendingCheckpoint(
  workItemId: number
): Promise<PlanCheckpointState | undefined> {
  const ticket = await stateStore.getTicketState(workItemId);
  if (!ticket || !ticket.planCheckpoints || ticket.planCheckpoints.length === 0) {
    return undefined;
  }
  const pending = ticket.planCheckpoints
    .filter((cp) => cp.status === 'pending_human_input')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return pending[0];
}

export async function lockPlanCheckpoint(
  id: number | undefined,
  answers: string,
  updatedPlan?: string,
  explicitWorkItemId?: number
): Promise<void> {
  if (id === undefined) return;

  let targetWorkItemId = explicitWorkItemId;
  const currentLane = laneContext.getStore();
  if (!targetWorkItemId && currentLane?.workItemId) {
    const ticket = await stateStore.getTicketState(currentLane.workItemId);
    if (ticket?.planCheckpoints?.some((cp) => cp.id === id)) {
      targetWorkItemId = currentLane.workItemId;
    }
  }

  if (!targetWorkItemId) {
    const tickets = await stateStore.listTickets();
    const matching = tickets.filter((t) => t.planCheckpoints?.some((cp) => cp.id === id));
    if (matching.length === 1) {
      targetWorkItemId = matching[0].workItemId;
    } else if (matching.length > 1) {
      throw new Error(
        `Cannot lock checkpoint ${id}: ambiguous lookup across multiple tickets (${matching
          .map((t) => t.workItemId)
          .join(', ')}). Explicit workItemId must be provided.`
      );
    }
  }

  if (!targetWorkItemId) {
    return;
  }

  const mutate = async () => {
    await stateStore.updateTicketState(targetWorkItemId!, (draft) => {
      const cp = draft.planCheckpoints.find((c) => c.id === id);
      if (cp) {
        cp.status = 'locked';
        cp.answers = answers;
        if (updatedPlan !== undefined) {
          cp.planMarkdown = updatedPlan;
        }
        cp.updatedAt = new Date().toISOString();
      }
    });
  };

  if (laneContext.getStore()?.workItemId === targetWorkItemId) {
    await mutate();
  } else {
    await workItemQueueManager.runInLane(targetWorkItemId, mutate);
  }
}

export async function updateCheckpointStatus(
  id: number | undefined,
  status: 'pending_human_input' | 'resumed' | 'locked' | 'blocked' | 'expired',
  answers?: string,
  explicitWorkItemId?: number
): Promise<void> {
  if (id === undefined) return;

  let targetWorkItemId = explicitWorkItemId;
  const currentLane = laneContext.getStore();
  if (!targetWorkItemId && currentLane?.workItemId) {
    const ticket = await stateStore.getTicketState(currentLane.workItemId);
    if (ticket?.planCheckpoints?.some((cp) => cp.id === id)) {
      targetWorkItemId = currentLane.workItemId;
    }
  }

  if (!targetWorkItemId) {
    const tickets = await stateStore.listTickets();
    const matching = tickets.filter((t) => t.planCheckpoints?.some((cp) => cp.id === id));
    if (matching.length === 1) {
      targetWorkItemId = matching[0].workItemId;
    } else if (matching.length > 1) {
      throw new Error(
        `Cannot update checkpoint ${id}: ambiguous lookup across multiple tickets (${matching
          .map((t) => t.workItemId)
          .join(', ')}). Explicit workItemId must be provided.`
      );
    }
  }

  if (!targetWorkItemId) {
    return;
  }

  const mutate = async () => {
    await stateStore.updateTicketState(targetWorkItemId!, (draft) => {
      const cp = draft.planCheckpoints.find((c) => c.id === id);
      if (cp) {
        cp.status = status;
        if (answers !== undefined) {
          cp.answers = answers;
        }
        cp.updatedAt = new Date().toISOString();
      }
    });
  };

  if (laneContext.getStore()?.workItemId === targetWorkItemId) {
    await mutate();
  } else {
    await workItemQueueManager.runInLane(targetWorkItemId, mutate);
  }
}
