import { describe, expect, test } from 'bun:test'
import { createEnforcer, type AskUser, type PromptChoice, type PromptRequest } from '../src/permissions/enforcer'
import type { ToolCall } from '../src/runtime/events'

const bashCall: ToolCall = { id: 't1', name: 'bash', input: { command: 'gh issue list --state open' } }
const readCall: ToolCall = { id: 't2', name: 'read', input: { path: '/tmp/x' } }

const ctx = (askUser: AskUser): { mode: 'workspace-write'; askUser: AskUser } => ({ mode: 'workspace-write', askUser })

describe('enforce', () => {
  test('auto-allows read-class tools without consulting askUser', async () => {
    let called = false
    const askUser: AskUser = async () => {
      called = true
      return 'deny'
    }
    const decision = await createEnforcer().enforce(readCall, ctx(askUser))
    expect(decision.kind).toBe('allow')
    expect(called).toBe(false)
  })

  test('prompts for non-read tools and allows on "allow-once"', async () => {
    const seen: PromptRequest[] = []
    const askUser: AskUser = async (req) => {
      seen.push(req)
      return 'allow-once'
    }
    const decision = await createEnforcer().enforce(bashCall, ctx(askUser))
    expect(decision.kind).toBe('allow')
    expect(seen).toHaveLength(1)
    expect(seen[0]?.toolName).toBe('bash')
    expect(seen[0]?.suggestedPattern).toContain('gh issue')
  })

  test('"allow-pattern" also allows in A2 (no store yet — slice A3 will persist)', async () => {
    const askUser: AskUser = async () => 'allow-pattern'
    const decision = await createEnforcer().enforce(bashCall, ctx(askUser))
    expect(decision.kind).toBe('allow')
  })

  test('"deny" returns a denied decision the agent can react to', async () => {
    const askUser: AskUser = async () => 'deny'
    const decision = await createEnforcer().enforce(bashCall, ctx(askUser))
    expect(decision.kind).toBe('deny')
    if (decision.kind === 'deny') expect(decision.reason).toMatch(/denied/i)
  })

  test('"cancel" returns a denied decision with a distinct cancel reason', async () => {
    const askUser: AskUser = async () => 'cancel'
    const decision = await createEnforcer().enforce(bashCall, ctx(askUser))
    expect(decision.kind).toBe('deny')
    if (decision.kind === 'deny') expect(decision.reason).toMatch(/cancel/i)
  })

  test('passes JSON-stringified input through to the prompt request', async () => {
    let captured: PromptRequest | null = null
    const askUser: AskUser = async (req) => {
      captured = req
      return 'allow-once'
    }
    await createEnforcer().enforce(bashCall, ctx(askUser))
    expect(captured?.inputJson).toBe(JSON.stringify({ command: 'gh issue list --state open' }))
  })
})

void ((): PromptChoice => 'allow-once')
