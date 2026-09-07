import { describe, expect, test } from 'bun:test'
import { buildLearningCurriculum, gradeLearningCase } from '../../src/evals/learning-curriculum'
import { ConversationRuntime, buildSystemPrompt, type Provider, type ToolRegistry } from '../../src/runtime'

const program = `(async () => {
  const handles = await ctx.list()
  const tables = []
  for (const entry of handles) {
    let text = '', offset = 0
    do {
      const page = await ctx.read(entry.handle, {offset, limit: 4000})
      text += page.text
      offset = page.nextOffset
    } while (offset !== null)
    tables.push(text.split('\\n').map(line => JSON.parse(line)))
  }
  const status = Object.fromEntries(tables[1].map(row => [row.key, row.status]))
  return tables[0].filter(row => row.required && status[row.key] === 'failed').map(row => row.id).sort()
})()`

describe('short-task RLM curriculum', () => {
  test('locks deterministic, disjoint short/8x/32x/adjacent-domain cases to one capability contract', () => {
    const data = buildLearningCurriculum(123)
    expect(data).toEqual(buildLearningCurriculum(123))
    expect(data.corpusHash).not.toBe(buildLearningCurriculum(124).corpusHash)
    expect(data.cases).toHaveLength(12)
    expect(new Set(data.cases.map((task) => task.interfaceHash)).size).toBe(1)
    expect(new Set(data.cases.map((task) => task.contentHash)).size).toBe(12)
    expect(data.cases.filter((task) => task.split === 'train').every((task) => task.scale === 1)).toBe(true)
    expect(
      new Set(data.cases.filter((task) => task.split === 'length-transfer').map((task) => task.input.userMessage)),
    ).toEqual(new Set([data.cases[0]!.input.userMessage]))
    for (const task of data.cases) {
      expect(task.input.contextItems[0]!.value.text!.split('\n')).toHaveLength(16 * task.scale)
      expect(gradeLearningCase(task, task.verifier.expectedIds)).toBe(true)
      expect(gradeLearningCase(task, ['wrong'])).toBe(false)
      expect(gradeLearningCase(task, [...task.verifier.expectedIds, task.verifier.expectedIds[0]])).toBe(false)
      expect(() => gradeLearningCase({ ...task, seed: task.seed + 1 }, [])).toThrow('integrity')
    }
    expect(() => buildLearningCurriculum(-1)).toThrow('uint32')
  })

  test('one unchanged program solves every scale/domain through the same governed runtime (not a model-transfer claim)', async () => {
    const firstInputSizes: number[] = []
    for (const task of buildLearningCurriculum(123).cases) {
      let turn = 0
      let answer: unknown
      const provider: Provider = {
        async *stream(request) {
          if (turn++ === 0) {
            firstInputSizes.push(JSON.stringify(request.messages).length)
            expect(JSON.stringify(request)).not.toContain(task.verifier.expectedIds[0]!)
            yield { kind: 'tool-use', call: { id: 'solve', name: 'rlm_execute', input: { code: program } } }
            yield { kind: 'finish', stopReason: 'tool_use' }
            return
          }
          yield { kind: 'text-delta', delta: JSON.stringify(answer) }
          yield { kind: 'finish', stopReason: 'end_turn' }
        },
      }
      const tools: ToolRegistry = {
        list: () => [{ name: 'rlm_execute', description: 'fixture bridge', inputSchema: { type: 'object' } }],
        has: (name) => name === 'rlm_execute',
        register: () => {},
        execute: async (_name, input, ctx) => {
          const result = await ctx.programEnvironment!.execute((input as { code: string }).code)
          answer = result.value
          return { content: JSON.stringify(answer), isError: false }
        },
      }
      const runtime = new ConversationRuntime(
        {
          model: 'scripted-fixture',
          maxOutputTokens: 1024,
          contextWindowTokens: 100_000,
          compactionThreshold: 0.8,
          keepRecentOnCompact: 4,
          budget: { maxSteps: 3, maxTokens: 100_000 },
          sessionId: 'curriculum-fixture',
          cwd: '/tmp',
          executionProfile: 'rlm',
        },
        {
          provider,
          tools,
          systemPrompt: buildSystemPrompt({ staticParts: ['fixture policy'] }),
          traceSink: { append: () => {}, finalize: () => {} },
        },
      )
      for await (const event of runtime.run(task.input)) if (event.kind === 'done') expect(event.reason).toBe('stop')
      expect(gradeLearningCase(task, answer)).toBe(true)
    }
    expect(Math.max(...firstInputSizes) - Math.min(...firstInputSizes)).toBeLessThan(128)
  })
})
