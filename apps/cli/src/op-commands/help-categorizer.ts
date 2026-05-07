/**
 * Categorize operation ids into help screen sections. Centralizes the map
 * so HelpCommand and any future help renderer agree on grouping.
 */

export const OP_CATEGORIES = ['Pulls', 'Issues', 'Repos', 'Branches', 'Actions', 'Checks', 'Secrets', 'Brain'] as const
export type OpCategory = (typeof OP_CATEGORIES)[number]

const PULL_OPS = new Set([
  'get_pull_request',
  'list_pull_requests',
  'create_pull_request',
  'request_pr_review',
  'merge_pull_request',
])

const ISSUE_OPS = new Set(['get_issue', 'list_issues', 'create_issue', 'update_issue', 'post_comment'])

const ACTION_OPS = new Set([
  'list_workflow_runs',
  'get_workflow_run',
  'get_workflow_run_jobs',
  'get_job_logs',
  'get_workflow_logs',
  'list_workflow_run_artifacts',
  'download_artifact',
  'delete_artifact',
  'rerun_workflow',
  'rerun_failed_jobs',
  'cancel_workflow_run',
  'dispatch_workflow',
])

const SECRET_OPS = new Set(['list_repo_secrets', 'set_repo_secret'])

const CHECK_OPS = new Set(['list_check_runs', 'create_check_run', 'create_commit_status'])

const BRANCH_OPS = new Set(['list_branches', 'create_branch'])

const BRAIN_OPS = new Set(['list_episodes', 'record_episode', 'get_runbook', 'list_runbooks', 'export_skills_md'])

export function categoryForOp(opId: string): OpCategory | 'Unknown' {
  if (PULL_OPS.has(opId)) return 'Pulls'
  if (ISSUE_OPS.has(opId)) return 'Issues'
  if (ACTION_OPS.has(opId)) return 'Actions'
  if (CHECK_OPS.has(opId)) return 'Checks'
  if (BRANCH_OPS.has(opId)) return 'Branches'
  if (SECRET_OPS.has(opId)) return 'Secrets'
  if (BRAIN_OPS.has(opId)) return 'Brain'
  // Repos catches everything left from the GitHub adapter family
  // (get_repo_metadata, get_file_content, get_commit_changes, search_code,
  // create_or_update_file_contents, create_commit_status' siblings, etc.)
  if (
    opId.includes('repo') ||
    opId.includes('file') ||
    opId.includes('commit') ||
    opId.includes('search') ||
    opId.includes('content')
  ) {
    return 'Repos'
  }
  return 'Unknown'
}
