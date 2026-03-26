import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  investigatingBlocks,
  investigatingFallback,
  briefReadyBlocks,
  briefReadyFallback,
  fixingBlocks,
  fixingFallback,
  resolvedBlocks,
  resolvedFallback,
} from '../src/slack/blocks'
import type { SlackBlock } from '../src/slack/blocks'

const incident = {
  id: 'inc-001',
  repo: 'my-org/api',
  branch: 'main',
  commit: 'abc1234def5678',
  workflowName: 'CI Tests',
  workflowRunId: 12345,
}

const brief = {
  failureType: 'env_missing' as const,
  summary: 'DATABASE_URL not set in CI',
  rootCause: 'Missing DATABASE_URL environment variable',
  suggestedFix: 'Add DATABASE_URL to CI environment secrets',
  confidence: 0.92,
  similarIncidentId: null,
}

let originalEnv: string | undefined

beforeEach(() => {
  originalEnv = process.env.FRONTEND_URL
  process.env.FRONTEND_URL = 'https://app.orchentra.dev'
})

afterEach(() => {
  if (originalEnv !== undefined) {
    process.env.FRONTEND_URL = originalEnv
  } else {
    delete process.env.FRONTEND_URL
  }
})

// ─── Helpers ──────────────────────────────────

function findBlock<T extends SlackBlock>(blocks: SlackBlock[], type: T['type']): T | undefined {
  return blocks.find((b) => b.type === type) as T | undefined
}

function findAllBlocks<T extends SlackBlock>(blocks: SlackBlock[], type: T['type']): T[] {
  return blocks.filter((b) => b.type === type) as T[]
}

function allText(blocks: SlackBlock[]): string {
  return JSON.stringify(blocks)
}

// ─── Investigating ────────────────────────────

describe('investigatingBlocks', () => {
  test('includes header with repo name', () => {
    const blocks = investigatingBlocks(incident)
    const header = findBlock(blocks, 'header')
    expect(header?.text.text).toContain('my-org/api')
  })

  test('shows investigating status in fields', () => {
    const blocks = investigatingBlocks(incident)
    const text = allText(blocks)
    expect(text).toContain('Investigating')
  })

  test('includes workflow name, branch, and short commit', () => {
    const blocks = investigatingBlocks(incident)
    const text = allText(blocks)
    expect(text).toContain('CI Tests')
    expect(text).toContain('main')
    expect(text).toContain('abc1234')
    expect(text).not.toContain('abc1234def5678')
  })

  test('includes dashboard deep link', () => {
    const blocks = investigatingBlocks(incident)
    const text = allText(blocks)
    expect(text).toContain('https://app.orchentra.dev/dashboard/my-org%2Fapi?incident=inc-001')
    expect(text).toContain('View in Dashboard')
  })

  test('uses default localhost URL when FRONTEND_URL unset', () => {
    delete process.env.FRONTEND_URL
    const blocks = investigatingBlocks(incident)
    const text = allText(blocks)
    expect(text).toContain('http://localhost:3000/dashboard/')
  })

  test('produces expected block types in order', () => {
    const blocks = investigatingBlocks(incident)
    const types = blocks.map((b) => b.type)
    expect(types).toEqual(['header', 'section', 'divider', 'context'])
  })

  test('section has exactly 4 fields', () => {
    const blocks = investigatingBlocks(incident)
    const section = findBlock<Extract<SlackBlock, { type: 'section' }>>(blocks, 'section')
    expect(section?.fields).toHaveLength(4)
  })

  test('fallback text contains repo and workflow', () => {
    const fallback = investigatingFallback(incident)
    expect(fallback).toContain('my-org/api')
    expect(fallback).toContain('CI Tests')
    expect(fallback).toContain('Investigating')
  })

  test('fallback includes branch name', () => {
    const fallback = investigatingFallback(incident)
    expect(fallback).toContain('main')
  })
})

// ─── Brief Ready ──────────────────────────────

