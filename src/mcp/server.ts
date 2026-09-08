import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

export interface InProcessMcpServerResult {
  server: McpServer;
  clientTransport: InMemoryTransport;
  serverTransport: InMemoryTransport;
}

/**
 * Creates and connects an in-process McpServer using an InMemoryTransport pair.
 */
export async function createInProcessMcpServer(
  serverName = 'sdlc-worker',
  version = '1.0.0'
): Promise<InProcessMcpServerResult> {
  const server = new McpServer({ name: serverName, version });
  (server as any).setToolRequestHandlers?.();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  return { server, clientTransport, serverTransport };
}
