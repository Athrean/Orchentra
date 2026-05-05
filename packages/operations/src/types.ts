import type { ZodTypeAny } from 'zod'

/**
 * A single declarative operation. Same contract powers the in-process agent
 * loop, the stdio MCP server, and any future transport. The full Phase 1A
 * contract (scope, localOnly, mutating, handler) lands with #290; this stub
 * carries only the fields the `--print-tools-json` serializer needs.
 */
export interface Operation {
  id: string
  description: string
  parameters: ZodTypeAny
}
