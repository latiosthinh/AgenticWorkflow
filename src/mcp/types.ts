export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any) => Promise<any>;
}

export interface ToolRegistryOptions {
  worktreePath: string;
  tags: string[];
  knownSecrets?: string[];
  extraTools?: McpToolDefinition[];
}

export interface DynamicMcpSession {
  tools: Record<string, any>;
  activeTools: string[];
  activeToolCount: number;
  close: () => Promise<void>;
}

export type ToolRegistrationHelper = (
  name: string,
  description: string,
  schema: any,
  handler: (args: any) => Promise<any>
) => void;
