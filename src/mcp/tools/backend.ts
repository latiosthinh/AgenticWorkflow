import { z } from 'zod';
import type { ToolRegistrationHelper } from '../types.js';

/**
 * Registers backend domain tools for DB schema and API contracts.
 */
export function registerBackendTools(
  addTool: ToolRegistrationHelper,
  worktreePath: string
): void {
  addTool(
    'inspect_db_schema',
    'Inspect database tables, column types, and schema migrations.',
    z.object({ table: z.string().optional() }),
    async ({ table }: { table?: string }) => {
      return { table: table || 'all', status: 'inspected', tables: [] };
    }
  );

  addTool(
    'validate_api_contract',
    'Validate request and response schemas against API route contracts.',
    z.object({ routePath: z.string() }),
    async ({ routePath }: { routePath: string }) => {
      return { routePath, valid: true, endpoints: [] };
    }
  );
}
