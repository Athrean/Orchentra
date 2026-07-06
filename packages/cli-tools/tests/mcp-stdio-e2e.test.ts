import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { McpClient } from '../src/mcp/client'
import { StdioTransport } from '../src/mcp/transport-stdio'
import { McpManager } from '../src/mcp/manager'
import { DefaultToolRegistry } from '../src/tool-registry'

const FIXTURE_PATH = resolve(import.meta.dir, 'fixtures/fake-mcp-server.ts')

describe('MCP stdio end-to-end', () => {
  test('connects, lists one tool, and calls it', async () => {
    const transport = new StdioTransport({
      command: 'bun',
      args: [FIXTURE_PATH],
      env: {},
    })
    const client = new McpClient({ transport, defaultTimeoutMs: 2_000 })
    try {
      const init = await client.connect()
      expect(init.serverInfo.name).toBe('fake-mcp-server')
      const tools = await client.listTools()
      expect(tools.length).toBe(1)
      expect(tools[0].name).toBe('echo')
      const result = await client.callTool('echo', { message: 'hello world' })
      expect(result.isError).toBe(false)
      expect(result.content[0]).toEqual({ type: 'text', text: 'hello world' })
    } finally {
      await client.close()
    }
  })

  test('manager connects, registers tools into a DefaultToolRegistry, and executes', async () => {
    const raw = {
      servers: {
        fake: {
          transport: 'stdio',
          command: 'bun',
          args: [FIXTURE_PATH],
        },
      },
    }
    const manager = McpManager.fromRaw(raw)
    const registry = new DefaultToolRegistry()
    const statuses = await manager.connectAll()
    try {
      expect(statuses.length).toBe(1)
      expect(statuses[0].state).toBe('connected')
      expect(statuses[0].toolCount).toBe(1)
      const added = manager.registerInto(registry)
      expect(added).toBe(1)
      expect(registry.has('mcp__fake__echo')).toBe(true)
      expect(registry.requirements().mcp__fake__echo).toBe('workspace-write')
      const result = await registry.execute(
        'mcp__fake__echo',
        { message: 'from registry' },
        { sessionId: 't', cwd: process.cwd() },
      )
      expect(result.isError).toBe(false)
      expect(result.content).toBe('from registry')
    } finally {
      await manager.shutdown()
    }
  })

  test('defers tools behind mcp_tool_search when their schema cost exceeds the budget', async () => {
    const raw = {
      servers: {
        fake: {
          transport: 'stdio',
          command: 'bun',
          args: [FIXTURE_PATH],
        },
      },
    }
    const manager = McpManager.fromRaw(raw)
    const registry = new DefaultToolRegistry([])
    await manager.connectAll()
    try {
      // A budget of 1 token forces deferral of even a single small tool.
      const added = manager.registerInto(registry, { deferOverTokens: 1, estimateTokens: (s) => s.length })
      expect(added).toBe(1)
      // The real tool is deferred; only the search surface is registered.
      expect(registry.has('mcp__fake__echo')).toBe(false)
      expect(registry.has('mcp_tool_search')).toBe(true)

      // Searching loads the matching tool, which then executes as normal.
      const search = await registry.execute(
        'mcp_tool_search',
        { query: 'echo' },
        { sessionId: 't', cwd: process.cwd() },
      )
      expect(search.isError).toBe(false)
      expect(registry.has('mcp__fake__echo')).toBe(true)
      const result = await registry.execute(
        'mcp__fake__echo',
        { message: 'loaded on demand' },
        { sessionId: 't', cwd: process.cwd() },
      )
      expect(result.content).toBe('loaded on demand')
    } finally {
      await manager.shutdown()
    }
  })

  test('loads tools directly when their schema cost stays under the budget', async () => {
    const raw = {
      servers: { fake: { transport: 'stdio', command: 'bun', args: [FIXTURE_PATH] } },
    }
    const manager = McpManager.fromRaw(raw)
    const registry = new DefaultToolRegistry([])
    await manager.connectAll()
    try {
      const added = manager.registerInto(registry, { deferOverTokens: 100_000, estimateTokens: (s) => s.length })
      expect(added).toBe(1)
      expect(registry.has('mcp__fake__echo')).toBe(true)
      expect(registry.has('mcp_tool_search')).toBe(false)
    } finally {
      await manager.shutdown()
    }
  })

  test('manager does not crash when a configured stdio server fails to launch', async () => {
    const raw = {
      servers: {
        missing: {
          transport: 'stdio',
          command: '/nonexistent/binary-xyz',
        },
        ok: {
          transport: 'stdio',
          command: 'bun',
          args: [FIXTURE_PATH],
        },
      },
    }
    const manager = McpManager.fromRaw(raw, { connectTimeoutMs: 3_000 })
    const statuses = await manager.connectAll()
    try {
      const missing = statuses.find((s) => s.name === 'missing')
      const ok = statuses.find((s) => s.name === 'ok')
      expect(missing?.state).toBe('failed')
      expect(ok?.state).toBe('connected')
    } finally {
      await manager.shutdown()
    }
  })
})