describe('briefReadyBlocks', () => {
  test('includes header with repo name', () => {
    const blocks = briefReadyBlocks(incident, brief)
    const header = findBlock(blocks, 'header')
    expect(header?.text.text).toContain('my-org/api')
  })

  test('shows root cause and suggested fix', () => {
    const blocks = briefReadyBlocks(incident, brief)
    const text = allText(blocks)
    expect(text).toContain('Missing DATABASE_URL environment variable')
    expect(text).toContain('Add DATABASE_URL to CI environment secrets')
  })

  test('includes summary in quote block', () => {
    const blocks = briefReadyBlocks(incident, brief)
    const text = allText(blocks)
    expect(text).toContain('DATABASE_URL not set in CI')
  })

  test('shows confidence badge green for high confidence', () => {
    const blocks = briefReadyBlocks(incident, brief)
    const text = allText(blocks)
    expect(text).toContain('🟢 92%')
  })

  test('shows confidence badge yellow for medium confidence', () => {
    const medBrief = { ...brief, confidence: 0.65 }
    const blocks = briefReadyBlocks(incident, medBrief)
    const text = allText(blocks)
    expect(text).toContain('🟡 65%')
  })

  test('shows confidence badge red for low confidence', () => {
    const lowBrief = { ...brief, confidence: 0.3 }
    const blocks = briefReadyBlocks(incident, lowBrief)
    const text = allText(blocks)
    expect(text).toContain('🔴 30%')
  })

  test('green badge at exactly 80% boundary', () => {
    const blocks = briefReadyBlocks(incident, { ...brief, confidence: 0.8 })
    expect(allText(blocks)).toContain('🟢 80%')
  })

  test('yellow badge at exactly 50% boundary', () => {
    const blocks = briefReadyBlocks(incident, { ...brief, confidence: 0.5 })
    expect(allText(blocks)).toContain('🟡 50%')
  })

  test('red badge just below 50% boundary', () => {
    const blocks = briefReadyBlocks(incident, { ...brief, confidence: 0.49 })
    expect(allText(blocks)).toContain('🔴 49%')
  })

  test('handles 100% confidence', () => {
    const blocks = briefReadyBlocks(incident, { ...brief, confidence: 1.0 })
    expect(allText(blocks)).toContain('🟢 100%')
  })

  test('handles 0% confidence', () => {
    const blocks = briefReadyBlocks(incident, { ...brief, confidence: 0.0 })
    expect(allText(blocks)).toContain('🔴 0%')
  })

  test('includes failure type label', () => {
    const blocks = briefReadyBlocks(incident, brief)
    const text = allText(blocks)
    expect(text).toContain('env missing')
  })

  test('replaces underscores in all failure types', () => {
    const types = ['flaky_test', 'dependency_conflict', 'infra_timeout', 'code_bug'] as const
    const expected = ['flaky test', 'dependency conflict', 'infra timeout', 'code bug']
    types.forEach((ft, i) => {
      const blocks = briefReadyBlocks(incident, { ...brief, failureType: ft })
      expect(allText(blocks)).toContain(expected[i])
    })
  })

  test('includes action buttons', () => {
    const blocks = briefReadyBlocks(incident, brief)
    const actions = findBlock(blocks, 'actions')
    expect(actions).toBeTruthy()

    const elements = (actions as { type: 'actions'; elements: { action_id: string }[] }).elements
    const actionIds = elements.map((e) => e.action_id)
    expect(actionIds).toContain('rerun_workflow')
    expect(actionIds).toContain('create_issue')
    expect(actionIds).toContain('dismiss_incident')
    expect(actionIds).toContain('snooze_incident')
    expect(actionIds).toContain('escalate_incident')
  })

  test('has exactly 5 action elements', () => {
    const blocks = briefReadyBlocks(incident, brief)
    const actions = findBlock(blocks, 'actions')
    const elements = (actions as { type: 'actions'; elements: unknown[] }).elements
    expect(elements).toHaveLength(5)
  })

  test('escalate button has danger style', () => {
    const blocks = briefReadyBlocks(incident, brief)
    const actions = findBlock(blocks, 'actions')
    const elements = (actions as { type: 'actions'; elements: { action_id: string; style?: string }[] }).elements
    const escalate = elements.find((e) => e.action_id === 'escalate_incident')
    expect(escalate?.style).toBe('danger')
  })

  test('snooze overflow has 1h, 4h, 24h options', () => {
    const blocks = briefReadyBlocks(incident, brief)
    const actions = findBlock(blocks, 'actions')
    const elements = (
      actions as {
        type: 'actions'
        elements: { action_id: string; options?: { value: string }[] }[]
      }
    ).elements
    const snooze = elements.find((e) => e.action_id === 'snooze_incident')
    expect(snooze?.options).toHaveLength(3)
    const values = snooze!.options!.map((o) => o.value)
    expect(values).toContain('inc-001:1')
    expect(values).toContain('inc-001:4')
    expect(values).toContain('inc-001:24')
  })

  test('action buttons carry incident ID as value', () => {
    const blocks = briefReadyBlocks(incident, brief)
    const actions = findBlock(blocks, 'actions')
    const elements = (actions as { type: 'actions'; elements: { value?: string }[] }).elements
    const rerun = elements.find((e) => (e as { action_id?: string }).action_id === 'rerun_workflow') as {
      value?: string
    }
    expect(rerun?.value).toBe('inc-001')
  })

  test('includes dashboard deep link', () => {
    const blocks = briefReadyBlocks(incident, brief)
    const text = allText(blocks)
    expect(text).toContain('View in Dashboard')
    expect(text).toContain('incident=inc-001')
  })

  test('fallback text includes root cause and confidence', () => {
    const fallback = briefReadyFallback(incident, brief)
    expect(fallback).toContain('Missing DATABASE_URL')
    expect(fallback).toContain('92%')
  })

  test('fallback text includes workflow name and suggested fix', () => {
    const fallback = briefReadyFallback(incident, brief)
    expect(fallback).toContain('CI Tests')
    expect(fallback).toContain('Add DATABASE_URL to CI environment secrets')
  })
})

