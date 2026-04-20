import type { PermissionOverride } from './permissions'

export type HookEvent = 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure'

export interface HookConfig {
  preToolUse: string[]
  postToolUse: string[]
  postToolUseFailure: string[]
}

export type { PermissionOverride } from './permissions'

export interface HookRunResult {
  denied: boolean
  failed: boolean
  cancelled: boolean
  messages: string[]
  permissionOverride?: PermissionOverride
  permissionReason?: string
  updatedInput?: string
}

interface ParsedHookOutput {
  messages: string[]
  deny: boolean
  permissionOverride?: PermissionOverride
  permissionReason?: string
  updatedInput?: string
}

const PREVIEW_CHAR_LIMIT = 160

function boundedPreview(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined

  let preview = ''
  for (let i = 0; i < trimmed.length; i++) {
    if (i >= PREVIEW_CHAR_LIMIT) {
      preview += '\u2026'
      break
    }
    const ch = trimmed[i]
    if (ch === '\n') preview += '\\n'
    else if (ch === '\r') preview += '\\r'
    else if (ch === '\t') preview += '\\t'
    else if (ch.charCodeAt(0) < 32) preview += `\\u{${ch.charCodeAt(0).toString(16)}}`
    else preview += ch
  }
  return preview
}

function parseToolInput(toolInput: string): unknown {
  try {
    return JSON.parse(toolInput)
  } catch {
    return { raw: toolInput }
  }
}

function hookPayload(
  event: HookEvent,
  toolName: string,
  toolInput: string,
  toolOutput: string | undefined,
  isError: boolean,
): Record<string, unknown> {
  if (event === 'PostToolUseFailure') {
    return {
      hook_event_name: event,
      tool_name: toolName,
      tool_input: parseToolInput(toolInput),
      tool_input_json: toolInput,
      tool_error: toolOutput,
      tool_result_is_error: true,
    }
  }
  return {
    hook_event_name: event,
    tool_name: toolName,
    tool_input: parseToolInput(toolInput),
    tool_input_json: toolInput,
    tool_output: toolOutput,
    tool_result_is_error: isError,
  }
}

function allowResult(messages: string[] = []): HookRunResult {
  return {
    denied: false,
    failed: false,
    cancelled: false,
    messages,
    permissionOverride: undefined,
    permissionReason: undefined,
    updatedInput: undefined,
  }
}

function parseHookOutput(
  event: HookEvent,
  toolName: string,
  command: string,
  stdout: string,
  stderr: string,
): ParsedHookOutput {
  if (!stdout.trim()) {
    return { messages: [], deny: false }
  }

  let root: Record<string, unknown>
  try {
    const parsed = JSON.parse(stdout)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {
        messages: [
          formatInvalidOutput(event, toolName, command, `expected JSON object, got ${typeof parsed}`, stdout, stderr),
        ],
        deny: false,
      }
    }
    root = parsed as Record<string, unknown>
  } catch {
    return { messages: [stdout], deny: false }
  }

  const result: ParsedHookOutput = { messages: [], deny: false }

  const systemMessage = root.systemMessage
  if (typeof systemMessage === 'string') result.messages.push(systemMessage)

  const reason = root.reason
  if (typeof reason === 'string') result.messages.push(reason)

  if (root.continue === false || root.decision === 'block') {
    result.deny = true
  }

  const specific = root.hookSpecificOutput as Record<string, unknown> | undefined
  if (specific && typeof specific === 'object') {
    const additionalContext = specific.additionalContext
    if (typeof additionalContext === 'string') result.messages.push(additionalContext)

    const decision = specific.permissionDecision
    if (decision === 'allow' || decision === 'deny' || decision === 'ask') {
      result.permissionOverride = decision
    }

    const permReason = specific.permissionDecisionReason
    if (typeof permReason === 'string') result.permissionReason = permReason

    const updatedInput = specific.updatedInput
    if (updatedInput !== undefined) {
      result.updatedInput = JSON.stringify(updatedInput)
    }
  }

  if (result.messages.length === 0) {
    result.messages.push(stdout)
  }

  return result
}

