import { describe, expect, test } from 'bun:test'
import { createEnforcer, type AskUser, type PromptChoice, type PromptRequest } from '../src/permissions/enforcer'
import { createPermissionStore } from '../src/permissions/store'
import type { ToolCall } from '../src/runtime/events'

const bashCall: ToolCall = { id: 't1', name: 'bash', input: { command: 'npm publish --access public' } }
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
    expect(seen[0]?.suggestedPattern).toContain('npm publish')
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
    expect(captured?.inputJson).toBe(JSON.stringify({ command: 'npm publish --access public' }))
  })
})

describe('enforce — policy hook', () => {
  test('policy allow → allow and fires notifyPolicy with kind allow', async () => {
    const calls: { kind: string; pattern: string }[] = []
    const decision = await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser: async () => 'deny',
      policy: () => ({ kind: 'allow', rule: { tool: 'bash', pattern: 'npm publish *', decision: 'allow' } }),
      notifyPolicy: async (info) => {
        calls.push({ kind: info.kind, pattern: info.rule.pattern })
      },
    })
    expect(decision.kind).toBe('allow')
    expect(calls).toEqual([{ kind: 'allow', pattern: 'npm publish *' }])
  })

  test('policy deny → deny with reason and fires notifyPolicy with kind deny', async () => {
    const calls: { kind: string; pattern: string }[] = []
    const decision = await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser: async () => 'allow-once',
      policy: () => ({ kind: 'deny', rule: { tool: 'bash', pattern: '*', decision: 'deny' } }),
      notifyPolicy: async (info) => {
        calls.push({ kind: info.kind, pattern: info.rule.pattern })
      },
    })
    expect(decision.kind).toBe('deny')
    if (decision.kind === 'deny') expect(decision.reason).toMatch(/policy deny/i)
    expect(calls).toEqual([{ kind: 'deny', pattern: '*' }])
  })

  test('policy no-match → falls through to existing layers (store / askUser)', async () => {
    let prompted = false
    await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser: async () => {
        prompted = true
        return 'deny'
      },
      policy: () => ({ kind: 'no-match' }),
    })
    expect(prompted).toBe(true)
  })

  test('destructive hard-deny still wins over a policy allow', async () => {
    const decision = await createEnforcer().enforce(
      { id: 't', name: 'bash', input: { command: 'rm -rf /' } },
      {
        mode: 'danger-full-access',
        askUser: async () => 'allow-once',
        policy: () => ({ kind: 'allow', rule: { tool: 'bash', pattern: '*', decision: 'allow' } }),
      },
    )
    expect(decision.kind).toBe('deny')
    if (decision.kind === 'deny') expect(decision.reason).toMatch(/destructive/i)
  })

  test('policy allow short-circuits before consulting the store', async () => {
    const store = createPermissionStore()
    store.remember({ tool: 'bash', pattern: '*', decision: 'deny' })
    const decision = await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser: async () => 'deny',
      policy: () => ({ kind: 'allow', rule: { tool: 'bash', pattern: 'npm publish *', decision: 'allow' } }),
      store,
    })
    expect(decision.kind).toBe('allow')
  })

  test('policy ask → forces askUser even when stored allow rule would match', async () => {
    const store = createPermissionStore()
    store.remember({ tool: 'bash', pattern: 'npm publish *', decision: 'allow' })
    let prompted = false
    const decision = await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser: async () => {
        prompted = true
        return 'allow-once'
      },
      policy: () => ({ kind: 'ask', rule: { tool: 'bash', pattern: 'npm publish *', decision: 'ask' } }),
      store,
    })
    expect(prompted).toBe(true)
    expect(decision.kind).toBe('allow')
  })

  test('policy ask → user "deny" turns into a deny decision', async () => {
    const decision = await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser: async () => 'deny',
      policy: () => ({ kind: 'ask', rule: { tool: 'bash', pattern: 'npm publish *', decision: 'ask' } }),
    })
    expect(decision.kind).toBe('deny')
  })

  test('policy ask fires notifyPolicy with kind ask', async () => {
    const calls: { kind: string; pattern: string }[] = []
    await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser: async () => 'allow-once',
      policy: () => ({ kind: 'ask', rule: { tool: 'bash', pattern: 'npm publish *', decision: 'ask' } }),
      notifyPolicy: async (info) => {
        calls.push({ kind: info.kind, pattern: info.rule.pattern })
      },
    })
    expect(calls).toEqual([{ kind: 'ask', pattern: 'npm publish *' }])
  })

  test('destructive hard-deny still wins over a policy ask', async () => {
    const decision = await createEnforcer().enforce(
      { id: 't', name: 'bash', input: { command: 'rm -rf /' } },
      {
        mode: 'workspace-write',
        askUser: async () => 'allow-once',
        policy: () => ({ kind: 'ask', rule: { tool: 'bash', pattern: '*', decision: 'ask' } }),
      },
    )
    expect(decision.kind).toBe('deny')
  })
})

