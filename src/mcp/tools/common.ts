import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { runCommand } from '../../sandbox/runner.js';
import type { ToolRegistrationHelper } from '../types.js';

/**
 * Registers baseline tools mounted for all work items.
 */
export function registerCommonTools(
  addTool: ToolRegistrationHelper,
  worktreePath: string,
  knownSecrets: string[] = []
): void {
  // Tool 1: git_status
  addTool(
    'git_status',
    'Inspect git working tree status and active branch.',
    z.object({}),
    async () => {
      return runCommand('git', ['status', '--short', '--branch'], { cwd: worktreePath }, knownSecrets);
    }
  );

  // Tool 2: read_file
  addTool(
    'read_file',
    'Read file contents at specified relative path within worktree.',
    z.object({ path: z.string() }),
    async ({ path: inputPath }: { path: string }) => {
      const resolvedWorktree = path.resolve(worktreePath);
      const resolvedTarget = path.resolve(worktreePath, inputPath);
      const relative = path.relative(resolvedWorktree, resolvedTarget);

      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Path traversal denied: '${inputPath}' is outside worktree boundary`);
      }

      const content = await fs.promises.readFile(resolvedTarget, 'utf8');
      return { path: inputPath, content };
    }
  );

  // Tool 3: run_test
  addTool(
    'run_test',
    'Execute test runner commands inside sandbox under 120s timeout.',
    z.object({
      command: z.string(),
      args: z.array(z.string()).optional(),
    }),
    async ({ command, args }: { command: string; args?: string[] }) => {
      return runCommand(command, args || [], { cwd: worktreePath }, knownSecrets);
    }
  );
}
