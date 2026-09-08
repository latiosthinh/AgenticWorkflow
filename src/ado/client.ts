import * as azdev from 'azure-devops-node-api';
import type { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi.js';
import type { WorkItem } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import type { JsonPatchDocument } from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';
import { env } from '../config/env.js';

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const statusCode =
        err?.statusCode ??
        err?.status ??
        err?.response?.status ??
        err?.response?.statusCode;

      const isRateLimited = statusCode === 429;
      const isServerError =
        typeof statusCode === 'number' && statusCode >= 500 && statusCode < 600;
      const isNetworkError =
        Boolean(err?.code && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(err.code));

      if (attempt >= maxRetries || (!isRateLimited && !isServerError && !isNetworkError)) {
        throw err;
      }

      const headers =
        err?.responseHeaders ?? err?.response?.headers ?? err?.headers;
      const retryAfterHeader =
        headers?.['retry-after'] ?? headers?.['Retry-After'];

      const delay = retryAfterHeader
        ? Number(retryAfterHeader) * 1000
        : Math.min(10000, baseDelayMs * 2 ** (attempt - 1) + Math.random() * 200);

      console.warn(
        `[ado-client] Retry attempt ${attempt}/${maxRetries} after ${delay.toFixed(0)}ms due to status ${statusCode}`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Retry exhausted');
}

export class AdoClient {
  private connection: azdev.WebApi | null = null;
  private witApi: IWorkItemTrackingApi | null = null;

  getConnection(): azdev.WebApi {
    if (!this.connection) {
      const authHandler = azdev.getPersonalAccessTokenHandler(env.ADO_PAT);
      this.connection = new azdev.WebApi(env.ADO_ORG_URL, authHandler);
    }
    return this.connection;
  }

  async getWorkItemTrackingApi(): Promise<IWorkItemTrackingApi> {
    if (!this.witApi) {
      this.witApi = await this.getConnection().getWorkItemTrackingApi();
    }
    return this.witApi;
  }

  setWorkItemTrackingApi(mockWitApi: IWorkItemTrackingApi | null): void {
    this.witApi = mockWitApi;
  }

  async getWorkItem(id: number): Promise<WorkItem> {
    return withRetry(async () => {
      const witApi = await this.getWorkItemTrackingApi();
      return witApi.getWorkItem(id);
    });
  }

  async updateWorkItem(id: number, patchDoc: JsonPatchDocument): Promise<WorkItem> {
    return withRetry(async () => {
      const witApi = await this.getWorkItemTrackingApi();
      if (witApi.updateWorkItem.length === 2) {
        return (witApi.updateWorkItem as any)(patchDoc, id);
      }
      return (witApi.updateWorkItem as any)(undefined, patchDoc, id);
    });
  }
}

export const adoClient = new AdoClient();
// ponytail: default PAT auth; add Entra ID OAuth bearer token refresh in v2
