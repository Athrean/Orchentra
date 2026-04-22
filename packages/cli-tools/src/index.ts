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
