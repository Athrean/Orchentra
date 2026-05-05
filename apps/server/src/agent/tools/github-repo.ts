/**
 * Re-export wrapper. Read-scoped op bodies are migrating to @orchentra/operations
 * one at a time; this file keeps the original `tool({...})` shape so existing
 * in-process agent loop callers stay unchanged for one release per the project
 * alias rule.
 */
import { tool } from 'ai'
import { setGithubAdapter, setRepoMonitoredCheck, type GithubAdapter } from '@orchentra/operations'
import { getCommitChangesOperation } from '@orchentra/operations/ops/github/get-commit-changes'
import { getFileContentOperation } from '@orchentra/operations/ops/github/get-file-content'
import { getOctokit } from '../../github/octokit'
import { isRepoMonitored } from '../../lib/repo-cache'

const localCtx = { remote: false as const, allowedScopes: new Set<'read' | 'write' | 'admin'>(['read']) }

/**
 * Re-bind the operations-package adapters to the live server modules on every
 * call. Doing it per-call (rather than once at module load) makes the wiring
 * resilient to bun:test's mock.module overrides that redefine these modules
 * after this wrapper has already loaded.
 */
function bindOpsAdapters(): void {
  setGithubAdapter(getOctokit() as unknown as GithubAdapter)
  setRepoMonitoredCheck((fullName) => isRepoMonitored(fullName))
}

export const getCommitChangesTool = tool({
  description: getCommitChangesOperation.description,
  parameters: getCommitChangesOperation.parameters,
  execute: async (args) => {
    bindOpsAdapters()
    return getCommitChangesOperation.handler(localCtx, args)
  },
})

export const getFileContentTool = tool({
  description: getFileContentOperation.description,
  parameters: getFileContentOperation.parameters,
  execute: async (args) => {
    bindOpsAdapters()
    return getFileContentOperation.handler(localCtx, args)
  },
})
