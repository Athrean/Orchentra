import type { Operation } from '../types'
import { getWorkflowLogsOperation } from './github/get-workflow-logs'
import { getCommitChangesOperation } from './github/get-commit-changes'
import { getFileContentOperation } from './github/get-file-content'
import { getPullRequestOperation } from './github/get-pull-request'
import { getIssueOperation } from './github/get-issue'
import { searchCodeOperation } from './github/search-code'
import { postCommentOp } from './github/post-comment'

export const operations: Operation[] = [
  getWorkflowLogsOperation as Operation,
  getCommitChangesOperation as Operation,
  getFileContentOperation as Operation,
  getPullRequestOperation as Operation,
  getIssueOperation as Operation,
  searchCodeOperation as Operation,
  postCommentOp as Operation,
]
