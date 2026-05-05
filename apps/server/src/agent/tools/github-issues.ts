/**
 * Re-export wrapper. Read-scoped op bodies are migrating to @orchentra/operations
 * one at a time; this file keeps the original `tool({...})` shape so existing
 * in-process agent loop callers stay unchanged for one release per the project
 * alias rule.
 */
import { tool } from 'ai'
import {
  getIssueOperation,
  getPullRequestOperation,
  searchCodeOperation,
  setGithubAdapter,
  setRepoMonitoredCheck,
  type GithubAdapter,
} from '@orchentra/operations'
import { getOctokit } from '../../github/octokit'
import { isRepoMonitored } from '../../lib/repo-cache'

const localCtx = { remote: false as const, allowedScopes: new Set<'read' | 'write' | 'admin'>(['read']) }

function bindOpsAdapters(): void {
  setGithubAdapter(getOctokit() as unknown as GithubAdapter)
  setRepoMonitoredCheck((fullName) => isRepoMonitored(fullName))
}

export const getPullRequestTool = tool({
  description: getPullRequestOperation.description,
  parameters: getPullRequestOperation.parameters,
  execute: async (args) => {
    bindOpsAdapters()
    return getPullRequestOperation.handler(localCtx, args)
  },
})

export const getIssueTool = tool({
  description: getIssueOperation.description,
  parameters: getIssueOperation.parameters,
  execute: async (args) => {
    bindOpsAdapters()
    return getIssueOperation.handler(localCtx, args)
  },
})

export const searchCodeTool = tool({
  description: searchCodeOperation.description,
  parameters: searchCodeOperation.parameters,
  execute: async (args) => {
    bindOpsAdapters()
    return searchCodeOperation.handler(localCtx, args)
  },
})
