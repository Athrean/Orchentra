import type { Operation } from '../types'
import { getWorkflowLogsOperation } from './github/get-workflow-logs'
import { getCommitChangesOperation } from './github/get-commit-changes'
import { getFileContentOperation } from './github/get-file-content'
import { getPullRequestOperation } from './github/get-pull-request'
import { getIssueOperation } from './github/get-issue'
import { searchCodeOperation } from './github/search-code'
import { postCommentOp } from './github/post-comment'
import { listPullRequestsOperation } from './github/list-pull-requests'
import { listIssuesOperation } from './github/list-issues'
import { listCheckRunsOperation } from './github/list-check-runs'
import { recordEpisodeOperation } from './brain/record-episode'
import { listEpisodesOperation } from './brain/list-episodes'
import { getRunbookOperation } from './brain/get-runbook'
import { listRunbooksOperation } from './brain/list-runbooks'
import { exportSkillsMdOperation } from './brain/export-skills-md'

export const operations: Operation[] = [
  // GitHub adapter ops (Phase 1A)
  getWorkflowLogsOperation as Operation,
  getCommitChangesOperation as Operation,
  getFileContentOperation as Operation,
  getPullRequestOperation as Operation,
  getIssueOperation as Operation,
  searchCodeOperation as Operation,
  postCommentOp as Operation,
  // GitHub read ops batch B (Slice 5)
  listPullRequestsOperation as Operation,
  listIssuesOperation as Operation,
  listCheckRunsOperation as Operation,
  // Brain ops (Phase 2 skeleton)
  recordEpisodeOperation as Operation,
  listEpisodesOperation as Operation,
  getRunbookOperation as Operation,
  listRunbooksOperation as Operation,
  exportSkillsMdOperation as Operation,
]
