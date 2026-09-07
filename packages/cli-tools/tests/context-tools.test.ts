import { describe, expect, test } from 'bun:test'
import { RunContextStore, type ToolContext } from '@orchentra/cli-core'
import { contextListTool, contextReadTool, contextSearchTool, contextStoreTool } from '../src/tools/context-tools'

function ctx(store?: RunContextStore): ToolContext {
  return { sessionId: 's', cwd: '/tmp', contextStore: store }
}

describe('RLM context tools', () => {
  test('store/list/search/read round-trip through the run-owned store', async () => {
    const store = new RunContextStore('run-tools')
    const stored = await contextStoreTool.execute({ text: 'alpha needle omega', summary: 'facts' }, ctx(store))
    expect(stored.isError).toBe(false)
    const handle = (stored.data as { handle: string }).handle

    const listed = await contextListTool.execute({}, ctx(store))
    expect(listed.content).toContain(handle)
    expect(listed.content).toContain('untrusted')

    const searched = await contextSearchTool.execute({ handle, query: 'needle' }, ctx(store))
    expect(searched.content).toContain('[6..12]')

    const read = await contextReadTool.execute({ handle, offset: 6, limit: 6 }, ctx(store))
    expect(read.content).toContain('NEEDLE'.toLowerCase())
  })

  test('fails closed without an RLM context store', async () => {
    for (const tool of [contextListTool, contextReadTool, contextSearchTool, contextStoreTool]) {
      const result = await tool.execute({}, ctx())
      expect(result).toEqual({
        content: 'context store unavailable outside the RLM execution profile',
        isError: true,
      })
    }
  })

  test('context_read preserves native images and typed evidence', async () => {
    const store = new RunContextStore('run-image')
    const descriptor = await store.storeToolResult(
      {
        id: 'shot',
        content: 'screenshot',
        isError: false,
        images: [{ data: 'aGVsbG8=', mediaType: 'image/png' }],
        evidence: [{ kind: 'browser-screenshot', summary: 'visible' }],
      },
      'browser_screenshot',
    )

    const result = await contextReadTool.execute({ handle: descriptor.handle }, ctx(store))
    expect(result.images).toEqual([{ data: 'aGVsbG8=', mediaType: 'image/png' }])
    expect(result.evidence).toEqual([{ kind: 'browser-screenshot', summary: 'visible' }])
  })
})
