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

export interface FixOptions {
  owner: string
  repo: string
  runId: number
  model: string
  permissionMode: PermissionMode
  cwd: string
}

const FIX_SYSTEM = `You are an expert software engineer fixing CI/CD failures.

You have access to file read, write, and edit tools. Your task:
1. Read the failing workflow logs to understand the root cause
2. Read the relevant source files in the repository
3. Make targeted code changes to fix the issue
4. Output a summary of all changes you made

Rules:
- Make minimal, targeted changes — do not refactor surrounding code
- Every change must trace directly to the failure cause
- If you cannot determine the fix, say so explicitly rather than guessing
- Output a CHANGELOG section at the end listing each file changed and why`

export async function runFix(options: FixOptions): Promise<number> {
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
    process.stdout.write('Run succeeded — nothing to fix.\n')
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

  const prompt = buildFixPrompt(run, failedJobs, logs)

  process.stdout.write(`\n--- Fixing ${options.owner}/${options.repo}#${options.runId} ---\n\n`)

  const provider = resolveProvider(options.model)
  const tools = buildToolRegistry()
  const tracker = new UsageTracker()

  const config: ConversationConfig = {
    model: options.model,
    maxOutputTokens: 8192,
    contextWindowTokens: 200_000,
    compactionThreshold: 0.8,
    keepRecentOnCompact: 6,
    budget: { maxSteps: 50, maxTokens: 200_000 },
    sessionId: randomUUID(),
    cwd: options.cwd,
  }

  const systemPrompt: SystemPrompt = buildSystemPrompt({
    staticParts: [FIX_SYSTEM],
    dynamicParts: [`Repository: ${options.owner}/${options.repo}`, `Branch: ${run.headBranch}`, `SHA: ${run.headSha}`],
  })

  const deps: ConversationDeps = { provider, tools, systemPrompt }
  const runtime = new ConversationRuntime(config, deps)

  let steps = 0
  let lastUsage = emptyUsage()

  try {
    for await (const event of runtime.run({ userMessage: prompt })) {
      if (event.kind === 'text') {
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

  process.stdout.write('\n\n--- Attempting to open PR ---\n')

  try {
    await openFixPr(client, options, run)
  } catch (err) {
    process.stderr.write(`error opening PR: ${err instanceof Error ? err.message : String(err)}\n`)
    process.stdout.write('Changes were applied locally. You can create a PR manually.\n')
  }

  process.stdout.write('\n' + renderDoneLine(steps, lastUsage, options.model) + '\n')
  return 0
}

async function openFixPr(client: GitHubClient, options: FixOptions, run: WorkflowRun): Promise<void> {
  const branchName = `orchentra/fix-run-${run.id}`
  const title = `fix(ci): resolve failure in workflow run #${run.id}`

  const pr = await client.createIdempotentPr(options.owner, options.repo, {
    title,
    body: `Automated fix for workflow run #${run.id} (${run.name}).\n\nBranch: ${run.headBranch}\nSHA: ${run.headSha}`,
    head: branchName,
    base: run.headBranch,
  })

  if (pr.htmlUrl) {
    process.stdout.write(`  PR: ${pr.htmlUrl}\n`)
  } else {
    process.stdout.write(`  PR #${pr.number} created (or existing found)\n`)
  }
}

function buildFixPrompt(run: WorkflowRun, failedJobs: WorkflowJob[], logs: string[]): string {
  const failedSteps = failedJobs
    .flatMap((j) => j.steps.filter((s) => s.conclusion === 'failure').map((s) => `  - ${j.name} > ${s.name}`))
    .join('\n')

  return `Fix this failed workflow run. Analyze the logs, identify the root cause, and make the necessary code changes.

**Run**: #${run.id} — ${run.name}
**Branch**: ${run.headBranch} (${run.headSha.slice(0, 7)})
**Conclusion**: ${run.conclusion}

**Failed steps**:
${failedSteps}

**Logs**:
${logs.join('\n\n')}

Read the relevant files, apply fixes, and summarize your changes.`
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