describe('enforce — bash read-only auto-allow', () => {
  test('common read-only bash commands skip the prompt', async () => {
    const cmds = ['cat README.md', 'ls -la', 'git status', 'git log --oneline -5', 'grep foo bar.txt', 'rg pattern src']
    for (const cmd of cmds) {
      let prompted = false
      const decision = await createEnforcer().enforce(
        { id: 't', name: 'bash', input: { command: cmd } },
        {
          mode: 'workspace-write',
          askUser: async () => {
            prompted = true
            return 'deny'
          },
        },
      )
      expect(decision.kind).toBe('allow')
      expect(prompted).toBe(false)
    }
  })

  test('redirected output drops the read-only auto-allow', async () => {
    let prompted = false
    await createEnforcer().enforce(
      { id: 't', name: 'bash', input: { command: 'cat secrets > /tmp/leak' } },
      {
        mode: 'workspace-write',
        askUser: async () => {
          prompted = true
          return 'deny'
        },
      },
    )
    expect(prompted).toBe(true)
  })

  test('non-read first token still prompts', async () => {
    let prompted = false
    await createEnforcer().enforce(
      { id: 't', name: 'bash', input: { command: 'npm publish' } },
      {
        mode: 'workspace-write',
        askUser: async () => {
          prompted = true
          return 'deny'
        },
      },
    )
    expect(prompted).toBe(true)
  })
})

describe('enforce — destructive hard-deny', () => {
  test('matches a DESTRUCTIVE_PATTERN substring (rm -rf /)', async () => {
    const decision = await createEnforcer().enforce(
      { id: 't', name: 'bash', input: { command: 'rm -rf /' } },
      { mode: 'workspace-write', askUser: async () => 'allow-once' },
    )
    expect(decision.kind).toBe('deny')
    if (decision.kind === 'deny') expect(decision.reason).toMatch(/destructive/i)
  })

  test('matches an ALWAYS_DESTRUCTIVE_COMMANDS first token (shred, wipefs)', async () => {
    for (const cmd of ['shred -n 3 file', 'wipefs -a /dev/sda']) {
      const decision = await createEnforcer().enforce(
        { id: 't', name: 'bash', input: { command: cmd } },
        { mode: 'workspace-write', askUser: async () => 'allow-once' },
      )
      expect(decision.kind).toBe('deny')
    }
  })

  test('notifyDeny is invoked with the reason before the deny is returned', async () => {
    const seen: string[] = []
    const decision = await createEnforcer().enforce(
      { id: 't', name: 'bash', input: { command: 'shred file' } },
      {
        mode: 'workspace-write',
        askUser: async () => 'allow-once',
        notifyDeny: async (info) => {
          seen.push(info.reason)
        },
      },
    )
    expect(decision.kind).toBe('deny')
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatch(/destructive/i)
  })

  test('mode: danger-full-access does NOT bypass destructive deny', async () => {
    const decision = await createEnforcer().enforce(
      { id: 't', name: 'bash', input: { command: 'git push --force' } },
      { mode: 'danger-full-access', askUser: async () => 'allow-once' },
    )
    expect(decision.kind).toBe('deny')
  })

  test('a stored "allow" rule does NOT bypass destructive deny', async () => {
    const store = createPermissionStore()
    store.remember({ tool: 'bash', pattern: '*', decision: 'allow' })
    const decision = await createEnforcer().enforce(
      { id: 't', name: 'bash', input: { command: 'git reset --hard HEAD~5' } },
      { mode: 'workspace-write', askUser: async () => 'allow-once', store },
    )
    expect(decision.kind).toBe('deny')
  })

  test('non-bash tools are unaffected by the destructive blocklist', async () => {
    const decision = await createEnforcer().enforce(
      { id: 't', name: 'write', input: { path: '/tmp/x', content: 'rm -rf /' } },
      { mode: 'workspace-write', askUser: async () => 'allow-once' },
    )
    expect(decision.kind).toBe('allow')
  })
})

