import { z } from 'zod'
import type { Operation } from '../types'

/**
 * Stub operations used until #290 lands the real GitHub op set. They exist so
 * `orchentra mcp serve --print-tools-json` has a stable shape to print and so
 * the serializer test has fixtures.
 */
export const stubOperations: Operation[] = [
  {
    id: 'ping',
    description: 'Returns "pong". Smoke-test op for the operations contract.',
    parameters: z.object({}),
  },
  {
    id: 'echo',
    description: 'Echoes the input message back unchanged.',
    parameters: z.object({
      message: z.string().describe('The message to echo'),
    }),
  },
  {
    id: 'add',
    description: 'Returns the sum of two numbers.',
    parameters: z.object({
      a: z.number().describe('First addend'),
      b: z.number().describe('Second addend'),
    }),
  },
]
