import type { Operation } from '../types'
import { getWorkflowLogsOperation } from './github/get-workflow-logs'
import { getCommitChangesOperation } from './github/get-commit-changes'
import { getFileContentOperation } from './github/get-file-content'
import { getPullRequestOperation } from './github/get-pull-request'
import { getIssueOperation } from './github/get-issue'
import { searchCodeOperation } from './github/search-code'
import { postCommentOp } from './github/post-comment'
import { listWorkflowRunsOperation } from './github/list-workflow-runs'
import { getWorkflowRunOperation } from './github/get-workflow-run'
import { getWorkflowRunJobsOperation } from './github/get-workflow-run-jobs'
import { getJobLogsOperation } from './github/get-job-logs'
import { listPullRequestsOperation } from './github/list-pull-requests'
import { listIssuesOperation } from './github/list-issues'
import { listCheckRunsOperation } from './github/list-check-runs'
import { listBranchesOperation } from './github/list-branches'
import { getRepoMetadataOperation } from './github/get-repo-metadata'
import { listWorkflowRunArtifactsOperation } from './github/list-workflow-run-artifacts'
import { downloadArtifactOperation } from './github/download-artifact'
import { rerunWorkflowOperation } from './github/rerun-workflow'
import { rerunFailedJobsOperation } from './github/rerun-failed-jobs'
import { cancelWorkflowRunOperation } from './github/cancel-workflow-run'
import { dispatchWorkflowOperation } from './github/dispatch-workflow'
import { recordEpisodeOperation } from './brain/record-episode'
import { listEpisodesOperation } from './brain/list-episodes'
import { getRunbookOperation } from './brain/get-runbook'
import { listRunbooksOperation } from './brain/list-runbooks'
import { exportSkillsMdOperation } from './brain/export-skills-md'
import { createIssueOperation } from './github/create-issue'
import { updateIssueOperation } from './github/update-issue'
import { createPullRequestOperation } from './github/create-pull-request'
import { requestPrReviewOperation } from './github/request-pr-review'
import { createCheckRunOperation } from './github/create-check-run'
import { createCommitStatusOperation } from './github/create-commit-status'
import { createOrUpdateFileContentsOperation } from './github/create-or-update-file-contents'
import { createBranchOperation } from './github/create-branch'
import { mergePullRequestOperation } from './github/merge-pull-request'

export const operations: Operation[] = [
  // GitHub adapter ops (Phase 1A)
  getWorkflowLogsOperation as Operation,
  getCommitChangesOperation as Operation,
  getFileContentOperation as Operation,
  getPullRequestOperation as Operation,
  getIssueOperation as Operation,
  searchCodeOperation as Operation,
  postCommentOp as Operation,
  // GitHub Actions read ops (batch A — Slice 4)
  listWorkflowRunsOperation as Operation,
  getWorkflowRunOperation as Operation,
  getWorkflowRunJobsOperation as Operation,
  getJobLogsOperation as Operation,
  // GitHub read ops batch B (Slice 5)
  listPullRequestsOperation as Operation,
  listIssuesOperation as Operation,
  listCheckRunsOperation as Operation,
  listBranchesOperation as Operation,
  getRepoMetadataOperation as Operation,
  listWorkflowRunArtifactsOperation as Operation,
  downloadArtifactOperation as Operation,
  // GitHub Actions write ops (Slice 7)
  rerunWorkflowOperation as Operation,
  rerunFailedJobsOperation as Operation,
  cancelWorkflowRunOperation as Operation,
  dispatchWorkflowOperation as Operation,
  // Brain ops (Phase 2 skeleton)
  recordEpisodeOperation as Operation,
  listEpisodesOperation as Operation,
  getRunbookOperation as Operation,
  listRunbooksOperation as Operation,
  exportSkillsMdOperation as Operation,
  // GitHub issue/PR write ops (Slice 8)
  createIssueOperation as Operation,
  updateIssueOperation as Operation,
  createPullRequestOperation as Operation,
  requestPrReviewOperation as Operation,
  createCheckRunOperation as Operation,
  createCommitStatusOperation as Operation,
  // GitHub commit/branch write ops (Slice 9)
  createOrUpdateFileContentsOperation as Operation,
  createBranchOperation as Operation,
  mergePullRequestOperation as Operation,
]