function formatInvalidOutput(
  event: HookEvent,
  toolName: string,
  command: string,
  detail: string,
  stdout: string,
  stderr: string,
): string {
  const stdoutPreview = boundedPreview(stdout) ?? '<empty>'
  const stderrPreview = boundedPreview(stderr) ?? '<empty>'
  const cmdPreview = boundedPreview(command) ?? '<empty>'
  return `hook_invalid_json: phase=${event} tool=${toolName} command=${cmdPreview} detail=${detail} stdout_preview=${stdoutPreview} stderr_preview=${stderrPreview}`
}

function mergeParsedOutput(target: HookRunResult, parsed: ParsedHookOutput): void {
  target.messages.push(...parsed.messages)
  if (parsed.permissionOverride) target.permissionOverride = parsed.permissionOverride
  if (parsed.permissionReason) target.permissionReason = parsed.permissionReason
  if (parsed.updatedInput) target.updatedInput = parsed.updatedInput
}

async function runCommand(
  command: string,
  event: HookEvent,
  toolName: string,
  toolInput: string,
  toolOutput: string | undefined,
  isError: boolean,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const payload = JSON.stringify(hookPayload(event, toolName, toolInput, toolOutput, isError))

  const env: Record<string, string> = {
    HOOK_EVENT: event,
    HOOK_TOOL_NAME: toolName,
    HOOK_TOOL_INPUT: toolInput,
    HOOK_TOOL_IS_ERROR: isError ? '1' : '0',
  }
  if (toolOutput !== undefined) {
    env.HOOK_TOOL_OUTPUT = toolOutput
  }

  const proc = Bun.spawn(['sh', '-c', command], {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'pipe',
    env: { ...process.env, ...env },
  })

  proc.stdin.write(payload)
  proc.stdin.end()

  const exitCode = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()

  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() }
}

export class HookRunner {
  private config: HookConfig

  constructor(config?: Partial<HookConfig>) {
    this.config = {
      preToolUse: config?.preToolUse ?? [],
      postToolUse: config?.postToolUse ?? [],
      postToolUseFailure: config?.postToolUseFailure ?? [],
    }
  }

  async runPreToolUse(toolName: string, toolInput: string): Promise<HookRunResult> {
    return this.runCommands('PreToolUse', this.config.preToolUse, toolName, toolInput, undefined, false)
  }

  async runPostToolUse(
    toolName: string,
    toolInput: string,
    toolOutput: string,
    isError: boolean,
  ): Promise<HookRunResult> {
    return this.runCommands('PostToolUse', this.config.postToolUse, toolName, toolInput, toolOutput, isError)
  }

  async runPostToolUseFailure(toolName: string, toolInput: string, toolError: string): Promise<HookRunResult> {
    return this.runCommands('PostToolUseFailure', this.config.postToolUseFailure, toolName, toolInput, toolError, true)
  }

  private async runCommands(
    event: HookEvent,
    commands: string[],
    toolName: string,
    toolInput: string,
    toolOutput: string | undefined,
    isError: boolean,
  ): Promise<HookRunResult> {
    if (commands.length === 0) return allowResult()

    const result = allowResult()

    for (const command of commands) {
      try {
        const { exitCode, stdout, stderr } = await runCommand(command, event, toolName, toolInput, toolOutput, isError)
        const parsed = parseHookOutput(event, toolName, command, stdout, stderr)

        if (exitCode === 0) {
          if (parsed.deny) {
            mergeParsedOutput(result, parsed)
            result.denied = true
            return result
          }
          mergeParsedOutput(result, parsed)
        } else if (exitCode === 2) {
          mergeParsedOutput(result, parsed)
          result.denied = true
          if (parsed.messages.length === 0) {
            result.messages.push(`${event} hook denied tool \`${toolName}\``)
          }
          return result
        } else {
          mergeParsedOutput(result, parsed)
          result.failed = true
          if (parsed.messages.length === 0) {
            result.messages.push(
              `${event} hook \`${command}\` failed (exit ${exitCode}) while handling \`${toolName}\``,
            )
          }
          return result
        }
      } catch (e) {
        result.failed = true
        result.messages.push(
          `${event} hook \`${command}\` failed to start for \`${toolName}\`: ${(e as Error).message}`,
        )
        return result
      }
    }

    return result
  }
}
