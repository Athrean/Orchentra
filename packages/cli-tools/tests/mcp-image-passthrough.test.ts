import { describe, expect, test } from 'bun:test'
import { buildMcpToolDefinition } from '../src/mcp/bridge'
import type { McpClient } from '../src/mcp/client'
import type { McpToolsCallResult } from '../src/mcp/protocol'
import type { ToolContext, ToolDefinition } from '@orchentra/cli-core'

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function fakeClient(result: McpToolsCallResult): McpClient {
  return { callTool: async () => result } as unknown as McpClient
}

function toolDef(result: McpToolsCallResult): ToolDefinition {
  return buildMcpToolDefinition({
    serverName: 'srv',
    spec: { name: 'shoot', inputSchema: { type: 'object' } },
    client: fakeClient(result),
    level: 'read',
    timeoutMs: 1000,
  })
}

const ctx = { sessionId: 's', cwd: '/tmp' } as ToolContext

describe('MCP image passthrough', () => {
  test('forwards an image result as an image content block, keeping the text', async () => {
    const def = toolDef({
      content: [
        { type: 'text', text: 'captured' },
        { type: 'image', data: PNG_1X1, mimeType: 'image/png' },
      ],
    })
    const res = await def.execute({}, ctx)
    expect(res.images).toEqual([{ data: PNG_1X1, mediaType: 'image/png' }])
    expect(res.content).toContain('captured')
    expect(res.isError).toBe(false)
  })

  test('text-only results attach no images', async () => {
    const def = toolDef({ content: [{ type: 'text', text: 'just text' }] })
    const res = await def.execute({}, ctx)
    expect(res.images).toBeUndefined()
    expect(res.content).toBe('just text')
  })

  test('an oversized image result is dropped with a clear note rather than forwarded', async () => {
    const def = toolDef({
      content: [{ type: 'image', data: 'A'.repeat(8 * 1024 * 1024), mimeType: 'image/png' }],
    })
    const res = await def.execute({}, ctx)
    expect(res.images).toBeUndefined()
    expect(res.content).toMatch(/exceeds|too large|cap/i)
  })
})
