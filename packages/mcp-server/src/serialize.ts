// Stub — implementation lands with the parity tests in this slice.
import type { OperationError } from '@orchentra/operations'

export interface McpToolCallErrorResponse {
  isError: true
  content: Array<{ type: 'text'; text: string }>
}

export function serializeOperationErrorForMcp(err: OperationError): McpToolCallErrorResponse {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(err.toJSON()) }],
  }
}
