export type { Operation } from './types'
import { stubOperations } from './ops/stub'

/**
 * The single source of truth for operations exposed by every Orchentra
 * transport. Phase 1A.1 (#290) replaces these stubs with the real GitHub
 * operation set; consumers continue to import the same `operations` array.
 */
export const operations = stubOperations
