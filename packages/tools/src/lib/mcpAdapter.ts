import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { z } from 'zod'
import type { RegisteredTool, ToolCapability } from './types.js'

export type McpAdapterConfig = {
  domain: string
  clientName?: string
  transport:
    | { kind: 'http'; serverUrl: string; authToken: string }
    | { kind: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
}

export const connectMcpServer = async (
  config: McpAdapterConfig
): Promise<{ client: Client; tools: RegisteredTool[] }> => {
  const client = new Client({
    name: config.clientName ?? 'jz92-tools-adapter',
    version: '1.0.0',
  })

  const transport = config.transport.kind === 'http'
    ? new StreamableHTTPClientTransport(new URL(config.transport.serverUrl), {
        requestInit: { headers: { Authorization: `Bearer ${config.transport.authToken}` } },
      })
    : new StdioClientTransport({
        command: config.transport.command,
        args: config.transport.args,
        env: config.transport.env,
      })

  await client.connect(transport)

  const { tools: mcpTools } = await client.listTools()

  const wrapped: RegisteredTool[] = mcpTools.map((mcpTool) => {
    const capability: ToolCapability = {
      name: mcpTool.name,
      description: mcpTool.description ?? '',
      domain: config.domain,
      invocationKind: 'mcp',
      inputSchema: z.record(z.string(), z.unknown()),
      outputSchema: z.unknown(),
    }

    const handler = async (input: unknown) => {
      return client.callTool({ name: mcpTool.name, arguments: input as Record<string, unknown> })
    }

    return { capability, handler }
  })

  return { client, tools: wrapped }
}