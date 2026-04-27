/**
 * Typed agent event union — shared contract between the runner emission path
 * (#110) and the slash command renderer (#169). Defining the type here lets
 * downstream consumers compile against a stable shape before #110 ships.
 */
export type AgentEvent =
  | { kind: 'agent:started'; repo: string; workflow: string }
  | { kind: 'agent:tool_call'; tool: string; args: Record<string, unknown> }
  | { kind: 'agent:tool_result'; tool: string; durationMs: number; isError?: boolean }
  | { kind: 'agent:synthesis' }
  | { kind: 'agent:completed'; failureType: string; confidence: number; rootCause: string }
  | { kind: 'agent:error'; message: string }
