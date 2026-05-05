import { operations, type Operation } from '@orchentra/operations'
import { zodToJsonSchema } from 'zod-to-json-schema'

export interface McpServeOptions {
  printToolsJson: boolean
}

/**
 * Shape of one entry in the MCP `tools/list` response. We mirror this exactly
 * so install scripts and audit tooling can treat `--print-tools-json` output
 * as a snapshot of `tools/list` without spawning the server.
 */
export interface ToolDefinitionJson {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export function buildToolsJson(ops: readonly Operation[]): ToolDefinitionJson[] {
  return ops.map((op) => ({
    name: op.id,
    description: op.description,
    inputSchema: zodToJsonSchema(op.parameters, { target: 'jsonSchema7' }) as Record<string, unknown>,
  }))
}

export async function runMcpServe(options: McpServeOptions): Promise<number> {
  if (options.printToolsJson) {
    const tools = buildToolsJson(operations)
    process.stdout.write(JSON.stringify(tools, null, 2) + '\n')
    return 0
  }
  // Real stdio MCP server boot lands with #290; this stub keeps the verb
  // registered so the flag has a host to attach to.
  process.stderr.write('mcp serve: stdio server not yet implemented (tracked in #290)\n')
  return 1
}
