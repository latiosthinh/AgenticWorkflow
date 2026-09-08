import { createMCPClient } from '@ai-sdk/mcp';
import { createInProcessMcpServer } from './server.js';
import { registerCommonTools } from './tools/common.js';
import { registerFrontendTools } from './tools/frontend.js';
import { registerBackendTools } from './tools/backend.js';
import { registerInfraTools } from './tools/infra.js';
import type {
  DynamicMcpSession,
  ToolRegistryOptions,
  ToolRegistrationHelper,
} from './types.js';

// ponytail: in-process MCP tools; split into standalone microservices if shared across distributed runners in v2

const MAX_ACTIVE_TOOLS = 12;

/**
 * Resolves domain tags to scoped MCP toolsets with strict 12-tool cap.
 */
export async function createDynamicMcpTools(
  options: ToolRegistryOptions
): Promise<DynamicMcpSession> {
  const { server, clientTransport } = await createInProcessMcpServer();
  const registeredToolNames: string[] = [];

  const addTool: ToolRegistrationHelper = (name, description, schema, handler) => {
    if (registeredToolNames.includes(name)) {
      return;
    }

    if (registeredToolNames.length >= MAX_ACTIVE_TOOLS) {
      console.warn(`Tool '${name}' dropped: maximum ${MAX_ACTIVE_TOOLS} tools guardrail reached.`);
      return;
    }

    const conciseDescription =
      description.length > 150 ? `${description.slice(0, 147)}...` : description;

    (server as any).registerTool(
      name,
      { description: conciseDescription, inputSchema: schema },
      async (args: any) => {
        try {
          const result = await handler(args);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } catch (err: any) {
          return {
            content: [{ type: 'text', text: err?.message || String(err) }],
            isError: true,
          };
        }
      }
    );

    registeredToolNames.push(name);
  };

  // 1. Always mount common tools baseline
  registerCommonTools(addTool, options.worktreePath, options.knownSecrets ?? []);

  // 2. Resolve domain-specific tools
  const normalizedTags = (options.tags || []).map((t) => t.toLowerCase().trim());

  if (normalizedTags.includes('frontend')) {
    registerFrontendTools(addTool, options.worktreePath);
  }

  if (normalizedTags.includes('backend')) {
    registerBackendTools(addTool, options.worktreePath);
  }

  if (normalizedTags.includes('infra')) {
    registerInfraTools(addTool, options.worktreePath);
  }

  // 3. Mount extra tools if provided (e.g. for testing over-subscription)
  if (options.extraTools && Array.isArray(options.extraTools)) {
    for (const tool of options.extraTools) {
      addTool(tool.name, tool.description, tool.inputSchema, tool.handler);
    }
  }

  const mcpClient = await createMCPClient({
    transport: clientTransport as any,
  });

  const tools = await mcpClient.tools();

  return {
    tools,
    activeTools: registeredToolNames,
    activeToolCount: registeredToolNames.length,
    close: async () => {
      await mcpClient.close();
    },
  };
}
