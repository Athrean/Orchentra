import { randomUUID } from 'node:crypto'
import {
  type PermissionMode,
  type Provider,
  type ToolRegistry,
  UsageTracker,
  emptyUsage,
  buildSystemPrompt,
  ConversationRuntime,
  type ConversationConfig,
  type ConversationDeps,
  type RuntimeEvent,
  type SystemPrompt,
} from '@orchentra/cli-core'
import { GitHubClient, type WorkflowRun, type WorkflowJob } from '@orchentra/cli-api'
import {
  AnthropicProvider,
  OpenAiCompatProvider,
  OPENAI_CONFIG,
  XAI_CONFIG,
  DASHSCOPE_CONFIG,
} from '@orchentra/cli-api'
import { DefaultToolRegistry, BUILTIN_TOOLS } from '@orchentra/cli-tools'
import { renderDoneLine, renderErrorLine, renderToolCall, renderToolResult, Spinner } from '../renderer'

export interface InvestigateOptions {
  owner: string
  repo: string
  runId: number
  model: string
  permissionMode: PermissionMode
  cwd: string
}

const INVESTIGATE_SYSTEM = `You are an expert DevOps engineer triaging CI/CD failures.

Given workflow run metadata and failing job logs, produce a concise triage brief with:

1. **Summary** — one-sentence root cause hypothesis
2. **Evidence** — specific log lines or error messages supporting the hypothesis
3. **Category** — one of: flaky-test, config-error, dependency-issue, code-bug, infrastructure, timeout, permission
4. **Confidence** — high / medium / low
5. **Suggested fix** — concrete next step (e.g., "pin dependency X to version Y" or "re-run with env var Z set")

Keep the brief under 200 words. Be specific — reference file names, line numbers, and error codes when available.`

export async function runInvestigate(options: InvestigateOptions): Promise<number> {
  const spinner = new Spinner()
  spinner.start('Fetching workflow run...')

  const client = new GitHubClient()

  let run: WorkflowRun
  try {
    run = await client.getWorkflowRun(options.owner, options.repo, options.runId)
  } catch (err) {
    spinner.stop()
    process.stderr.write(`error fetching workflow run: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }

  if (run.conclusion === 'success') {
    spinner.stop()
    process.stdout.write(`Workflow run #${run.id} "${run.name}" completed successfully — nothing to investigate.\n`)
    return 0
  }

  spinner.start('Fetching failed jobs...')
  let jobs: WorkflowJob[]
  try {
    jobs = await client.getWorkflowJobs(options.owner, options.repo, options.runId)
  } catch (err) {
    spinner.stop()
    process.stderr.write(`error fetching jobs: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }

  const failedJobs = jobs.filter((j) => j.conclusion === 'failure')
  if (failedJobs.length === 0) {
    spinner.stop()
    process.stdout.write(
      `Run #${run.id} failed but no individual jobs show failure. Status: ${run.status}, conclusion: ${run.conclusion}.\n`,
    )
    return 0
  }

  spinner.start(`Fetching logs for ${failedJobs.length} failed job(s)...`)
  const logs: string[] = []
  for (const job of failedJobs) {
    try {
      const log = await client.getJobLog(options.owner, options.repo, job.id)
      const truncated = log.length > 8000 ? log.slice(-8000) : log
      logs.push(`## Job: ${job.name} (id: ${job.id})\n\`\`\`\n${truncated}\n\`\`\``)
    } catch (err) {
      logs.push(
        `## Job: ${job.name} (id: ${job.id})\nLog fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  spinner.stop()

  const prompt = buildInvestigatePrompt(run, failedJobs, logs)

  process.stdout.write(`\n--- Investigating ${options.owner}/${options.repo}#${options.runId} ---\n\n`)

  const provider = resolveProvider(options.model)
  const tools = buildToolRegistry()
  const tracker = new UsageTracker()
  const sessionId = randomUUID()

  const config: ConversationConfig = {
    model: options.model,
    maxOutputTokens: 4096,
    contextWindowTokens: 200_000,
    compactionThreshold: 0.8,
    keepRecentOnCompact: 6,
    budget: { maxSteps: 20, maxTokens: 200_000 },
    sessionId,
    cwd: options.cwd,
  }

  const systemPrompt: SystemPrompt = buildSystemPrompt({
    staticParts: [INVESTIGATE_SYSTEM],
    dynamicParts: [`Repository: ${options.owner}/${options.repo}`, `Branch: ${run.headBranch}`, `SHA: ${run.headSha}`],
  })

  const deps: ConversationDeps = {
    provider,
    tools,
    systemPrompt,
  }

  const runtime = new ConversationRuntime(config, deps)
  let steps = 0
  let lastUsage = emptyUsage()

  try {
    for await (const event of runtime.run({ userMessage: prompt })) {
      handleEvent(event)
      if (event.kind === 'usage') {
        lastUsage = event.cumulative
        tracker.record(event.turn)
      }
      if (event.kind === 'done') {
        steps = event.steps
        lastUsage = event.usage
      }
    }

    process.stdout.write('\n' + renderDoneLine(steps, lastUsage, options.model) + '\n')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    process.stdout.write('\n' + renderErrorLine(message) + '\n')
    return 1
  }

  return 0
}

function buildInvestigatePrompt(run: WorkflowRun, failedJobs: WorkflowJob[], logs: string[]): string {
  const failedSteps = failedJobs
    .flatMap((j) => j.steps.filter((s) => s.conclusion === 'failure').map((s) => `  - ${s.name} (${s.conclusion})`))
    .join('\n')

  return `Investigate this failed workflow run:

**Run**: #${run.id} — ${run.name}
**Status**: ${run.status} / ${run.conclusion}
**Branch**: ${run.headBranch}
**Event**: ${run.event}
**Created**: ${run.createdAt}

**Failed steps**:
${failedSteps}

**Logs**:
${logs.join('\n\n')}

Produce the triage brief now.`
}

function handleEvent(event: RuntimeEvent): void {
  switch (event.kind) {
    case 'text':
      process.stdout.write(event.delta)
      break
    case 'tool_use':
      process.stdout.write('\n' + renderToolCall(event.call.name, event.call.input) + '\n')
      break
    case 'tool_result':
      process.stdout.write(renderToolResult(event.result.content, event.result.isError) + '\n')
      break
    case 'error':
      if (!event.retryable) {
        process.stdout.write(renderErrorLine(event.message) + '\n')
      }
      break
  }
}

function resolveProvider(model: string): Provider {
  const lower = model.toLowerCase()
  if (lower.startsWith('gpt') || lower.includes('openai')) return new OpenAiCompatProvider(OPENAI_CONFIG)
  if (lower.startsWith('grok') || lower.includes('xai')) return new OpenAiCompatProvider(XAI_CONFIG)
  if (lower.includes('qwen') || lower.includes('dashscope')) return new OpenAiCompatProvider(DASHSCOPE_CONFIG)
  return new AnthropicProvider()
}

function buildToolRegistry(): ToolRegistry {
  const registry = new DefaultToolRegistry()
  for (const tool of BUILTIN_TOOLS) {
    registry.register(tool)
  }
  return registry
}