describe('enforce — with PermissionStore', () => {
  test('store "allow" verdict short-circuits before askUser', async () => {
    const store = createPermissionStore()
    store.remember({ tool: 'bash', pattern: 'npm publish *', decision: 'allow' })
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
    expect(rules[0]?.pattern).toContain('npm publish')
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

describe('enforce — mode escalation prompt', () => {
  test('workspace-write + tool requires danger-full-access → prompts even with stored allow', async () => {
    const store = createPermissionStore()
    store.remember({ tool: 'bash', pattern: '*', decision: 'allow' })
    let prompted = false
    const decision = await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser: async () => {
        prompted = true
        return 'allow-once'
      },
      store,
      toolRequirements: { bash: 'danger-full-access' },
    })
    expect(prompted).toBe(true)
    expect(decision.kind).toBe('allow')
  })

  test('workspace-write + tool requires danger-full-access → prompts even with policy allow', async () => {
    let prompted = false
    await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser: async () => {
        prompted = true
        return 'allow-once'
      },
      policy: () => ({ kind: 'allow', rule: { tool: 'bash', pattern: 'npm publish *', decision: 'allow' } }),
      toolRequirements: { bash: 'danger-full-access' },
    })
    expect(prompted).toBe(true)
  })

  test('danger-full-access mode + danger-full-access-required → no escalation prompt', async () => {
    const store = createPermissionStore()
    store.remember({ tool: 'bash', pattern: '*', decision: 'allow' })
    let prompted = false
    const decision = await createEnforcer().enforce(bashCall, {
      mode: 'danger-full-access',
      askUser: async () => {
        prompted = true
        return 'deny'
      },
      store,
      toolRequirements: { bash: 'danger-full-access' },
    })
    expect(prompted).toBe(false)
    expect(decision.kind).toBe('allow')
  })

  test('workspace-write + tool requires workspace-write → no escalation (existing behavior preserved)', async () => {
    const store = createPermissionStore()
    store.remember({ tool: 'bash', pattern: '*', decision: 'allow' })
    let prompted = false
    await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser: async () => {
        prompted = true
        return 'deny'
      },
      store,
      toolRequirements: { bash: 'workspace-write' },
    })
    expect(prompted).toBe(false)
  })

  test('no toolRequirements supplied → no escalation, existing behavior', async () => {
    const store = createPermissionStore()
    store.remember({ tool: 'bash', pattern: '*', decision: 'allow' })
    let prompted = false
    await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser: async () => {
        prompted = true
        return 'deny'
      },
      store,
    })
    expect(prompted).toBe(false)
  })

  test('escalation prompt still defers to destructive deny', async () => {
    const decision = await createEnforcer().enforce(
      { id: 't', name: 'bash', input: { command: 'rm -rf /' } },
      {
        mode: 'workspace-write',
        askUser: async () => 'allow-once',
        toolRequirements: { bash: 'danger-full-access' },
      },
    )
    expect(decision.kind).toBe('deny')
  })

  test('escalation prompt still defers to policy deny', async () => {
    const decision = await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser: async () => 'allow-once',
      policy: () => ({ kind: 'deny', rule: { tool: 'bash', pattern: '*', decision: 'deny' } }),
      toolRequirements: { bash: 'danger-full-access' },
    })
    expect(decision.kind).toBe('deny')
  })
})

