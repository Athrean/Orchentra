/**
 * `@orchentra/mcp-server` — stdio MCP server stub.
 *
 * The real `startStdioServer` lands with the foundation slice (#290).
 * This package currently exposes only the serialization boundary
 * helpers required by slice #293 so the CLI and MCP transports can
 * agree on a single byte-stable error JSON shape.
 */

export { serializeOperationErrorForMcp, type McpToolCallErrorResponse } from './serialize'
