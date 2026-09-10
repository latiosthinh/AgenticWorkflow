import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db, sqlite } from '../src/db/index.js';
import { telemetryEvaluations } from '../src/db/schema.js';
import { env } from '../src/config/env.js';
import {
  evaluateMetricsAgainstThresholds,
  evaluateProductionTelemetry,
  formatTelemetryAlertComment,
  queryAzureMonitorMetrics,
  type TelemetryMetrics,
} from '../src/deploy/telemetry.js';
import { eq } from 'drizzle-orm';

describe('Production Telemetry Monitoring & Breach Detection (DPLY-02)', () => {
  beforeEach(() => {
    sqlite.exec('DELETE FROM telemetry_evaluations;');
  });

  it('evaluates healthy metrics as non-breached', () => {
    const metrics: TelemetryMetrics = {
      errorRatePercent: 0.25,
      p95LatencyMs: 210,
      totalRequests: 10000,
      failedRequests: 25,
      windowMinutes: 30,
    };

    const evaluation = evaluateMetricsAgainstThresholds(metrics);
    expect(evaluation.breached).toBe(false);
    expect(evaluation.reasons).toHaveLength(0);
  });

  it('detects error-rate spike breach when error rate exceeds threshold', () => {
    const metrics: TelemetryMetrics = {
      errorRatePercent: 2.5,
      p95LatencyMs: 180,
      totalRequests: 1000,
      failedRequests: 25,
      windowMinutes: 30,
    };

    const evaluation = evaluateMetricsAgainstThresholds(metrics, { maxErrorRate: 1.0 });
    expect(evaluation.breached).toBe(true);
    expect(evaluation.reasons[0]).toContain('Error rate spiked to 2.50%');
  });

  it('detects p95 latency regression breach when latency exceeds threshold', () => {
    const metrics: TelemetryMetrics = {
      errorRatePercent: 0.1,
      p95LatencyMs: 780,
      totalRequests: 2000,
      failedRequests: 2,
      windowMinutes: 30,
    };

    const evaluation = evaluateMetricsAgainstThresholds(metrics, { maxP95Latency: 500 });
    expect(evaluation.breached).toBe(true);
    expect(evaluation.reasons[0]).toContain('P95 latency regressed to 780ms');
  });

  it('detects both error rate and latency breaches simultaneously', () => {
    const metrics: TelemetryMetrics = {
      errorRatePercent: 3.2,
      p95LatencyMs: 950,
      totalRequests: 5000,
      failedRequests: 160,
      windowMinutes: 30,
    };

    const evaluation = evaluateMetricsAgainstThresholds(metrics, {
      maxErrorRate: 1.0,
      maxP95Latency: 500,
    });

    expect(evaluation.breached).toBe(true);
    expect(evaluation.reasons).toHaveLength(2);
  });

  it('persists telemetry evaluation records in SQLite database', async () => {
    const workItemId = 6001;
    const metrics: TelemetryMetrics = {
      errorRatePercent: 0.15,
      p95LatencyMs: 160,
      totalRequests: 4000,
      failedRequests: 6,
      windowMinutes: 30,
    };

    const result = await evaluateProductionTelemetry({
      workItemId,
      mockMetrics: metrics,
    });

    expect(result.breached).toBe(false);

    const record = db
      .select()
      .from(telemetryEvaluations)
      .where(eq(telemetryEvaluations.workItemId, workItemId))
      .get();

    expect(record).toBeDefined();
    expect(record?.errorRate).toBe('0.15%');
    expect(record?.p95LatencyMs).toBe(160);
    expect(record?.breached).toBe(0);
  });

  it('formats sanitized telemetry breach alert with emergency rollback command', () => {
    const result = {
      breached: true,
      reasons: ['Error rate spiked to 3.50%'],
      metrics: {
        errorRatePercent: 3.5,
        p95LatencyMs: 650,
        totalRequests: 1000,
        failedRequests: 35,
        windowMinutes: 30,
      },
    };

    const comment = formatTelemetryAlertComment({
      workItemId: 6002,
      result,
      commitSha: '998877665544',
      rollbackCommand: 'git revert -m 1 998877665544\ngit push origin main',
    });

    expect(comment).toContain('[L6 Telemetry Alert] Production Performance Regression');
    expect(comment).toContain('99887766');
    expect(comment).toContain('Error rate spiked to 3.50%');
    expect(comment).toContain('git revert -m 1 998877665544');
    expect(comment).toContain('<!-- [automated-agent] -->');
  });
});

