import { HookRunner as CoreHookRunner, type HookRunResult, type PermissionOverride } from '@orchentra/cli-core'
import { createHookRunner, type HookRunner } from './hook-runner'
import type { HookProgressUpdate } from './types'

interface ParsedAnnotationOutput {
  messages: string[]
  denied: boolean
  permissionOverride?: PermissionOverride
  permissionReason?: string
  updatedInput?: string
}

function allowWithMessages(messages: string[], parsed?: Partial<HookRunResult>): HookRunResult {
  return {
    denied: false,
    failed: false,
    cancelled: false,
    messages,
    ...parsed,
  }
}

function parseArgs(inputJson: string): unknown {
  try {
    return JSON.parse(inputJson)
  } catch {
    return inputJson
  }
}

function parseAnnotation(annotation: string): ParsedAnnotationOutput {
  const trimmed = annotation.trim()
  if (!trimmed) return { messages: [], denied: false }

  let root: Record<string, unknown>
  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { messages: [annotation], denied: false }
    }
    root = parsed as Record<string, unknown>
  } catch {
    return { messages: [annotation], denied: false }
  }

  const output: ParsedAnnotationOutput = { messages: [], denied: false }

  const systemMessage = root.systemMessage
  if (typeof systemMessage === 'string') output.messages.push(systemMessage)

  const reason = root.reason
  if (typeof reason === 'string') output.messages.push(reason)

  if (root.continue === false || root.decision === 'block') {
    output.denied = true
  }

  const specific = root.hookSpecificOutput
  if (specific && typeof specific === 'object' && !Array.isArray(specific)) {
    const obj = specific as Record<string, unknown>
    const additionalContext = obj.additionalContext
    if (typeof additionalContext === 'string') output.messages.push(additionalContext)

    const decision = obj.permissionDecision
    if (decision === 'allow' || decision === 'deny' || decision === 'ask') {
      output.permissionOverride = decision
    }

    const permissionReason = obj.permissionDecisionReason
    if (typeof permissionReason === 'string') output.permissionReason = permissionReason

    const updatedInput = obj.updatedInput
    if (updatedInput !== undefined) output.updatedInput = JSON.stringify(updatedInput)
  }

  if (output.messages.length === 0) output.messages.push(annotation)
  return output
}

function parseAnnotations(annotations: readonly string[] | undefined): ParsedAnnotationOutput {
  const merged: ParsedAnnotationOutput = { messages: [], denied: false }
  for (const annotation of annotations ?? []) {
    const parsed = parseAnnotation(annotation)
    merged.messages.push(...parsed.messages)
    merged.denied = merged.denied || parsed.denied
    if (parsed.permissionOverride) merged.permissionOverride = parsed.permissionOverride
    if (parsed.permissionReason) merged.permissionReason = parsed.permissionReason
    if (parsed.updatedInput) merged.updatedInput = parsed.updatedInput
  }
  return merged
}

export class CliCoreHookAdapter extends CoreHookRunner {
  private readonly inner: HookRunner

  constructor(cwd: string, onProgress?: (update: HookProgressUpdate) => void) {
    super()
    this.inner = createHookRunner({ cwd, onProgress })
  }

  override async runPreToolUse(toolName: string, toolInput: string): Promise<HookRunResult> {
    const args = parseArgs(toolInput)
    const result = await this.inner.firePreToolUse(toolName, args)
    const parsed = parseAnnotations(result.annotations)
    if (result.blocked) {
      const reason = result.blockedReason ?? `${toolName} blocked by pre_tool_use hook`
      return {
        denied: true,
        failed: false,
        cancelled: false,
        messages: [reason, ...parsed.messages],
        permissionOverride: parsed.permissionOverride,
        permissionReason: parsed.permissionReason,
        updatedInput: parsed.updatedInput,
      }
    }
    if (parsed.denied) {
      return {
        denied: true,
        failed: false,
        cancelled: false,
        messages: parsed.messages,
        permissionOverride: parsed.permissionOverride,
        permissionReason: parsed.permissionReason,
        updatedInput: parsed.updatedInput,
      }
    }
    return allowWithMessages(parsed.messages, {
      permissionOverride: parsed.permissionOverride,
      permissionReason: parsed.permissionReason,
      updatedInput: parsed.updatedInput,
    })
  }

  override async runPostToolUse(
    toolName: string,
    toolInput: string,
    toolOutput: string,
    _isError: boolean,
  ): Promise<HookRunResult> {
    const args = parseArgs(toolInput)
    const result = await this.inner.firePostToolUse(toolName, args, toolOutput)
    return allowWithMessages(parseAnnotations(result.annotations).messages)
  }

  override async runPostToolUseFailure(toolName: string, toolInput: string, toolError: string): Promise<HookRunResult> {
    const args = parseArgs(toolInput)
    const result = await this.inner.firePostToolUse(toolName, args, new Error(toolError))
    return allowWithMessages(parseAnnotations(result.annotations).messages)
  }
}
