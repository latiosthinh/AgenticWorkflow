import sanitizeHtml from 'sanitize-html';
import type { FailureFingerprint } from './fingerprint.js';

export interface QaEvidenceCommentOptions {
  totalTests: number;
  passedCount: number;
  failedCount: number;
  durationMs: number;
  commitSha: string;
  stagingUrl?: string;
  flakeCleared?: boolean;
}

export function formatQaEvidenceComment(options: QaEvidenceCommentOptions): string {
  const {
    totalTests,
    passedCount,
    failedCount,
    durationMs,
    commitSha,
    stagingUrl,
    flakeCleared,
  } = options;

  const durationSec = (durationMs / 1000).toFixed(2);
  const statusBadge = flakeCleared
    ? '<span style="color: #2e7d32; font-weight: bold;">[QA Flake Cleared]</span>'
    : '<span style="color: #2e7d32; font-weight: bold;">[QA Passed]</span>';

  const html = `
<div class="qa-evidence-summary">
  <h3>🧪 Integration Verification Evidence (L3)</h3>
  <p>${statusBadge} — All integration/e2e test suites verified on staging commit <code>${commitSha.slice(0, 8)}</code>.</p>
  <ul>
    <li><strong>Total Tests:</strong> ${totalTests}</li>
    <li><strong>Passed:</strong> ${passedCount}</li>
    <li><strong>Failed:</strong> ${failedCount}</li>
    <li><strong>Duration:</strong> ${durationSec}s</li>
    ${stagingUrl ? `<li><strong>Staging URL:</strong> <a href="${stagingUrl}">${stagingUrl}</a></li>` : ''}
    ${flakeCleared ? '<li><strong>Note:</strong> Transient flake was detected on run 1 and cleared on immediate rerun.</li>' : ''}
  </ul>
</div>
`.trim();

  const sanitized = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'div',
      'span',
      'h3',
      'p',
      'ul',
      'li',
      'code',
      'strong',
      'a',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      div: ['class'],
      span: ['style'],
      a: ['href'],
    },
  });

  return `${sanitized}\n<!-- [automated-agent] -->`;
}

export interface QaDiagnosticsCommentOptions {
  workItemId: number;
  commitSha: string;
  failures: FailureFingerprint[];
  stdoutTail: string;
  stderrTail: string;
  currentBounce: number;
  maxBounces: number;
}

export function formatQaDiagnosticsComment(options: QaDiagnosticsCommentOptions): string {
  const {
    workItemId,
    commitSha,
    failures,
    stdoutTail,
    stderrTail,
    currentBounce,
    maxBounces,
  } = options;

  const failureRows = failures
    .map(
      (f) => `
<li>
  <strong>${sanitizeHtml(f.testFile)}</strong> &gt; ${sanitizeHtml(f.testName)}<br/>
  <code>${sanitizeHtml(f.normalizedError)}</code><br/>
  <small>SHA-256: <code>${f.hash.slice(0, 12)}</code></small>
</li>`
    )
    .join('\n');

  const html = `
<div class="qa-diagnostics-report">
  <h3>❌ [QA Failure Diagnostic] 2-Strike Confirmed Regression</h3>
  <p>Work item #${workItemId} failed integration verification on commit <code>${commitSha.slice(0, 8)}</code> with identical failure signatures across two consecutive runs.</p>
  <p><strong>Bounce:</strong> ${currentBounce} of ${maxBounces} (ticket returned to <em>In Dev</em> for rework)</p>
  
  <p><strong>Local Reproduction Command:</strong></p>
  <pre><code>git checkout ${commitSha}\nnpm run test:integration</code></pre>

  <details>
    <summary><strong>Failed Test Signatures (${failures.length})</strong></summary>
    <ul>
      ${failureRows}
    </ul>
  </details>

  <details>
    <summary><strong>Output Log Tail</strong></summary>
    <pre><code>${sanitizeHtml((stdoutTail + '\n' + stderrTail).slice(-4000))}</code></pre>
  </details>
</div>
`.trim();

  const sanitized = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'div',
      'details',
      'summary',
      'pre',
      'code',
      'h3',
      'p',
      'ul',
      'li',
      'strong',
      'em',
      'small',
      'br',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      div: ['class'],
    },
  });

  return `${sanitized}\n<!-- [automated-agent] -->`;
}

export interface QaEscalationCommentOptions {
  workItemId: number;
  bounceCount: number;
  maxBounces: number;
  failureSummary?: string;
}

export function formatQaEscalationComment(options: QaEscalationCommentOptions): string {
  const { workItemId, bounceCount, maxBounces, failureSummary } = options;

  const html = `
<div class="qa-escalation-alert">
  <h3>🛑 QA Rework Breaker Tripped</h3>
  <p>Work item #${workItemId} has exceeded the maximum automated QA rework bounces (<strong>${maxBounces}</strong>).</p>
  <p>Ticket transitioned to <strong>Blocked</strong> with tag <code>[qa-escalated]</code>.</p>
  ${failureSummary ? `<p><strong>Last Failure:</strong> ${sanitizeHtml(failureSummary)}</p>` : ''}
  <p><strong>Next Step:</strong> Human QA engineer or Tech Lead intervention required to diagnose and resolve integration blockage.</p>
</div>
`.trim();

  const sanitized = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'div',
      'h3',
      'p',
      'strong',
      'code',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      div: ['class'],
    },
  });

  return `${sanitized}\n<!-- [automated-agent] -->`;
}
