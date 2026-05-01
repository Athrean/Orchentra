import { describe, expect, test } from 'bun:test'
import { createEnforcer, type AskUser, type PromptChoice, type PromptRequest } from '../src/permissions/enforcer'
import { createPermissionStore } from '../src/permissions/store'
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

describe('enforce — with PermissionStore', () => {
  test('store "allow" verdict short-circuits before askUser', async () => {
    const store = createPermissionStore()
    store.remember({ tool: 'bash', pattern: 'gh issue *', decision: 'allow' })
    let prompted = false
    const askUser: AskUser = async () => {
      prompted = true
      return 'deny'
    }
    const decision = await createEnforcer().enforce(bashCall, { mode: 'workspace-write', askUser, store })
    expect(decision.kind).toBe('allow')
    expect(prompted).toBe(false)
  })

  test('store "deny" verdict short-circuits with a reason', async () => {
    const store = createPermissionStore()
    store.remember({ tool: 'bash', pattern: '*', decision: 'deny' })
    const decision = await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser: async () => 'allow-once',
      store,
    })
    expect(decision.kind).toBe('deny')
    if (decision.kind === 'deny') expect(decision.reason).toMatch(/store/i)
  })

  test('"allow-pattern" choice writes the suggested pattern to the store', async () => {
    const store = createPermissionStore()
    await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser: async () => 'allow-pattern',
      store,
    })
    const rules = store.list()
    expect(rules).toHaveLength(1)
    expect(rules[0]?.tool).toBe('bash')
    expect(rules[0]?.pattern).toContain('gh issue')
    expect(rules[0]?.decision).toBe('allow')
  })

  test('"allow-once" choice does NOT write to the store', async () => {
    const store = createPermissionStore()
    await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser: async () => 'allow-once',
      store,
    })
    expect(store.list()).toHaveLength(0)
  })
})

void ((): PromptChoice => 'allow-once')
