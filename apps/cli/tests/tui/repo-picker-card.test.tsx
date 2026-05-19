import { describe, expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
import { RepoPickerCard } from '../../src/tui/components/RepoPickerCard'
import type { RepoPickerItem } from '../../src/commands/ui-output'

const SAMPLE: readonly RepoPickerItem[] = [
  { fullName: 'acme/api', installed: true, monitored: true },
  { fullName: 'acme/very-long-name', installed: true, monitored: false },
  { fullName: 'other/lib', installed: false, monitored: false },
]

describe('RepoPickerCard', () => {
  test('renders the Installed tab by default and lists installed repos only', () => {
    const { lastFrame } = render(<RepoPickerCard repos={SAMPLE} current={null} onPick={() => {}} onCancel={() => {}} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('acme/api')
    expect(out).toContain('acme/very-long-name')
    expect(out).not.toContain('other/lib')
  })

  test('shows the All tab label even when not focused', () => {
    const { lastFrame } = render(<RepoPickerCard repos={SAMPLE} current={null} onPick={() => {}} onCancel={() => {}} />)
    const out = lastFrame() ?? ''
    expect(out).toContain('Installed')
    expect(out).toContain('All')
  })

  test('marks the active repo as current', () => {
    const { lastFrame } = render(
      <RepoPickerCard repos={SAMPLE} current="acme/api" onPick={() => {}} onCancel={() => {}} />,
    )
    const out = lastFrame() ?? ''
    expect(out).toContain('(current)')
  })

  test('aligns the tag column across rows', () => {
    const { lastFrame } = render(<RepoPickerCard repos={SAMPLE} current={null} onPick={() => {}} onCancel={() => {}} />)
    const out = lastFrame() ?? ''
    const lines = out.split('\n')
    const apiLine = lines.find((l) => l.includes('acme/api'))
    const longLine = lines.find((l) => l.includes('acme/very-long-name'))
    expect(apiLine).toBeDefined()
    expect(longLine).toBeDefined()
    expect(apiLine!.indexOf('✓ installed')).toBe(longLine!.indexOf('✓ installed'))
  })

  test('renders an empty hint when no repos match the active tab', () => {
    const onlyUninstalled: readonly RepoPickerItem[] = [{ fullName: 'other/lib', installed: false, monitored: false }]
    const { lastFrame } = render(
      <RepoPickerCard repos={onlyUninstalled} current={null} onPick={() => {}} onCancel={() => {}} />,
    )
    const out = lastFrame() ?? ''
    expect(out).toContain('no repos in this view')
  })
})
