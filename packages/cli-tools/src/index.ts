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
