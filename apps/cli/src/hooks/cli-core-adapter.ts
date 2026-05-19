import { HookRunner as CoreHookRunner, type HookRunResult } from '@orchentra/cli-core'
import { createHookRunner, type HookRunner } from './hook-runner'

function allowWithMessages(messages: string[]): HookRunResult {
  return {
    denied: false,
    failed: false,
    cancelled: false,
    messages,
  }
}

function parseArgs(inputJson: string): unknown {
  try {
    return JSON.parse(inputJson)
  } catch {
    return inputJson
  }
}

export class CliCoreHookAdapter extends CoreHookRunner {
  private readonly inner: HookRunner

  constructor(cwd: string) {
    super()
    this.inner = createHookRunner({ cwd })
  }

  override async runPreToolUse(toolName: string, toolInput: string): Promise<HookRunResult> {
    const args = parseArgs(toolInput)
    const result = await this.inner.firePreToolUse(toolName, args)
    if (result.blocked) {
      const reason = result.blockedReason ?? `${toolName} blocked by pre_tool_use hook`
      return { denied: true, failed: false, cancelled: false, messages: [reason] }
    }
    return allowWithMessages(result.annotations ? [...result.annotations] : [])
  }

  override async runPostToolUse(
    toolName: string,
    toolInput: string,
    toolOutput: string,
    _isError: boolean,
  ): Promise<HookRunResult> {
    const args = parseArgs(toolInput)
    const result = await this.inner.firePostToolUse(toolName, args, toolOutput)
    return allowWithMessages(result.annotations ? [...result.annotations] : [])
  }

  override async runPostToolUseFailure(toolName: string, toolInput: string, toolError: string): Promise<HookRunResult> {
    const args = parseArgs(toolInput)
    const result = await this.inner.firePostToolUse(toolName, args, new Error(toolError))
    return allowWithMessages(result.annotations ? [...result.annotations] : [])
  }
}