// ─── Fixing ───────────────────────────────────

describe('fixingBlocks', () => {
  test('includes header with fixing status', () => {
    const blocks = fixingBlocks(incident, brief, { action: 'Workflow re-run started' })
    const header = findBlock(blocks, 'header')
    expect(header?.text.text).toContain('Fixing')
  })

  test('shows action description', () => {
    const blocks = fixingBlocks(incident, brief, { action: 'PR #42 created' })
    const text = allText(blocks)
    expect(text).toContain('PR #42 created')
  })

  test('shows actual actor name when provided', () => {
    const blocks = fixingBlocks(incident, brief, { action: 'Workflow re-run started', actor: 'user-1' })
    const text = allText(blocks)
    expect(text).toContain('by user-1')
  })

  test('omits actor line when actor is null', () => {
    const blocks = fixingBlocks(incident, brief, { action: 'Workflow re-run started', actor: null })
    const text = allText(blocks)
    expect(text).not.toContain('by ')
  })

  test('omits actor line when actor is undefined', () => {
    const blocks = fixingBlocks(incident, brief, { action: 'Workflow re-run started' })
    const text = allText(blocks)
    expect(text).not.toContain('by ')
  })

  test('no action buttons (removed after action taken)', () => {
    const blocks = fixingBlocks(incident, brief, { action: 'Workflow re-run started' })
    const actions = findBlock(blocks, 'actions')
    expect(actions).toBeUndefined()
  })

  test('includes root cause and confidence from brief', () => {
    const blocks = fixingBlocks(incident, brief, { action: 'test' })
    const text = allText(blocks)
    expect(text).toContain(brief.rootCause)
    expect(text).toContain('🟢 92%')
  })

  test('includes dashboard link', () => {
    const blocks = fixingBlocks(incident, brief, { action: 'test' })
    const text = allText(blocks)
    expect(text).toContain('View in Dashboard')
  })

  test('produces expected block types in order', () => {
    const blocks = fixingBlocks(incident, brief, { action: 'test' })
    const types = blocks.map((b) => b.type)
    expect(types).toEqual(['header', 'section', 'divider', 'section', 'context'])
  })

  test('fallback text includes repo and action', () => {
    const fallback = fixingFallback(incident, { action: 'PR #42 created' })
    expect(fallback).toContain('PR #42 created')
    expect(fallback).toContain('my-org/api')
  })
})

// ─── Resolved ─────────────────────────────────

