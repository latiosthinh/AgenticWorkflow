import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { planCheckpoints, type PlanCheckpoint } from '../db/schema.js';

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
): Promise<PlanCheckpoint> {
  const result = db
    .insert(planCheckpoints)
    .values({
      workItemId: data.workItemId,
      revId: data.revId,
      status: 'pending_human_input',
      questions: JSON.stringify(data.questions),
      planMarkdown: data.planMarkdown || null,
      estimatedFiles: data.estimatedFiles ? JSON.stringify(data.estimatedFiles) : null,
      testStrategy: data.testStrategy || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning()
    .get();

  return result;
}

export async function getPendingCheckpoint(
  workItemId: number
): Promise<PlanCheckpoint | undefined> {
  const [row] = db
    .select()
    .from(planCheckpoints)
    .where(
      and(
        eq(planCheckpoints.workItemId, workItemId),
        eq(planCheckpoints.status, 'pending_human_input')
      )
    )
    .orderBy(desc(planCheckpoints.createdAt))
    .limit(1)
    .all();

  return row;
}

export async function lockPlanCheckpoint(
  id: number,
  answers: string,
  updatedPlan?: string
): Promise<void> {
  const values: Partial<typeof planCheckpoints.$inferInsert> = {
    status: 'locked',
    answers,
    updatedAt: new Date(),
  };

  if (updatedPlan !== undefined) {
    values.planMarkdown = updatedPlan;
  }

  db.update(planCheckpoints)
    .set(values)
    .where(eq(planCheckpoints.id, id))
    .run();
}

export async function updateCheckpointStatus(
  id: number,
  status: 'pending_human_input' | 'resumed' | 'locked' | 'blocked' | 'expired'
): Promise<void> {
  db.update(planCheckpoints)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(planCheckpoints.id, id))
    .run();
}
