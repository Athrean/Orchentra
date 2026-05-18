import { describe, expect, test } from 'bun:test'
import * as barrel from '../src/index'

/**
 * Lock the public surface of @orchentra/mcp-server. External consumers
 * (apps/server, the docs site) import from the barrel; if a
 * future refactor renames or drops one of these names the test breaks
 * loudly instead of silently regressing the consumers.
 */
describe('@orchentra/mcp-server barrel exports', () => {
  test('exports the stdio transport entrypoint', () => {
    expect(typeof barrel.startStdioServer).toBe('function')
  })

  test('exports the shared rpc handler', () => {
    expect(typeof barrel.handleRpc).toBe('function')
  })

  test('exports the HTTP transport handler', () => {
    expect(typeof barrel.handleHttpRpc).toBe('function')
  })

  test('exports the Hono adapter', () => {
    expect(typeof barrel.mountMcpRoutes).toBe('function')
  })

  test('exports the MCP error serializer for parity testing', () => {
    expect(typeof barrel.serializeOperationErrorForMcp).toBe('function')
  })
})