describe('queryAzureMonitorMetrics live gate (DPLY-02 fail-closed)', () => {
  const originalNodeEnv = env.NODE_ENV;

  afterEach(() => {
    env.NODE_ENV = originalNodeEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const okJson = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

  const stubMetricsApi = (counts: { total: number; failed: number }, p95: number) => {
    const fetchMock = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes('requests/count,requests/failed')) {
        return okJson({
          value: {
            'requests/count': { value: counts.total },
            'requests/failed': { value: counts.failed },
          },
        });
      }
      return okJson({
        value: { 'requests/duration': { avg: p95 / 2, percentile95: p95 } },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('computes real error rate from requests/count and requests/failed', async () => {
    const fetchMock = stubMetricsApi({ total: 1000, failed: 25 }, 240);

    const metrics = await queryAzureMonitorMetrics('app-id', 'api-key', 30);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('timespan=PT30M');
    expect(metrics.errorRatePercent).toBeCloseTo(2.5, 5);
    expect(metrics.p95LatencyMs).toBe(240);
    expect(metrics.totalRequests).toBe(1000);
    expect(metrics.failedRequests).toBe(25);

    const evaluation = evaluateMetricsAgainstThresholds(metrics, { maxErrorRate: 1.0 });
    expect(evaluation.breached).toBe(true);
    expect(evaluation.reasons[0]).toContain('Error rate spiked to 2.50%');
  });

  it('guards divide-by-zero: 0 requests yields 0% error rate', async () => {
    stubMetricsApi({ total: 0, failed: 0 }, 0);

    const metrics = await queryAzureMonitorMetrics('app-id', 'api-key');
    expect(metrics.errorRatePercent).toBe(0);
    expect(metrics.totalRequests).toBe(0);
  });

  it('throws on missing credentials when NODE_ENV is not test (fail-closed)', async () => {
    env.NODE_ENV = 'production';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(queryAzureMonitorMetrics(undefined, undefined)).rejects.toThrow(
      /credentials missing/i
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on non-ok API response when NODE_ENV is not test (fail-closed)', async () => {
    env.NODE_ENV = 'production';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503 }) as unknown as Response)
    );

    await expect(queryAzureMonitorMetrics('app-id', 'api-key')).rejects.toThrow('HTTP 503');
  });

  it('throws on network error when NODE_ENV is not test (fail-closed)', async () => {
    env.NODE_ENV = 'production';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      })
    );

    await expect(queryAzureMonitorMetrics('app-id', 'api-key')).rejects.toThrow('ECONNREFUSED');
  });

  it('throws on unrecognized response shape when NODE_ENV is not test (fail-closed)', async () => {
    env.NODE_ENV = 'production';
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ unexpected: true })));

    await expect(queryAzureMonitorMetrics('app-id', 'api-key')).rejects.toThrow(
      /unrecognized response shape/i
    );
  });

  it('returns deterministic baseline healthy metrics in test env without credentials', async () => {
    env.NODE_ENV = 'test';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const metrics = await queryAzureMonitorMetrics(undefined, undefined);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(metrics.errorRatePercent).toBe(0.05);
    expect(metrics.p95LatencyMs).toBe(145);
    expect(metrics.totalRequests).toBe(2500);
    expect(metrics.failedRequests).toBe(1);
  });

  it('falls back to baseline metrics in test env when the API errors', async () => {
    env.NODE_ENV = 'test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom');
      })
    );

    const metrics = await queryAzureMonitorMetrics('app-id', 'api-key');

    expect(metrics.errorRatePercent).toBe(0.0);
    expect(metrics.p95LatencyMs).toBe(120);
  });
});
