import { createOpenAI } from '@ai-sdk/openai';
import { env } from '../config/env.js';

export async function customStreamFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (env.API_KEY && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${env.API_KEY}`);
  }
  return fetch(input, {
    ...init,
    headers,
  });
}

export const customOpenAi = createOpenAI({
  baseURL: env.API_ENDPOINT || undefined,
  apiKey: env.API_KEY || env.OPENAI_API_KEY || (env.API_ENDPOINT ? 'not-needed' : undefined),
  fetch: customStreamFetch,
});

export function getModel(modelName?: string) {
  return customOpenAi(modelName || env.API_MODEL || 'gpt-4o');
}

export const appModel = getModel();
// ponytail: default provider to openai-compatible; swap to anthropic/bedrock via provider registry in v3
