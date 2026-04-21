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
  type SystemPrompt,
} from '@orchentra/cli-core'
import {
  GitHubClient,
  type WorkflowRun,
  type WorkflowJob,
  AnthropicProvider,
  OpenAiCompatProvider,
  OPENAI_CONFIG,
  XAI_CONFIG,
  DASHSCOPE_CONFIG,
} from '@orchentra/cli-api'
import { DefaultToolRegistry, BUILTIN_TOOLS } from '@orchentra/cli-tools'
import { renderDoneLine, renderErrorLine, renderToolCall, renderToolResult, Spinner } from '../renderer'

export interface TriageOptions {
  owner: string
  repo: string
  runId: number
  model: string
  permissionMode: PermissionMode
  cwd: string
}

const TRIAGE_SYSTEM = `You are a CI/CD triage agent. Analyze the provided workflow failure and produce a structured triage report in GitHub-flavored markdown.

Your output MUST follow this exact format:

## Triage: <one-line summary>

**Category**: <flaky-test | config-error | dependency-issue | code-bug | infrastructure | timeout | permission>
**Confidence**: <high | medium | low>
**Root cause**: <1-2 sentence explanation>

### Evidence
<bulleted list of specific log lines, error messages, or patterns>

### Suggested Fix
<concrete action items>

Keep the total output under 300 words. Be specific with file names, line numbers, and error codes.`

export async function runTriage(options: TriageOptions): Promise<number> {
  const spinner = new Spinner()
  const client = new GitHubClient()

  spinner.start('Fetching workflow run...')
  let run: WorkflowRun
  try {
    run = await client.getWorkflowRun(options.owner, options.repo, options.runId)
  } catch (err) {
    spinner.stop()
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }

  if (run.conclusion === 'success') {
    spinner.stop()
    process.stdout.write('Run succeeded — nothing to triage.\n')
    return 0
  }

  spinner.start('Fetching failed jobs...')
  const jobs = await client.getWorkflowJobs(options.owner, options.repo, options.runId)
  const failedJobs = jobs.filter((j) => j.conclusion === 'failure')

  spinner.start('Fetching logs...')
  const logs: string[] = []
  for (const job of failedJobs) {
    try {
      const log = await client.getJobLog(options.owner, options.repo, job.id)
      logs.push(log.length > 8000 ? log.slice(-8000) : log)
    } catch (err) {
      logs.push(`[log fetch failed: ${err instanceof Error ? err.message : String(err)}]`)
    }
  }
  spinner.stop()

  const prompt = buildTriagePrompt(run, failedJobs, logs)

  const provider = resolveProvider(options.model)
  const tools = buildToolRegistry()
  const tracker = new UsageTracker()

  const config: ConversationConfig = {
    model: options.model,
    maxOutputTokens: 4096,
    contextWindowTokens: 200_000,
    compactionThreshold: 0.8,
    keepRecentOnCompact: 6,
    budget: { maxSteps: 20, maxTokens: 200_000 },
    sessionId: randomUUID(),
    cwd: options.cwd,
  }

  const systemPrompt: SystemPrompt = buildSystemPrompt({
    staticParts: [TRIAGE_SYSTEM],
    dynamicParts: [`Repository: ${options.owner}/${options.repo}`, `SHA: ${run.headSha}`],
  })

  const deps: ConversationDeps = { provider, tools, systemPrompt }
  const runtime = new ConversationRuntime(config, deps)

  let report = ''
  let steps = 0
  let lastUsage = emptyUsage()

  try {
    for await (const event of runtime.run({ userMessage: prompt })) {
      if (event.kind === 'text') {
        report += event.delta
        process.stdout.write(event.delta)
      } else if (event.kind === 'tool_use') {
        process.stdout.write('\n' + renderToolCall(event.call.name, event.call.input) + '\n')
      } else if (event.kind === 'tool_result') {
        process.stdout.write(renderToolResult(event.result.content, event.result.isError) + '\n')
      } else if (event.kind === 'usage') {
        lastUsage = event.cumulative
        tracker.record(event.turn)
      } else if (event.kind === 'done') {
        steps = event.steps
        lastUsage = event.usage
      }
    }
  } catch (err) {
    process.stdout.write('\n' + renderErrorLine(err instanceof Error ? err.message : String(err)) + '\n')
    return 1
  }

  process.stdout.write('\n\n--- Posting triage to GitHub ---\n')

  try {
    await postTriageToGithub(client, options, run, report)
  } catch (err) {
    process.stderr.write(`error posting to GitHub: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }

  process.stdout.write('\n' + renderDoneLine(steps, lastUsage, options.model) + '\n')
  return 0
}

async function postTriageToGithub(
  client: GitHubClient,
  options: TriageOptions,
  run: WorkflowRun,
  report: string,
): Promise<void> {
  await client.createCommitStatus(options.owner, options.repo, run.headSha, {
    state: 'failure',
    description: `Triage: ${run.name} analyzed`,
    context: 'orchentra/triage',
  })

  await client.createCheckRun(options.owner, options.repo, run.headSha, {
    name: 'Orchentra Triage',
    status: 'completed',
    conclusion: 'neutral',
    output: {
      title: `Triage for run #${run.id}`,
      summary: report.slice(0, 65535),
    },
  })

  process.stdout.write('  + Check run created on ' + run.headSha.slice(0, 7) + '\n')
  process.stdout.write('  + Commit status set to failure\n')
}

function buildTriagePrompt(run: WorkflowRun, failedJobs: WorkflowJob[], logs: string[]): string {
  const failedSteps = failedJobs
    .flatMap((j) => j.steps.filter((s) => s.conclusion === 'failure').map((s) => `  - ${j.name} > ${s.name}`))
    .join('\n')

  return `Triage this failed workflow run:

**Run**: #${run.id} — ${run.name}
**Branch**: ${run.headBranch} (${run.headSha.slice(0, 7)})
**Event**: ${run.event}
**Conclusion**: ${run.conclusion}

**Failed steps**:
${failedSteps}

**Job logs**:
${logs.join('\n\n')}
`
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
