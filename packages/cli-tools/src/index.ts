export type { ValidationResult, CommandIntent } from './bash-validation'

export {
  WRITE_COMMANDS,
  STATE_MODIFYING_COMMANDS,
  WRITE_REDIRECTIONS,
  DESTRUCTIVE_PATTERNS,
  ALWAYS_DESTRUCTIVE_COMMANDS,
  GIT_READ_ONLY_SUBCOMMANDS,
  SEMANTIC_READ_ONLY_COMMANDS,
  NETWORK_COMMANDS,
  PROCESS_COMMANDS,
  PACKAGE_COMMANDS,
  SYSTEM_ADMIN_COMMANDS,
  extractFirstCommand,
  validateReadOnly,
  checkDestructive,
  validateMode,
  validateSed,
  validatePaths,
  classifyCommand,
  validateCommand,
} from './bash-validation'

export type {
  TextFilePayload,
  ReadFileOutput,
  StructuredPatchHunk,
  WriteFileOutput,
  EditFileOutput,
  GlobSearchOutput,
  GrepSearchInput,
  GrepSearchOutput,
} from './file-ops'

export {
  readFile,
  writeFile,
  editFile,
  globSearch,
  grepSearch,
  readFileInWorkspace,
  globSearchInWorkspace,
  grepSearchInWorkspace,
  writeFileInWorkspace,
  editFileInWorkspace,
  isSymlinkEscape,
  expandBraces,
} from './file-ops'

export { DefaultToolRegistry, BUILTIN_TOOLS } from './tool-registry'
export { bashTool } from './tools/bash-tool'
export { fileReadTool } from './tools/file-read-tool'
export { fileWriteTool } from './tools/file-write-tool'
export { fileEditTool } from './tools/file-edit-tool'
export { globTool } from './tools/glob-tool'
export { grepTool } from './tools/grep-tool'
export { diagnosticsTool } from './tools/diagnostics-tool'
export {
  parseDiagnostics,
  diagnosticsReport,
  type Diagnostic,
  type DiagnosticsReport,
  type Severity,
} from './diagnostics'
export { webFetchTool } from './tools/web-fetch-tool'
export { webSearchTool } from './tools/web-search-tool'
export { askUserTool } from './tools/ask-user-tool'
export { todoWriteTool } from './tools/todo-write-tool'
export { agentTool } from './tools/agent-tool'
export { SubagentReplayExecutor, type SubagentReplayOptions } from './tools/gate-replay'
export { resolveSubagentRole, restrictRegistry, type SubagentRole } from './tools/subagent-roles'
export { notebookEditTool } from './tools/notebook-edit-tool'
export { gitStatusTool, gitDiffTool, gitLogTool } from './tools/git-tools'
export { enterPlanModeTool, exitPlanModeTool } from './tools/plan-mode-tool'
export {
  browserTools,
  browserNavigateTool,
  browserSnapshotTool,
  browserActTool,
  browserScreenshotTool,
  browserCloseTool,
} from './tools/browser-tools'
export {
  githubListIssuesTool,
  githubGetIssueTool,
  listGitHubIssues,
  getGitHubIssue,
  type GitHubDeps,
  type ListIssuesInput,
  type ListIssuesResult,
  type GetIssueInput,
  type GetIssueResult,
  type IssueSummary,
  type IssueDetail,
} from './github/issues'
export { parseGitHubUrl, type ParsedGitHubUrl } from './github/url'
export {
  githubListPullsTool,
  githubGetPullTool,
  listGitHubPulls,
  getGitHubPull,
  type ListPullsInput,
  type ListPullsResult,
  type GetPullInput,
  type GetPullResult,
  type PullSummary,
  type PullDetail,
  type PullFileChange,
} from './github/pulls'
export {
  githubSearchIssuesTool,
  searchGitHubIssues,
  type SearchIssuesInput,
  type SearchIssuesResult,
  type SearchIssueItem,
} from './github/search'

export {
  McpClient,
  McpManager,
  buildMcpToolDefinition,
  buildMcpToolSearchTool,
  MCP_TOOL_SEARCH_NAME,
  DEFAULT_MCP_DEFER_TOKENS,
  mcpToolName,
  mcpToolPrefix,
  normalizeNameForMcp,
  isMcpToolName,
  parseMcpConfig,
  substituteEnv,
} from './mcp'
export type {
  McpConnectionState,
  McpConnectionStatus,
  McpServerConfig,
  McpStdioConfig,
  McpHttpConfig,
  McpTransport,
  McpConfigParseResult,
  McpToolSpec,
  McpToolsCallResult,
  McpContentBlock,
  McpInitializeResult,
} from './mcp'
