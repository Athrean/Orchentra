import { describe, expect, test } from 'bun:test'
import {
  decide,
  isPermissionMode,
  permissionModeRank,
  parseRule,
  extractPermissionSubject,
  PermissionPolicy,
} from '../src/runtime/permissions'
import type { PermissionPromptDecision, PermissionPrompter, PermissionRequest } from '../src/runtime/permissions'

class RecordingPrompter implements PermissionPrompter {
  seen: PermissionRequest[] = []
  allow: boolean

  constructor(allow: boolean) {
    this.allow = allow
  }

  decide(request: PermissionRequest): PermissionPromptDecision {
    this.seen.push(request)
    return this.allow ? { kind: 'allow' } : { kind: 'deny', reason: 'not now' }
  }
}

describe('decide (backward compat)', () => {
  test('danger-full-access allows everything without confirmation', () => {
    for (const level of ['read', 'write', 'admin'] as const) {
      const d = decide('danger-full-access', level)
      expect(d.allowed).toBe(true)
      expect(d.requiresConfirmation).toBe(false)
    }
  })

  test('read-only allows read, blocks write and admin', () => {
    expect(decide('read-only', 'read').allowed).toBe(true)
    expect(decide('read-only', 'write').allowed).toBe(false)
    expect(decide('read-only', 'admin').allowed).toBe(false)
  })

  test('workspace-write allows read, confirms write, blocks admin', () => {
    expect(decide('workspace-write', 'read')).toEqual({
      allowed: true,
      requiresConfirmation: false,
    })
    expect(decide('workspace-write', 'write')).toEqual({
      allowed: true,
      requiresConfirmation: true,
    })
    expect(decide('workspace-write', 'admin').allowed).toBe(false)
  })
})

describe('isPermissionMode', () => {
  test('accepts valid modes', () => {
    expect(isPermissionMode('read-only')).toBe(true)
    expect(isPermissionMode('danger-full-access')).toBe(true)
    expect(isPermissionMode('workspace-write')).toBe(true)
    expect(isPermissionMode('prompt')).toBe(true)
    expect(isPermissionMode('allow')).toBe(true)
  })

  test('rejects invalid strings', () => {
    expect(isPermissionMode('admin')).toBe(false)
    expect(isPermissionMode('prompt-on-write')).toBe(false)
    expect(isPermissionMode('')).toBe(false)
  })
})

describe('permissionModeRank', () => {
  test('ordinal ordering', () => {
    expect(permissionModeRank('read-only')).toBeLessThan(permissionModeRank('workspace-write'))
    expect(permissionModeRank('workspace-write')).toBeLessThan(permissionModeRank('danger-full-access'))
    expect(permissionModeRank('danger-full-access')).toBeLessThan(permissionModeRank('prompt'))
    expect(permissionModeRank('prompt')).toBeLessThan(permissionModeRank('allow'))
  })
})

describe('parseRule', () => {
  test('bare tool name matches any input', () => {
    const rule = parseRule('bash')
    expect(rule.toolName).toBe('bash')
    expect(rule.matcher.kind).toBe('any')
  })

  test('tool with wildcard matches any', () => {
    const rule = parseRule('bash(*)')
    expect(rule.toolName).toBe('bash')
    expect(rule.matcher.kind).toBe('any')
  })

  test('tool with exact subject', () => {
    const rule = parseRule('bash(git status)')
    expect(rule.toolName).toBe('bash')
    expect(rule.matcher).toEqual({ kind: 'exact', value: 'git status' })
  })

  test('tool with prefix wildcard', () => {
    const rule = parseRule('bash(git:*)')
    expect(rule.toolName).toBe('bash')
    expect(rule.matcher).toEqual({ kind: 'prefix', prefix: 'git' })
  })

  test('escaped parentheses', () => {
    const rule = parseRule('bash(cmd\\(arg\\))')
    expect(rule.matcher).toEqual({ kind: 'exact', value: 'cmd(arg)' })
  })
})

describe('extractPermissionSubject', () => {
  test('extracts command from JSON', () => {
    expect(extractPermissionSubject('{"command":"git status"}')).toBe('git status')
  })

  test('extracts path from JSON', () => {
    expect(extractPermissionSubject('{"path":"/tmp/file.txt"}')).toBe('/tmp/file.txt')
  })

  test('returns raw input for non-JSON', () => {
    expect(extractPermissionSubject('plain text')).toBe('plain text')
  })

  test('returns null for empty input', () => {
    expect(extractPermissionSubject('')).toBeNull()
    expect(extractPermissionSubject('  ')).toBeNull()
  })
})

