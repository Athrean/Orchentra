export const STATUSLINE_FIELD_IDS = [
  'model-with-reasoning',
  'current-dir',
  'permissions',
  'terse-mode',
  'active-tasks',
  'session-cost',
  'five-hour-limit',
  'model',
  'reasoning',
  'project-name',
  'git-branch',
  'pull-request-number',
  'branch-changes',
  'run-state',
  'approval-mode',
  'context-remaining',
  'context-used',
  'weekly-limit',
  'codex-version',
  'context-window-size',
  'used-tokens',
  'total-input-tokens',
  'total-output-tokens',
  'thread-id',
  'fast-mode',
  'raw-output',
  'thread-title',
  'workspace-headline',
  'task-progress',
] as const

export type StatuslineFieldId = (typeof STATUSLINE_FIELD_IDS)[number]

export interface StatuslineOption {
  readonly id: StatuslineFieldId
  readonly label: string
  readonly description: string
  readonly supported: boolean
}

export interface StatuslineConfig {
  readonly useThemeColors: boolean
  readonly fields: readonly StatuslineFieldId[]
}

export const STATUSLINE_OPTIONS: readonly StatuslineOption[] = [
  {
    id: 'model-with-reasoning',
    label: 'model-with-reasoning',
    description: 'Current model name with reasoning effort',
    supported: true,
  },
  { id: 'current-dir', label: 'current-dir', description: 'Current working directory', supported: true },
  {
    id: 'permissions',
    label: 'permissions',
    description: 'Active permission profile or sandbox mode',
    supported: true,
  },
  { id: 'terse-mode', label: 'terse-mode', description: 'Active output discipline mode', supported: true },
  { id: 'active-tasks', label: 'active-tasks', description: 'Active background task count', supported: true },
  { id: 'session-cost', label: 'session-cost', description: 'Estimated session token cost', supported: true },
  {
    id: 'five-hour-limit',
    label: 'five-hour-limit',
    description: 'Remaining usage on the 5-hour usage limit',
    supported: false,
  },
  { id: 'model', label: 'model', description: 'Current model name', supported: true },
  { id: 'reasoning', label: 'reasoning', description: 'Current reasoning effort', supported: true },
  {
    id: 'project-name',
    label: 'project-name',
    description: 'Project name from the working directory',
    supported: true,
  },
  { id: 'git-branch', label: 'git-branch', description: 'Current Git branch', supported: true },
  {
    id: 'pull-request-number',
    label: 'pull-request-number',
    description: 'Open pull request number for the current branch',
    supported: false,
  },
  {
    id: 'branch-changes',
    label: 'branch-changes',
    description: 'Committed branch changes against the default branch',
    supported: false,
  },
  { id: 'run-state', label: 'run-state', description: 'Current run state', supported: true },
  { id: 'approval-mode', label: 'approval-mode', description: 'Active command approval mode', supported: true },
  {
    id: 'context-remaining',
    label: 'context-remaining',
    description: 'Percentage of context window remaining',
    supported: true,
  },
  { id: 'context-used', label: 'context-used', description: 'Percentage of context window used', supported: true },
  {
    id: 'weekly-limit',
    label: 'weekly-limit',
    description: 'Remaining usage on the weekly usage limit',
    supported: false,
  },
  { id: 'codex-version', label: 'codex-version', description: 'Orchentra CLI version', supported: true },
  {
    id: 'context-window-size',
    label: 'context-window-size',
    description: 'Total context window size in tokens',
    supported: true,
  },
  { id: 'used-tokens', label: 'used-tokens', description: 'Total tokens used in session', supported: true },
  {
    id: 'total-input-tokens',
    label: 'total-input-tokens',
    description: 'Total input tokens used in session',
    supported: true,
  },
  {
    id: 'total-output-tokens',
    label: 'total-output-tokens',
    description: 'Total output tokens used in session',
    supported: true,
  },
  { id: 'thread-id', label: 'thread-id', description: 'Current session identifier', supported: true },
  { id: 'fast-mode', label: 'fast-mode', description: 'Whether Fast mode is currently active', supported: false },
  { id: 'raw-output', label: 'raw-output', description: 'Whether raw scrollback mode is active', supported: false },
  {
    id: 'thread-title',
    label: 'thread-title',
    description: 'Current thread title or identifier when unnamed',
    supported: false,
  },
  {
    id: 'workspace-headline',
    label: 'workspace-headline',
    description: 'Workspace notification headline',
    supported: false,
  },
  {
    id: 'task-progress',
    label: 'task-progress',
    description: 'Latest structured task progress from planning tools',
    supported: false,
  },
]

export const DEFAULT_STATUSLINE_CONFIG: StatuslineConfig = {
  useThemeColors: true,
  fields: [
    'model-with-reasoning',
    'current-dir',
    'git-branch',
    'context-used',
    'active-tasks',
    'permissions',
    'terse-mode',
    'session-cost',
  ],
}

const SUPPORTED_IDS = new Set(STATUSLINE_OPTIONS.flatMap((option) => (option.supported ? [option.id] : [])))

export function isStatuslineFieldId(value: unknown): value is StatuslineFieldId {
  return typeof value === 'string' && (STATUSLINE_FIELD_IDS as readonly string[]).includes(value)
}

export function normalizeStatuslineConfig(value: unknown): StatuslineConfig {
  if (!value || typeof value !== 'object') return DEFAULT_STATUSLINE_CONFIG
  const raw = value as { useThemeColors?: unknown; fields?: unknown }
  const fields = Array.isArray(raw.fields)
    ? raw.fields.filter((field): field is StatuslineFieldId => isStatuslineFieldId(field) && SUPPORTED_IDS.has(field))
    : DEFAULT_STATUSLINE_CONFIG.fields
  return {
    useThemeColors:
      typeof raw.useThemeColors === 'boolean' ? raw.useThemeColors : DEFAULT_STATUSLINE_CONFIG.useThemeColors,
    fields: fields.length > 0 ? dedupe(fields) : DEFAULT_STATUSLINE_CONFIG.fields,
  }
}

function dedupe(fields: readonly StatuslineFieldId[]): StatuslineFieldId[] {
  const seen = new Set<StatuslineFieldId>()
  const out: StatuslineFieldId[] = []
  for (const field of fields) {
    if (seen.has(field)) continue
    seen.add(field)
    out.push(field)
  }
  return out
}
