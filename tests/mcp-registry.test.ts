import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createDynamicMcpTools } from '../src/mcp/registry.js';
import type { McpToolDefinition } from '../src/mcp/types.js';

describe('Dynamic MCP Tool Registry & Tag Dispatcher', () => {
  it('registers 3 common tools for untagged work items', async () => {
    const session = await createDynamicMcpTools({
      worktreePath: process.cwd(),
      tags: [],
    });

    expect(session.activeToolCount).toBe(3);
    expect(session.activeTools).toEqual(['git_status', 'read_file', 'run_test']);
    expect(session.tools.git_status).toBeDefined();
    expect(session.tools.read_file).toBeDefined();
    expect(session.tools.run_test).toBeDefined();

    await session.close();
  });

  it('mounts common + frontend tools (5 tools total) for ["frontend"] tag', async () => {
    const session = await createDynamicMcpTools({
      worktreePath: process.cwd(),
      tags: ['frontend'],
    });

    expect(session.activeToolCount).toBe(5);
    expect(session.activeTools).toContain('inspect_dom_structure');
    expect(session.activeTools).toContain('inspect_css_styles');
    expect(session.tools.inspect_dom_structure).toBeDefined();
    expect(session.tools.inspect_css_styles).toBeDefined();

    await session.close();
  });

  it('mounts common + backend tools (5 tools total) for ["backend"] tag', async () => {
    const session = await createDynamicMcpTools({
      worktreePath: process.cwd(),
      tags: ['backend'],
    });

    expect(session.activeToolCount).toBe(5);
    expect(session.activeTools).toContain('inspect_db_schema');
    expect(session.activeTools).toContain('validate_api_contract');
    expect(session.tools.inspect_db_schema).toBeDefined();
    expect(session.tools.validate_api_contract).toBeDefined();

    await session.close();
  });

  it('mounts common + infra tools (5 tools total) for ["infra"] tag', async () => {
    const session = await createDynamicMcpTools({
      worktreePath: process.cwd(),
      tags: ['infra'],
    });

    expect(session.activeToolCount).toBe(5);
    expect(session.activeTools).toContain('lint_infra_config');
    expect(session.activeTools).toContain('mock_cloud_resource');
    expect(session.tools.lint_infra_config).toBeDefined();
    expect(session.tools.mock_cloud_resource).toBeDefined();

    await session.close();
  });

  it('mounts all domain tools for multi-tag ["frontend", "backend", "infra"] without exceeding limit', async () => {
    const session = await createDynamicMcpTools({
      worktreePath: process.cwd(),
      tags: ['frontend', 'backend', 'infra'],
    });

    expect(session.activeToolCount).toBe(9);
    expect(session.activeToolCount).toBeLessThanOrEqual(12);
    expect(session.activeTools).toEqual([
      'git_status',
      'read_file',
      'run_test',
      'inspect_dom_structure',
      'inspect_css_styles',
      'inspect_db_schema',
      'validate_api_contract',
      'lint_infra_config',
      'mock_cloud_resource',
    ]);

    await session.close();
  });

  it('enforces maximum 12-tool cap during artificial over-subscription', async () => {
    const extraTools: McpToolDefinition[] = Array.from({ length: 6 }, (_, i) => ({
      name: `extra_tool_${i + 1}`,
      description: `Extra test tool ${i + 1} for oversubscription testing.`,
      inputSchema: z.object({}),
      handler: async () => ({ ok: true }),
    }));

    // 9 domain + common tools + 6 extra tools = 15 attempted tools
    const session = await createDynamicMcpTools({
      worktreePath: process.cwd(),
      tags: ['frontend', 'backend', 'infra'],
      extraTools,
    });

    expect(session.activeToolCount).toBe(12);
    expect(session.activeTools.length).toBe(12);
    // Tools 1, 2, 3 were added (total 12); tools 4, 5, 6 dropped
    expect(session.activeTools).toContain('extra_tool_1');
    expect(session.activeTools).toContain('extra_tool_2');
    expect(session.activeTools).toContain('extra_tool_3');
    expect(session.activeTools).not.toContain('extra_tool_4');

    await session.close();
  });

  it('prevents path traversal outside worktreePath in read_file', async () => {
    const session = await createDynamicMcpTools({
      worktreePath: process.cwd(),
      tags: [],
    });

    const traversalResult = await session.tools.read_file.execute({
      path: '../../etc/passwd',
    });

    expect(traversalResult.isError).toBe(true);
    expect(traversalResult.content[0].text).toMatch(/Path traversal denied/i);

    // Normal path within worktree succeeds
    const validResult = await session.tools.read_file.execute({
      path: 'package.json',
    });
    expect(validResult.isError).toBeFalsy();
    expect(validResult.content[0].text).toContain('agentic-workflow');

    await session.close();
  });

  it('closes transport session cleanly', async () => {
    const session = await createDynamicMcpTools({
      worktreePath: process.cwd(),
      tags: ['frontend'],
    });

    await expect(session.close()).resolves.toBeUndefined();
  });
});
