/** One declared bridge operation used to generate and validate the RLM guest facade. */
export interface ProgramCapabilityContract {
  readonly operation: string
  readonly namespace: string
  readonly method: string
  readonly signature: string
  readonly minArgs: number
  readonly maxArgs: number
}

/** Single source for the guest facade, host bridge allowlist, and prompt vocabulary. */
export const PROGRAM_CAPABILITY_CONTRACTS = [
  { operation: 'ctx.list', namespace: 'ctx', method: 'list', signature: 'ctx.list(limit?)', minArgs: 0, maxArgs: 1 },
  {
    operation: 'ctx.read',
    namespace: 'ctx',
    method: 'read',
    signature: 'ctx.read(handle, options?)',
    minArgs: 1,
    maxArgs: 2,
  },
  {
    operation: 'ctx.search',
    namespace: 'ctx',
    method: 'search',
    signature: 'ctx.search(handle, query, options?)',
    minArgs: 2,
    maxArgs: 3,
  },
  {
    operation: 'ctx.store',
    namespace: 'ctx',
    method: 'store',
    signature: 'ctx.store(value, summary?)',
    minArgs: 1,
    maxArgs: 2,
  },
  { operation: 'tools.list', namespace: 'tools', method: 'list', signature: 'tools.list()', minArgs: 0, maxArgs: 0 },
  {
    operation: 'tools.call',
    namespace: 'tools',
    method: 'call',
    signature: 'tools.call(name, input?)',
    minArgs: 1,
    maxArgs: 2,
  },
  {
    operation: 'lm.query',
    namespace: 'lm',
    method: 'query',
    signature: 'lm.query(input, options?)',
    minArgs: 1,
    maxArgs: 2,
  },
  {
    operation: 'lm.start',
    namespace: 'lm',
    method: 'start',
    signature: 'lm.start(input, options?)',
    minArgs: 1,
    maxArgs: 2,
  },
  {
    operation: 'rlm.query',
    namespace: 'rlm',
    method: 'query',
    signature: 'rlm.query(input, options?)',
    minArgs: 1,
    maxArgs: 2,
  },
  {
    operation: 'rlm.start',
    namespace: 'rlm',
    method: 'start',
    signature: 'rlm.start(input, options?)',
    minArgs: 1,
    maxArgs: 2,
  },
  {
    operation: 'jobs.status',
    namespace: 'jobs',
    method: 'status',
    signature: 'jobs.status(jobId?)',
    minArgs: 0,
    maxArgs: 1,
  },
  { operation: 'jobs.wait', namespace: 'jobs', method: 'wait', signature: 'jobs.wait(jobId)', minArgs: 1, maxArgs: 1 },
  {
    operation: 'jobs.cancel',
    namespace: 'jobs',
    method: 'cancel',
    signature: 'jobs.cancel(jobId)',
    minArgs: 1,
    maxArgs: 1,
  },
  {
    operation: 'jobs.send',
    namespace: 'jobs',
    method: 'send',
    signature: 'jobs.send(jobId, message)',
    minArgs: 2,
    maxArgs: 2,
  },
  {
    operation: 'jobs.resume',
    namespace: 'jobs',
    method: 'resume',
    signature: 'jobs.resume(jobId, message?)',
    minArgs: 1,
    maxArgs: 2,
  },
] as const satisfies readonly ProgramCapabilityContract[]

export type ProgramOperationKind = (typeof PROGRAM_CAPABILITY_CONTRACTS)[number]['operation']

export const PROGRAM_CAPABILITY_SIGNATURES = PROGRAM_CAPABILITY_CONTRACTS.map((contract) => contract.signature)
