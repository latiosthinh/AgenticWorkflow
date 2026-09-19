import { createOpenAI } from '@ai-sdk/openai';
import { env } from '../config/env.js';

export function rewriteRouterBody(body: unknown): unknown {
  if (!body || typeof body !== 'string') return body;
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object') return body; // JSON primitives: forward untouched
    if (parsed.stream === undefined) parsed.stream = false;
    if (typeof parsed.model === 'string' && parsed.model.startsWith('9router/')) {
      parsed.model = parsed.model.replace('9router/', '');
    }
    return JSON.stringify(parsed);
  } catch (err) {
    console.warn('[provider] request body rewrite failed; forwarding original body:', (err as any)?.message || err);
    return body;
  }
}

export async function customStreamFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (env.API_KEY && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${env.API_KEY}`);
  }

  const body = rewriteRouterBody(init?.body);

  return fetch(input, {
    ...init,
    headers,
    body: body as BodyInit | null | undefined,
  });
}

export const customOpenAi = createOpenAI({
  baseURL: env.API_ENDPOINT || undefined,
  apiKey: env.API_KEY || env.OPENAI_API_KEY || (env.API_ENDPOINT ? 'not-needed' : undefined),
  fetch: customStreamFetch,
});

export function getModel(modelName?: string) {
  let m = modelName || env.API_MODEL || 'gpt-4o';
  if (m.startsWith('9router/')) {
    m = m.replace('9router/', '');
  }
  return customOpenAi.chat(m);
}

export const appModel = getModel();
// ponytail: default provider to openai-compatible; swap to anthropic/bedrock via provider registry in v3
