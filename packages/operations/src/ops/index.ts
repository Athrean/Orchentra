import type { Operation } from '../types'
import { getWorkflowLogsOperation } from './github/get-workflow-logs'

export const operations: Operation[] = [getWorkflowLogsOperation as Operation]
