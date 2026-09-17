import { env } from '../config/env.js';
import type { SmokeRunEntry, SmokeEvidenceState } from '../state/types.js';

export interface HealthProbeResult {
  healthy: boolean;
  status?: number;
  actualSha?: string;
  error?: string;
  classification?: 'INFRA' | 'APP';
}

/**
 * Health probe for production deployment verification.
 * Fails closed in production if PRODUCTION_SMOKE_URL is not configured.
 * Probes the target URL using native fetch with a 10s AbortController timeout.
 * Verifies HTTP status and commit SHA to detect stale slot swaps.
 */
export async function probeProductionHealth(
  url?: string,
  expectedSha?: string
): Promise<HealthProbeResult> {
  const targetUrl = url || env.PRODUCTION_SMOKE_URL;

  if (!targetUrl) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        '[smoke] PRODUCTION_SMOKE_URL is required in production (fail-closed); refusing to bypass smoke checks'
      );
    }
    // ponytail: fallback healthy stub in non-production environments when smoke URL unset
    return { healthy: true, status: 200, actualSha: expectedSha };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (res.status >= 500) {
      return {
        healthy: false,
        status: res.status,
        classification: 'APP',
        error: `Production health endpoint returned HTTP ${res.status}`,
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        healthy: false,
        status: res.status,
        classification: 'INFRA',
        error: `Production health endpoint returned authentication error HTTP ${res.status}`,
      };
    }

    if (!res.ok) {
      return {
        healthy: false,
        status: res.status,
        classification: 'APP',
        error: `Production health endpoint returned HTTP ${res.status}`,
      };
    }

    // SHA verification to detect stale slot swaps
    let actualSha = res.headers.get('x-commit-sha') || res.headers.get('x-version') || undefined;
    try {
      const body = await res.json();
      if (body && typeof body === 'object') {
        actualSha = body.commitSha || body.gitSha || body.version || actualSha;
      }
    } catch {
      // Body not JSON; header fallback
    }

    if (expectedSha && actualSha) {
      const match =
        actualSha.startsWith(expectedSha.slice(0, 7)) ||
        expectedSha.startsWith(actualSha.slice(0, 7));
      if (!match) {
        return {
          healthy: false,
          status: res.status,
          actualSha,
          classification: 'APP',
          error: `Deployed commit SHA mismatch: expected ${expectedSha.slice(0, 8)}, observed ${actualSha.slice(0, 8)} (stale slot swap detected)`,
        };
      }
    }

    return { healthy: true, status: res.status, actualSha };
  } catch (err: any) {
    return {
      healthy: false,
      classification: 'INFRA',
      error: err?.message || 'Failed to connect to production smoke endpoint',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