describe('PromptRequest enrichment', () => {
  test('hook "ask" → reason carried into PromptRequest', async () => {
    let captured: PromptRequest | null = null
    const askUser: AskUser = async (req) => {
      captured = req
      return 'allow-once'
    }
    await createEnforcer().enforce(bashCall, {
      mode: 'danger-full-access',
      askUser,
      hookOverride: { decision: 'ask', reason: 'lint hook wants confirmation' },
    })
    expect(captured?.reason).toBe('lint hook wants confirmation')
    expect(captured?.currentMode).toBe('danger-full-access')
  })

  test('policy.ask match → PromptRequest.reason cites the rule pattern', async () => {
    let captured: PromptRequest | null = null
    const askUser: AskUser = async (req) => {
      captured = req
      return 'allow-once'
    }
    await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser,
      policy: () => ({ kind: 'ask', rule: { tool: 'bash', pattern: 'npm publish *', decision: 'ask' } }),
    })
    expect(captured?.reason).toContain('npm publish *')
  })

  test('mode escalation → PromptRequest.reason cites both modes + sets requiredMode', async () => {
    let captured: PromptRequest | null = null
    const askUser: AskUser = async (req) => {
      captured = req
      return 'allow-once'
    }
    await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser,
      policy: () => ({ kind: 'allow', rule: { tool: 'bash', pattern: '*', decision: 'allow' } }),
      toolRequirements: { bash: 'danger-full-access' },
    })
    expect(captured?.requiredMode).toBe('danger-full-access')
    expect(captured?.currentMode).toBe('workspace-write')
    expect(captured?.reason).toContain('workspace-write')
    expect(captured?.reason).toContain('danger-full-access')
  })

  test('plain prompt (no hook, no policy, no escalation) → reason undefined, currentMode set', async () => {
    let captured: PromptRequest | null = null
    const askUser: AskUser = async (req) => {
      captured = req
      return 'allow-once'
    }
    await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser,
    })
    expect(captured?.reason).toBeUndefined()
    expect(captured?.currentMode).toBe('workspace-write')
    expect(captured?.requiredMode).toBeUndefined()
  })
})

describe('enforce — hook context override', () => {
  test('hookOverride.decision="deny" → deny short-circuits with hook reason', async () => {
    const askUser: AskUser = async () => 'allow-once'
    const decision = await createEnforcer().enforce(bashCall, {
      mode: 'danger-full-access',
      askUser,
      hookOverride: { decision: 'deny', reason: 'blocked by lint hook' },
    })
    expect(decision.kind).toBe('deny')
    if (decision.kind === 'deny') expect(decision.reason).toContain('blocked by lint hook')
  })

  test('hookOverride.decision="ask" → forces prompt even when mode would auto-allow', async () => {
    let prompted = false
    const askUser: AskUser = async () => {
      prompted = true
      return 'allow-once'
    }
    const decision = await createEnforcer().enforce(bashCall, {
      mode: 'danger-full-access',
      askUser,
      hookOverride: { decision: 'ask', reason: 'requires confirmation' },
    })
    expect(prompted).toBe(true)
    expect(decision.kind).toBe('allow')
  })

  test('hookOverride.decision="allow" + matching policy.ask rule → still prompts (ask wins)', async () => {
    let prompted = false
    const askUser: AskUser = async () => {
      prompted = true
      return 'allow-once'
    }
    const decision = await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser,
      hookOverride: { decision: 'allow', reason: 'hook approved' },
      policy: () => ({ kind: 'ask', rule: { tool: 'bash', pattern: 'npm publish *', decision: 'ask' } }),
    })
    expect(prompted).toBe(true)
    expect(decision.kind).toBe('allow')
  })

  test('hookOverride.decision="allow" + no ask rule → allow without prompt (skips store)', async () => {
    let prompted = false
    const askUser: AskUser = async () => {
      prompted = true
      return 'deny'
    }
    const store = createPermissionStore()
    store.remember({ tool: 'bash', pattern: 'npm publish *', decision: 'deny' })
    const decision = await createEnforcer().enforce(bashCall, {
      mode: 'workspace-write',
      askUser,
      hookOverride: { decision: 'allow', reason: 'hook approved' },
      store,
    })
    expect(prompted).toBe(false)
    expect(decision.kind).toBe('allow')
  })

  test('destructive deny still wins over hookOverride="allow"', async () => {
    const destructiveCall: ToolCall = { id: 't', name: 'bash', input: { command: 'rm -rf /' } }
    const decision = await createEnforcer().enforce(destructiveCall, {
      mode: 'danger-full-access',
      askUser: async () => 'allow-once',
      hookOverride: { decision: 'allow', reason: 'hook approved' },
    })
    expect(decision.kind).toBe('deny')
  })
})

void ((): PromptChoice => 'allow-once')
