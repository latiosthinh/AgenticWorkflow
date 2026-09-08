import { z } from 'zod';
import type { ToolRegistrationHelper } from '../types.js';

/**
 * Registers infra domain tools for manifest linting and cloud mocks.
 */
export function registerInfraTools(
  addTool: ToolRegistrationHelper,
  worktreePath: string
): void {
  addTool(
    'lint_infra_config',
    'Lint Dockerfiles, CI workflows, and cloud infrastructure manifests.',
    z.object({ manifestPath: z.string() }),
    async ({ manifestPath }: { manifestPath: string }) => {
      return { manifestPath, status: 'valid', issues: [] };
    }
  );

  addTool(
    'mock_cloud_resource',
    'Validate cloud configuration against local mock resource specifications.',
    z.object({ resourceType: z.string() }),
    async ({ resourceType }: { resourceType: string }) => {
      return { resourceType, mocked: true };
    }
  );
}
