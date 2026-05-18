import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render as inkRender } from 'ink-testing-library'
import { WelcomeBanner } from '../src/render/banner'

describe('WelcomeBanner', () => {
  const baseOpts = {
    cliName: 'orchentra',
    cliVersion: '0.1.0',
    model: 'claude-sonnet-4-6',
    permissionMode: 'workspace-write' as const,
    cwd: '/tmp/example',
  }

  test('produces multi-line output including the product name and version', () => {
    const out = runWith({ NO_COLOR: '1' }, () => renderFrame(baseOpts))
    const lines = out.trimEnd().split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(3)
    expect(out).toContain('Orchentra')
    expect(out).toContain('v0.1.0')
  })

  test('shows the human-readable model name and provider on the meta line', () => {
    const out = runWith({ NO_COLOR: '1' }, () => renderFrame({ ...baseOpts, providerName: 'anthropic' }))
    expect(out).toContain('Claude Sonnet 4.6')
    expect(out).not.toContain('claude-sonnet-4-6')
    expect(out).toContain('anthropic')
  })

  test('falls back to the raw id when the model is unknown', () => {
    const out = runWith({ NO_COLOR: '1' }, () =>
      renderFrame({ ...baseOpts, model: 'self-hosted-llama-7b', providerName: 'local' }),
    )
    expect(out).toContain('self-hosted-llama-7b')
  })

  test('shortens the home directory to ~ in the cwd line', () => {
    const home = process.env.HOME ?? '/home/u'
    const out = runWith({ NO_COLOR: '1', HOME: home }, () => renderFrame({ ...baseOpts, cwd: `${home}/projects/foo` }))
    expect(out).toContain('~/projects/foo')
    expect(out).not.toContain(home)
  })
})

function renderFrame(opts: Parameters<typeof WelcomeBanner>[0]): string {
  const { lastFrame } = inkRender(<WelcomeBanner {...opts} />)
  return lastFrame() ?? ''
}

function runWith<T>(env: Record<string, string>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {}
  const touched = ['NO_COLOR', 'FORCE_COLOR', 'COLORTERM', 'TERM', 'HOME']
  for (const key of touched) saved[key] = process.env[key]
  for (const key of touched) delete process.env[key]
  for (const [k, v] of Object.entries(env)) process.env[k] = v
  try {
    return fn()
  } finally {
    for (const key of touched) {
      const prev = saved[key]
      if (prev === undefined) delete process.env[key]
      else process.env[key] = prev
    }
  }
}
