import { describe, expect, test } from 'bun:test'
import { LineBuffer, RequestDispatcher, RingBuffer, matchResponseId } from '../src/mcp/transport'

describe('LineBuffer', () => {
  test('emits complete lines and holds partial', () => {
    const buf = new LineBuffer()
    expect(buf.push('hello')).toEqual([])
    expect(buf.push('\nwor')).toEqual(['hello'])
    expect(buf.push('ld\n')).toEqual(['world'])
  })

  test('splits multiple lines in one chunk', () => {
    const buf = new LineBuffer()
    expect(buf.push('a\nb\nc\n')).toEqual(['a', 'b', 'c'])
  })

  test('strips trailing carriage return', () => {
    const buf = new LineBuffer()
    expect(buf.push('line\r\nnext\r\n')).toEqual(['line', 'next'])
  })

  test('skips blank lines', () => {
    const buf = new LineBuffer()
    expect(buf.push('\n\nreal\n')).toEqual(['real'])
  })

  test('flush returns pending partial', () => {
    const buf = new LineBuffer()
    buf.push('partial')
    expect(buf.flush()).toBe('partial')
    expect(buf.flush()).toBeNull()
  })
})

describe('RingBuffer', () => {
  test('retains under capacity', () => {
    const buf = new RingBuffer(100)
    buf.push('abc')
    buf.push('def')
    expect(buf.toString()).toBe('abcdef')
  })

  test('evicts oldest chunks when overflowing', () => {
    const buf = new RingBuffer(5)
    buf.push('aaa')
    buf.push('bbb')
    buf.push('ccc')
    expect(buf.toString().length).toBeLessThanOrEqual(6)
    expect(buf.toString().endsWith('ccc')).toBe(true)
  })
})

describe('RequestDispatcher', () => {
  test('resolves a pending request when the response arrives', async () => {
    const dispatcher = new RequestDispatcher()
    const pending = dispatcher.register(1, 1000, () => {})
    const dispatched = dispatcher.dispatch({ jsonrpc: '2.0', id: 1, result: { ok: true } })
    expect(dispatched).toBe(true)
    const response = await pending
    expect('result' in response ? response.result : null).toEqual({ ok: true })
  })

  test('rejects on timeout and calls onTimeout', async () => {
    const dispatcher = new RequestDispatcher()
    let called = false
    const pending = dispatcher.register(2, 10, () => {
      called = true
    })
    await expect(pending).rejects.toThrow('timed out')
    expect(called).toBe(true)
    expect(dispatcher.size()).toBe(0)
  })

  test('dispatch returns false for unknown id', () => {
    const dispatcher = new RequestDispatcher()
    const dispatched = dispatcher.dispatch({ jsonrpc: '2.0', id: 99, result: null })
    expect(dispatched).toBe(false)
  })

  test('rejectAll rejects all pending with the given error', async () => {
    const dispatcher = new RequestDispatcher()
    const p1 = dispatcher.register(1, 10_000, () => {})
    const p2 = dispatcher.register(2, 10_000, () => {})
    dispatcher.rejectAll(new Error('closing'))
    await expect(p1).rejects.toThrow('closing')
    await expect(p2).rejects.toThrow('closing')
    expect(dispatcher.size()).toBe(0)
  })
})

describe('matchResponseId', () => {
  test('matches by id', () => {
    expect(matchResponseId({ id: 1 }, 1)).toBe(true)
    expect(matchResponseId({ id: 'abc' }, 'abc')).toBe(true)
    expect(matchResponseId({ id: 1 }, 2)).toBe(false)
    expect(matchResponseId(null, 1)).toBe(false)
  })
})
