export const TOOLS_VERSION = '0.1.0'

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
export { taskCreateTool } from './tools/task-create-tool'
export { taskGetTool } from './tools/task-get-tool'
export { taskListTool } from './tools/task-list-tool'
export { taskUpdateTool } from './tools/task-update-tool'
export { taskStopTool } from './tools/task-stop-tool'
export { webFetchTool } from './tools/web-fetch-tool'
export { webSearchTool } from './tools/web-search-tool'
export { askUserTool } from './tools/ask-user-tool'
export { todoWriteTool } from './tools/todo-write-tool'
export { agentTool } from './tools/agent-tool'
export { cronCreateTool } from './tools/cron-create-tool'
export { cronDeleteTool } from './tools/cron-delete-tool'
export { cronListTool } from './tools/cron-list-tool'
export { notebookEditTool } from './tools/notebook-edit-tool'
export { enterPlanModeTool, exitPlanModeTool } from './tools/plan-mode-tool'

export {
  McpClient,
  McpManager,
  buildMcpToolDefinition,
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