describe('resolvedBlocks', () => {
  test('includes header with resolved status', () => {
    const blocks = resolvedBlocks(incident, { method: 'Re-run succeeded' })
    const header = findBlock(blocks, 'header')
    expect(header?.text.text).toContain('Resolved')
  })

  test('shows resolution method', () => {
    const blocks = resolvedBlocks(incident, { method: 'PR merged' })
    const text = allText(blocks)
    expect(text).toContain('PR merged')
  })

  test('formats MTTR in seconds', () => {
    const blocks = resolvedBlocks(incident, { method: 'test', mttrSeconds: 45 })
    const text = allText(blocks)
    expect(text).toContain('45s')
  })

  test('formats MTTR at exactly 60s as 1m', () => {
    const blocks = resolvedBlocks(incident, { method: 'test', mttrSeconds: 60 })
    expect(allText(blocks)).toContain('1m')
  })

  test('formats MTTR in minutes', () => {
    const blocks = resolvedBlocks(incident, { method: 'test', mttrSeconds: 300 })
    const text = allText(blocks)
    expect(text).toContain('5m')
  })

  test('formats MTTR at exactly 3600s as 1h', () => {
    const blocks = resolvedBlocks(incident, { method: 'test', mttrSeconds: 3600 })
    expect(allText(blocks)).toContain('1h')
  })

  test('formats MTTR in hours and minutes', () => {
    const blocks = resolvedBlocks(incident, { method: 'test', mttrSeconds: 5400 })
    const text = allText(blocks)
    expect(text).toContain('1h 30m')
  })

  test('formats MTTR of 0 seconds as 0s', () => {
    const blocks = resolvedBlocks(incident, { method: 'test', mttrSeconds: 0 })
    expect(allText(blocks)).toContain('0s')
  })

  test('shows N/A when no MTTR', () => {
    const blocks = resolvedBlocks(incident, { method: 'test', mttrSeconds: null })
    const text = allText(blocks)
    expect(text).toContain('N/A')
  })

  test('shows N/A when MTTR is undefined', () => {
    const blocks = resolvedBlocks(incident, { method: 'test' })
    expect(allText(blocks)).toContain('N/A')
  })

  test('produces expected block types in order', () => {
    const blocks = resolvedBlocks(incident, { method: 'test' })
    const types = blocks.map((b) => b.type)
    expect(types).toEqual(['header', 'section', 'context'])
  })

  test('no action buttons in resolved state', () => {
    const blocks = resolvedBlocks(incident, { method: 'test' })
    const actions = findBlock(blocks, 'actions')
    expect(actions).toBeUndefined()
  })

  test('no divider in resolved state', () => {
    const blocks = resolvedBlocks(incident, { method: 'test' })
    const dividers = findAllBlocks(blocks, 'divider')
    expect(dividers).toHaveLength(0)
  })

  test('includes dashboard link', () => {
    const blocks = resolvedBlocks(incident, { method: 'test' })
    const text = allText(blocks)
    expect(text).toContain('View in Dashboard')
  })

  test('fallback text includes method and MTTR', () => {
    const fallback = resolvedFallback(incident, { method: 'Re-run succeeded', mttrSeconds: 120 })
    expect(fallback).toContain('Re-run succeeded')
    expect(fallback).toContain('2m')
  })

  test('fallback text includes MTTR of 0 seconds', () => {
    const fallback = resolvedFallback(incident, { method: 'test', mttrSeconds: 0 })
    expect(fallback).toContain('MTTR: 0s')
  })

  test('fallback text omits MTTR when not provided', () => {
    const fallback = resolvedFallback(incident, { method: 'Manually resolved' })
    expect(fallback).toContain('Manually resolved')
    expect(fallback).not.toContain('MTTR')
  })

  test('fallback text includes repo name', () => {
    const fallback = resolvedFallback(incident, { method: 'Re-run succeeded' })
    expect(fallback).toContain('my-org/api')
  })
})

// ─── Message State Transitions ────────────────

describe('block state transitions', () => {
  test('investigating → brief_ready adds action buttons and removes investigating status', () => {
    const investigatingBl = investigatingBlocks(incident)
    const briefBl = briefReadyBlocks(incident, brief)

    expect(findBlock(investigatingBl, 'actions')).toBeUndefined()
    expect(findBlock(briefBl, 'actions')).toBeTruthy()
  })

  test('brief_ready → fixing removes action buttons', () => {
    const briefBl = briefReadyBlocks(incident, brief)
    const fixBl = fixingBlocks(incident, brief, { action: 'Re-run started' })

    expect(findBlock(briefBl, 'actions')).toBeTruthy()
    expect(findBlock(fixBl, 'actions')).toBeUndefined()
  })

  test('fixing → resolved removes divider and simplifies layout', () => {
    const fixBl = fixingBlocks(incident, brief, { action: 'Re-run started' })
    const resBl = resolvedBlocks(incident, { method: 'Re-run succeeded', mttrSeconds: 60 })

    expect(findAllBlocks(fixBl, 'divider').length).toBeGreaterThan(0)
    expect(findAllBlocks(resBl, 'divider')).toHaveLength(0)
  })

  test('header emoji transitions through lifecycle', () => {
    const headers = [
      investigatingBlocks(incident),
      briefReadyBlocks(incident, brief),
      fixingBlocks(incident, brief, { action: 'test' }),
      resolvedBlocks(incident, { method: 'test' }),
    ].map((blocks) => {
      const header = findBlock<Extract<SlackBlock, { type: 'header' }>>(blocks, 'header')
      return header!.text.text
    })

    expect(headers[0]).toContain('🔍')
    expect(headers[1]).toContain('⚠️')
    expect(headers[2]).toContain('🔧')
    expect(headers[3]).toContain('✅')
  })

  test('dashboard link persists across all states', () => {
    const allStates = [
      investigatingBlocks(incident),
      briefReadyBlocks(incident, brief),
      fixingBlocks(incident, brief, { action: 'test' }),
      resolvedBlocks(incident, { method: 'test' }),
    ]

    for (const blocks of allStates) {
      expect(allText(blocks)).toContain('View in Dashboard')
      expect(allText(blocks)).toContain('incident=inc-001')
    }
  })
})
