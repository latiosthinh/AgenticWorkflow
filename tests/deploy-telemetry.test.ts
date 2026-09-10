import { describe, it, expect, beforeEach } from 'vitest';
import { db, sqlite } from '../src/db/index.js';
import { telemetryEvaluations } from '../src/db/schema.js';
import {
  evaluateMetricsAgainstThresholds,
  evaluateProductionTelemetry,
  formatTelemetryAlertComment,
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
