import type { CoreTool } from 'ai'
import type { z } from 'zod'
import { type Permission, type ToolDefinition, ToolRegistry } from '../tool-registry'
import { githubActionsTool } from './github-actions'
import { getCommitChangesTool, getFileContentTool } from './github-repo'
import { getPullRequestTool, getIssueTool, searchCodeTool } from './github-issues'
import { postCommentTool } from './post-comment'

function adapt(name: string, permission: Permission, t: CoreTool): ToolDefinition {
  return {
    name,
    permission,
    description: t.description ?? '',
    parameters: t.parameters as unknown as z.ZodSchema,
    execute: t.execute as unknown as (args: unknown) => Promise<unknown>,
  }
}

export function registerBuiltinTools(registry: ToolRegistry): void {
  registry.register(adapt('get_workflow_logs', 'read', githubActionsTool))
  registry.register(adapt('get_commit_changes', 'read', getCommitChangesTool))
  registry.register(adapt('get_file_content', 'read', getFileContentTool))
  registry.register(adapt('get_pull_request', 'read', getPullRequestTool))
  registry.register(adapt('get_issue', 'read', getIssueTool))
  registry.register(adapt('search_code', 'read', searchCodeTool))
  registry.register(adapt('post_comment', 'write', postCommentTool))
}
