import sanitizeHtml from 'sanitize-html';
import { buildTagPatch } from '../ado/work-item.js';
import type {
  MigrationRiskAssessment,
  RollbackProcedure,
  L5ReadinessPacket,
} from './types.js';
import {
  type JsonPatchDocument,
} from 'azure-devops-node-api/interfaces/common/VSSInterfaces.js';

export function assessMigrationRisk(filesModified: string[] = []): MigrationRiskAssessment {
  const schemaFiles = filesModified.filter((f) =>
    /(?:src\/db\/schema|drizzle|migrations\/|prisma)/i.test(f)
  );

  if (schemaFiles.length === 0) {
    return {
      riskLevel: 'low',
      details: ['No database schema or migration files modified in this release.'],
      recommendation: 'Zero database downtime expected. Safe for standard blue/green deployment.',
      hasSchemaChanges: false,
    };
  }

  // Schema files exist
  const isDestructivePotential = schemaFiles.some((f) =>
    /(?:drop|alter|delete|migration)/i.test(f)
  );

  return {
    riskLevel: isDestructivePotential ? 'high' : 'medium',
    details: [
      `Database schema files modified: ${schemaFiles.join(', ')}`,
      'Verify schema migrations are additive and backwards-compatible with active production instances.',
    ],
    recommendation:
      'Ensure backwards-compatible schema migration is executed before traffic switchover.',
    hasSchemaChanges: true,
  };
}

export function buildRollbackProcedure(
  commitSha: string,
  environmentName = 'Production'
): RollbackProcedure {
  const shortSha = commitSha ? commitSha.slice(0, 8) : 'HEAD';

  return {
    commitSha,
    environmentName,
    revertCommand: `git revert -m 1 ${commitSha || 'HEAD'} -m "revert: rollback release ${shortSha}"`,
    redeployCommand: `az pipelines run --name "Deploy-${environmentName}" --branch main`,
  };
}

export function buildL5ReadinessPacket(options: {
  workItemId: number;
  title: string;
  commitSha: string;
  filesModified?: string[];
  environmentName?: string;
}): L5ReadinessPacket {
  const { workItemId, title, commitSha, filesModified = [], environmentName = 'Production' } = options;

  const migrationRisk = assessMigrationRisk(filesModified);
  const rollback = buildRollbackProcedure(commitSha, environmentName);

  const releaseNotes = `### Release Notes: AB#${workItemId} - ${title}
- **Target Commit**: \`${commitSha.slice(0, 8)}\`
- **Target Environment**: \`${environmentName}\`
- **Files Modified**: ${filesModified.length} file(s)
- **Database Changes**: ${migrationRisk.hasSchemaChanges ? 'Yes (Review Required)' : 'None'}
`;

  return {
    workItemId,
    title,
    commitSha,
    environmentName,
    releaseNotes,
    migrationRisk,
    rollback,
  };
}

export function formatL5ReadinessComment(packet: L5ReadinessPacket): string {
  const { workItemId, title, commitSha, environmentName, migrationRisk, rollback } = packet;

  const riskBadgeColor =
    migrationRisk.riskLevel === 'low'
      ? '#2e7d32'
      : migrationRisk.riskLevel === 'medium'
        ? '#ed6c02'
        : '#d32f2f';

  const riskBadge = `<span style="color: ${riskBadgeColor}; font-weight: bold;">[Migration Risk: ${migrationRisk.riskLevel.toUpperCase()}]</span>`;

  const detailsList = migrationRisk.details.map((d) => `<li>${sanitizeHtml(d)}</li>`).join('\n');

  const html = `
<div class="l5-readiness-packet">
  <h3>🚀 [L5 Evidence] Native Environment Deployment Readiness</h3>
  <p>Work item #${workItemId} is staged for deployment to <strong>${sanitizeHtml(environmentName)}</strong>.</p>
  <p><strong>Commit SHA:</strong> <code>${sanitizeHtml(commitSha.slice(0, 8))}</code></p>
  <p><strong>Release:</strong> ${sanitizeHtml(title)}</p>

  <h4>Database Migration Safety</h4>
  <p>${riskBadge} ${sanitizeHtml(migrationRisk.recommendation)}</p>
  <ul>
    ${detailsList}
  </ul>

  <details>
    <summary><strong>Rollback Procedure & Emergency Instructions</strong></summary>
    <p>In case of production regression or failed environment smoke checks, execute:</p>
    <pre><code>${sanitizeHtml(rollback.revertCommand)}\ngit push origin main\n${sanitizeHtml(rollback.redeployCommand)}</code></pre>
  </details>
</div>
`.trim();

  const sanitized = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'div',
      'span',
      'h3',
      'h4',
      'p',
      'ul',
      'li',
      'code',
      'pre',
      'details',
      'summary',
      'strong',
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      div: ['class'],
      span: ['style'],
    },
  });

  return `${sanitized}\n<!-- [automated-agent] -->`;
}

export function buildDeployingPatch(currentTags?: string): JsonPatchDocument {
  return buildTagPatch(currentTags, '[deploying]');
}
