import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  Provider,
  ProviderRequest,
  ProviderStreamEvent,
  ToolContext,
  ToolRegistry,
  ToolResult,
} from '@orchentra/cli-core'
import { agentTool } from '../src/tools/agent-tool'
import { fileWriteTool } from '../src/tools/file-write-tool'

// Strip hook-exported GIT_* vars so these tests behave the same when the
// suite itself runs inside a git hook (pre-commit).
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key, value]) => value !== undefined && !key.startsWith('GIT_')),
) as Record<string, string>

async function run(cmd: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(cmd, { cwd, env: cleanEnv, stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0) throw new Error(`${cmd.join(' ')} failed: ${stderr}`)
  return stdout
}

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orchentra-batch-'))
  await run(['git', 'init', '-q', '-b', 'main'], dir)
  await run(['git', 'config', 'user.email', 'test@example.com'], dir)
  await run(['git', 'config', 'user.name', 'test'], dir)
  await writeFile(join(dir, 'base.txt'), 'base\n')
  await run(['git', 'add', '.'], dir)
  await run(['git', 'commit', '-q', '-m', 'init'], dir)
  return dir
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Provider scripted per task prompt: each stream call for a prompt plays the
 * next turn in that prompt's script. Tracks concurrent streams so the test
 * can prove the two builders actually ran simultaneously.
 */
function slicedProvider(
  scripts: Record<string, ProviderStreamEvent[][]>,
  concurrency = { current: 0, max: 0 },
): { provider: Provider; concurrency: { current: number; max: number } } {
  const played = new Map<string, number>()
  const provider: Provider = {
    async *stream(req: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
      const prompt = typeof req.messages[0]?.content === 'string' ? req.messages[0].content : ''
      const turnIndex = played.get(prompt) ?? 0
      played.set(prompt, turnIndex + 1)
      concurrency.current++
      concurrency.max = Math.max(concurrency.max, concurrency.current)
      await new Promise((resolve) => setTimeout(resolve, 10))
      concurrency.current--
      const turn = scripts[prompt]?.[turnIndex] ?? [
        { kind: 'text-delta', delta: 'script exhausted' },
        { kind: 'finish', stopReason: 'end_turn' },
      ]
      for (const ev of turn) yield ev
    },
  }
  return { provider, concurrency }
}

/** Real write_file plus a fake verifier that yields exit-status evidence. */
function builderRegistry(): ToolRegistry {
  const verify: { execute: (ctx: ToolContext) => Promise<ToolResult> } = {
    execute: async () => ({
      content: 'exit 0',
      isError: false,
      evidence: [{ kind: 'exit-status', summary: 'test command exited 0', detail: { exitCode: 0 } }],
    }),
  }
  const tools = new Map<string, (args: unknown, ctx: ToolContext) => Promise<ToolResult>>([
    ['write_file', (args, ctx) => fileWriteTool.execute(args, ctx)],
    ['verify', (_args, ctx) => verify.execute(ctx)],
  ])
  return {
    list: () => [
      { name: 'write_file', description: 'write', inputSchema: { type: 'object' } },
      { name: 'verify', description: 'verify', inputSchema: { type: 'object' } },
    ],
    requirements: () => ({ write_file: 'workspace-write', verify: 'read-only' }) as never,
    has: (name) => tools.has(name),
    register: () => {},
    execute: async (name, args, ctx) => {
      const tool = tools.get(name)
      if (!tool) return { content: `unsupported tool: ${name}`, isError: true }
      return tool(args, ctx)
    },
  }
}

function writerScript(path: string, done: string): ProviderStreamEvent[][] {
  return [
    [
      { kind: 'tool-use', call: { id: `w-${path}`, name: 'write_file', input: { path, content: `${path}\n` } } },
      { kind: 'finish', stopReason: 'tool_use' },
    ],
    [
      { kind: 'tool-use', call: { id: `v-${path}`, name: 'verify', input: {} } },
      { kind: 'finish', stopReason: 'tool_use' },
    ],
    [
      { kind: 'text-delta', delta: done },
      { kind: 'finish', stopReason: 'end_turn' },
    ],
  ]
}

function batchCtx(repo: string, provider: Provider): ToolContext {
  return {
    sessionId: 'worktree-batch-test',
    cwd: repo,
    model: 'test-model',
    provider,
    tools: builderRegistry(),
  }
}

describe('agentTool worktree isolation (M6 phase-1 exit criterion)', () => {
  test('two builders complete disjoint slices in parallel worktrees, both gated, no cross-contamination', async () => {
    const repo = await initRepo()
    try {
      const { provider, concurrency } = slicedProvider({
        'build slice a': writerScript('slice-a.txt', 'built a'),
        'build slice b': writerScript('slice-b.txt', 'built b'),
      })
      const result = await agentTool.execute(
        { tasks: ['build slice a', 'build slice b'], agentType: 'builder', isolation: 'worktree' },
        batchCtx(repo, provider),
      )

      expect(result.isError).toBe(false)
      // Both children ran at the same time, not serially.
      expect(concurrency.max).toBeGreaterThanOrEqual(2)

      // Each slice owned exactly its own file — no cross-contamination — and
      // passed its completion gate before merging.
      const data = result.data as {
        slices: { files: string[]; merged: boolean; gate: { outcome: string } | null }[]
      }
      expect(data.slices.map((s) => s.files)).toEqual([['slice-a.txt'], ['slice-b.txt']])
      expect(data.slices.map((s) => s.gate?.outcome)).toEqual(['pass', 'pass'])
      expect(data.slices.map((s) => s.merged)).toEqual([true, true])

      // Both gated slices merged back into the parent tree.
      expect(await Bun.file(join(repo, 'slice-a.txt')).text()).toBe('slice-a.txt\n')
      expect(await Bun.file(join(repo, 'slice-b.txt')).text()).toBe('slice-b.txt\n')

      // The throwaway worktrees are gone: the parent repo is the only one left.
      const worktrees = await run(['git', 'worktree', 'list', '--porcelain'], repo)
      expect(worktrees.trim().split('\n\n').length).toBe(1)
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  }, 20_000)

  test('overlapping slice ownership fails loudly and merges nothing', async () => {
    const repo = await initRepo()
    try {
      const { provider } = slicedProvider({
        'task one': writerScript('shared.txt', 'one done'),
        'task two': writerScript('shared.txt', 'two done'),
      })
      const result = await agentTool.execute(
        { tasks: ['task one', 'task two'], agentType: 'builder', isolation: 'worktree' },
        batchCtx(repo, provider),
      )

      expect(result.isError).toBe(true)
      expect(result.content).toContain('overlapping slice ownership')
      expect(result.content).toContain('shared.txt')
      expect(await exists(join(repo, 'shared.txt'))).toBe(false)
      // Parent tree untouched.
      expect(await run(['git', 'status', '--porcelain'], repo)).not.toContain('shared.txt')
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  }, 20_000)

  test('a slice that fails its completion gate is not merged; its sibling still is', async () => {
    const repo = await initRepo()
    try {
      // "bad" writes a file but never produces exit-status evidence, so its
      // gate asserts fail through every retry. Script enough end_turn turns
      // to cover the initial attempt plus maxRetries.
      const noVerify: ProviderStreamEvent[][] = [
        [
          { kind: 'tool-use', call: { id: 'w-bad', name: 'write_file', input: { path: 'bad.txt', content: 'bad\n' } } },
          { kind: 'finish', stopReason: 'tool_use' },
        ],
        ...Array.from({ length: 4 }, (): ProviderStreamEvent[] => [
          { kind: 'text-delta', delta: 'claiming done without verification' },
          { kind: 'finish', stopReason: 'end_turn' },
        ]),
      ]
      const { provider } = slicedProvider({
        'good slice': writerScript('good.txt', 'good done'),
        'bad slice': noVerify,
      })
      const result = await agentTool.execute(
        { tasks: ['good slice', 'bad slice'], agentType: 'builder', isolation: 'worktree' },
        batchCtx(repo, provider),
      )

      expect(result.isError).toBe(true)
      const data = result.data as {
        tasks: { doneReason: string }[]
        slices: { merged: boolean; gate: { outcome: string } | null }[]
      }
      expect(data.tasks[1]!.doneReason).toBe('gate_failed')
      expect(data.slices.map((s) => s.merged)).toEqual([true, false])
      expect(await Bun.file(join(repo, 'good.txt')).text()).toBe('good.txt\n')
      expect(await exists(join(repo, 'bad.txt'))).toBe(false)
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  }, 20_000)

  test('worktree isolation outside a git repository is refused', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orchentra-norepo-'))
    try {
      const { provider } = slicedProvider({})
      const result = await agentTool.execute({ prompt: 'anything', isolation: 'worktree' }, batchCtx(dir, provider))
      expect(result.isError).toBe(true)
      expect(result.content).toContain('git repository')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
