import { env } from '../config/env.js';

export function resolvePreviewUrl(workItemId: number): string {
  const template = process.env.PREVIEW_URL_TEMPLATE || env.PREVIEW_URL_TEMPLATE;
  if (template) {
    return template.replaceAll('{workItemId}', String(workItemId));
  }
  return `http://localhost:${env.PORT}/preview/${workItemId}`;
}

export function resolvePrUrl(workItemId: number, branchName: string): string | undefined {
  const template = process.env.PR_URL_TEMPLATE || env.PR_URL_TEMPLATE;
  if (template) {
    return template
      .replaceAll('{workItemId}', String(workItemId))
      .replaceAll('{branchName}', encodeURIComponent(branchName));
  }
  return `${env.ADO_ORG_URL}/_git?version=GB${encodeURIComponent(branchName)}`;
}
// ponytail: env string token interpolation; integrate dynamic PR lookup via GitApi in v2