describe('PermissionPolicy', () => {
  test('allows tools when active mode meets requirement', () => {
    const policy = new PermissionPolicy('workspace-write')
      .withToolRequirement('read_file', 'read-only')
      .withToolRequirement('write_file', 'workspace-write')

    expect(policy.authorize('read_file', '{}')).toEqual({ kind: 'allow' })
    expect(policy.authorize('write_file', '{}')).toEqual({ kind: 'allow' })
  })

  test('denies read-only escalations without prompt', () => {
    const policy = new PermissionPolicy('read-only')
      .withToolRequirement('write_file', 'workspace-write')
      .withToolRequirement('bash', 'danger-full-access')

    const writeOutcome = policy.authorize('write_file', '{}')
    expect(writeOutcome.kind).toBe('deny')
    if (writeOutcome.kind === 'deny') expect(writeOutcome.reason).toContain('requires workspace-write permission')

    const bashOutcome = policy.authorize('bash', '{}')
    expect(bashOutcome.kind).toBe('deny')
    if (bashOutcome.kind === 'deny') expect(bashOutcome.reason).toContain('requires danger-full-access permission')
  })

  test('prompts for workspace-write to danger-full-access escalation', () => {
    const policy = new PermissionPolicy('workspace-write').withToolRequirement('bash', 'danger-full-access')
    const prompter = new RecordingPrompter(true)

    const outcome = policy.authorize('bash', 'echo hi', prompter)

    expect(outcome).toEqual({ kind: 'allow' })
    expect(prompter.seen.length).toBe(1)
    expect(prompter.seen[0].toolName).toBe('bash')
    expect(prompter.seen[0].currentMode).toBe('workspace-write')
    expect(prompter.seen[0].requiredMode).toBe('danger-full-access')
  })

  test('honors prompt rejection reason', () => {
    const policy = new PermissionPolicy('workspace-write').withToolRequirement('bash', 'danger-full-access')
    const prompter = new RecordingPrompter(false)

    const outcome = policy.authorize('bash', 'echo hi', prompter)
    expect(outcome).toEqual({ kind: 'deny', reason: 'not now' })
  })

  test('applies rule-based denials and allows', () => {
    const policy = new PermissionPolicy('read-only')
      .withToolRequirement('bash', 'danger-full-access')
      .withPermissionRules({
        allow: ['bash(git:*)'],
        deny: ['bash(rm -rf:*)'],
        ask: [],
      })

    expect(policy.authorize('bash', '{"command":"git status"}')).toEqual({ kind: 'allow' })

    const denied = policy.authorize('bash', '{"command":"rm -rf /tmp/x"}')
    expect(denied.kind).toBe('deny')
    if (denied.kind === 'deny') expect(denied.reason).toContain('denied by rule')
  })

  test('ask rules force prompt even when mode allows', () => {
    const policy = new PermissionPolicy('danger-full-access')
      .withToolRequirement('bash', 'danger-full-access')
      .withPermissionRules({ allow: [], deny: [], ask: ['bash(git:*)'] })
    const prompter = new RecordingPrompter(true)

    const outcome = policy.authorize('bash', '{"command":"git status"}', prompter)

    expect(outcome).toEqual({ kind: 'allow' })
    expect(prompter.seen.length).toBe(1)
    expect(prompter.seen[0].reason).toContain('ask rule')
  })

  test('hook deny short-circuits permission flow', () => {
    const policy = new PermissionPolicy('danger-full-access').withToolRequirement('bash', 'danger-full-access')

    const outcome = policy.authorizeWithContext('bash', '{}', {
      overrideDecision: 'deny',
      overrideReason: 'blocked by hook',
    })

    expect(outcome).toEqual({ kind: 'deny', reason: 'blocked by hook' })
  })

  test('hook ask forces prompt', () => {
    const policy = new PermissionPolicy('danger-full-access').withToolRequirement('bash', 'danger-full-access')
    const prompter = new RecordingPrompter(true)

    const outcome = policy.authorizeWithContext(
      'bash',
      '{}',
      {
        overrideDecision: 'ask',
        overrideReason: 'hook requested confirmation',
      },
      prompter,
    )

    expect(outcome).toEqual({ kind: 'allow' })
    expect(prompter.seen.length).toBe(1)
    expect(prompter.seen[0].reason).toBe('hook requested confirmation')
  })

  test('hook allow still respects ask rules', () => {
    const policy = new PermissionPolicy('read-only')
      .withToolRequirement('bash', 'danger-full-access')
      .withPermissionRules({ allow: [], deny: [], ask: ['bash(git:*)'] })
    const prompter = new RecordingPrompter(true)

    const outcome = policy.authorizeWithContext(
      'bash',
      '{"command":"git status"}',
      { overrideDecision: 'allow', overrideReason: 'hook approved' },
      prompter,
    )

    expect(outcome).toEqual({ kind: 'allow' })
    expect(prompter.seen.length).toBe(1)
  })
})
