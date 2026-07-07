import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { TrustDialog, type TrustChoice } from '../src/tui/components/TrustDialog'

const ESC = String.fromCharCode(27)
const KEY_DOWN = `${ESC}[B`
const KEY_UP = `${ESC}[A`
const KEY_ENTER = '\r'

const tick = (ms = 60): Promise<void> => new Promise<void>((r) => setTimeout(r, ms))

function renderDialog(onChoose: (c: TrustChoice) => void = () => {}): ReturnType<typeof render> {
  return render(<TrustDialog cwd="/Users/x/secret-repo" onChoose={onChoose} />)
}

describe('TrustDialog — render', () => {
  test('shows the question, the cwd, and both options with the first selected', () => {
    const frame = renderDialog().lastFrame() ?? ''
    expect(frame).toContain('Do you trust the files in this folder?')
    expect(frame).toContain('/Users/x/secret-repo')
    expect(frame).toContain('1. Yes, I trust this folder')
    expect(frame).toContain('2. No, exit')
    expect(frame).toMatch(/❯\s*1\. Yes/)
  })
})

describe('TrustDialog — keyboard', () => {
  test('number key 1 trusts, 2 exits', () => {
    const calls: TrustChoice[] = []
    {
      const { stdin } = renderDialog((c) => calls.push(c))
      stdin.write('1')
    }
    {
      const { stdin } = renderDialog((c) => calls.push(c))
      stdin.write('2')
    }
    expect(calls).toEqual(['trust', 'exit'])
  })

  test('Down then Enter resolves with exit', async () => {
    let chosen: TrustChoice | null = null
    const { stdin } = renderDialog((c) => (chosen = c))
    stdin.write(KEY_DOWN)
    await tick()
    stdin.write(KEY_ENTER)
    await tick()
    expect(chosen).toBe('exit')
  })

  test('Up from the first row wraps to exit', async () => {
    const { stdin, lastFrame } = renderDialog()
    stdin.write(KEY_UP)
    await tick()
    expect(lastFrame() ?? '').toMatch(/❯\s*2\. No, exit/)
  })

  test('Esc exits', async () => {
    let chosen: TrustChoice | null = null
    const { stdin } = renderDialog((c) => (chosen = c))
    stdin.write(ESC)
    await tick()
    expect(chosen).toBe('exit')
  })
})
