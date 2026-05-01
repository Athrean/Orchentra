import { describe, expect, test } from 'bun:test'
import { HookAbortSignal, HookRunner, type HookProgressEvent, type HookProgressReporter } from '../src/runtime/hooks'

class RecordingReporter implements HookProgressReporter {
  events: HookProgressEvent[] = []
  onEvent(event: HookProgressEvent): void {
    this.events.push(event)
  }
}

describe('HookRunner', () => {
  test('returns allow when no commands configured', async () => {
    const runner = new HookRunner()
    const result = await runner.runPreToolUse('bash', '{"command":"ls"}')
    expect(result.denied).toBe(false)
    expect(result.failed).toBe(false)
    expect(result.cancelled).toBe(false)
  })

  test('returns allow when command exits 0', async () => {
    const runner = new HookRunner({ preToolUse: ['echo ok'] })
    const result = await runner.runPreToolUse('bash', '{"command":"ls"}')
    expect(result.denied).toBe(false)
    expect(result.failed).toBe(false)
  })

  test('returns denied when command exits 2', async () => {
    const runner = new HookRunner({ preToolUse: ['exit 2'] })
    const result = await runner.runPreToolUse('bash', '{"command":"rm -rf /"}')
    expect(result.denied).toBe(true)
    expect(result.messages.length).toBeGreaterThan(0)
  })

  test('returns denied when JSON output contains decision=block', async () => {
    const script = `echo '{"decision":"block","reason":"dangerous"}'`
    const runner = new HookRunner({ preToolUse: [script] })
    const result = await runner.runPreToolUse('bash', '{"command":"rm -rf /"}')
    expect(result.denied).toBe(true)
    expect(result.messages).toContain('dangerous')
  })

  test('returns denied when JSON output contains continue=false', async () => {
    const script = `echo '{"continue":false,"reason":"blocked by policy"}'`
    const runner = new HookRunner({ preToolUse: [script] })
    const result = await runner.runPreToolUse('bash', '{"command":"ls"}')
    expect(result.denied).toBe(true)
    expect(result.messages).toContain('blocked by policy')
  })

  test('returns failed when command exits non-zero non-2', async () => {
    const runner = new HookRunner({ preToolUse: ['exit 1'] })
    const result = await runner.runPreToolUse('bash', '{"command":"ls"}')
    expect(result.failed).toBe(true)
    expect(result.denied).toBe(false)
  })

  test('returns failed when command does not exist', async () => {
    const runner = new HookRunner({ preToolUse: ['nonexistent_command_xyz'] })
    const result = await runner.runPreToolUse('bash', '{"command":"ls"}')
    expect(result.failed).toBe(true)
  })

  test('parses systemMessage from JSON output', async () => {
    const script = `echo '{"systemMessage":"hook ran successfully"}'`
    const runner = new HookRunner({ preToolUse: [script] })
    const result = await runner.runPreToolUse('bash', '{"command":"ls"}')
    expect(result.denied).toBe(false)
    expect(result.messages).toContain('hook ran successfully')
  })

  test('parses permission override from hookSpecificOutput', async () => {
    const script = `echo '{"hookSpecificOutput":{"permissionDecision":"allow","permissionDecisionReason":"trusted tool"}}'`
    const runner = new HookRunner({ preToolUse: [script] })
    const result = await runner.runPreToolUse('bash', '{"command":"ls"}')
    expect(result.permissionOverride).toBe('allow')
    expect(result.permissionReason).toBe('trusted tool')
  })

  test('parses updatedInput from hookSpecificOutput', async () => {
    const script = `echo '{"hookSpecificOutput":{"updatedInput":{"command":"ls -la"}}}'`
    const runner = new HookRunner({ preToolUse: [script] })
    const result = await runner.runPreToolUse('bash', '{"command":"ls"}')
    expect(result.updatedInput).toBe('{"command":"ls -la"}')
  })

  test('runs multiple commands in sequence', async () => {
    const runner = new HookRunner({
      preToolUse: ['echo msg1', 'echo msg2'],
    })
    const result = await runner.runPreToolUse('bash', '{"command":"ls"}')
    expect(result.denied).toBe(false)
    expect(result.failed).toBe(false)
    expect(result.messages).toContain('msg1')
    expect(result.messages).toContain('msg2')
  })

  test('stops on first denial', async () => {
    const runner = new HookRunner({
      preToolUse: ['exit 2', 'echo should_not_run'],
    })
    const result = await runner.runPreToolUse('bash', '{"command":"ls"}')
    expect(result.denied).toBe(true)
    expect(result.messages).not.toContain('should_not_run')
  })

  test('stops on first failure', async () => {
    const runner = new HookRunner({
      preToolUse: ['exit 1', 'echo should_not_run'],
    })
    const result = await runner.runPreToolUse('bash', '{"command":"ls"}')
    expect(result.failed).toBe(true)
    expect(result.messages).not.toContain('should_not_run')
  })
})

describe('runPostToolUse', () => {
  test('runs post tool use hooks', async () => {
    const runner = new HookRunner({ postToolUse: ['echo post-hook-ran'] })
    const result = await runner.runPostToolUse('bash', '{"command":"ls"}', 'file1.txt\nfile2.txt', false)
    expect(result.denied).toBe(false)
    expect(result.failed).toBe(false)
  })
})

describe('runPostToolUseFailure', () => {
  test('runs post tool use failure hooks', async () => {
    const runner = new HookRunner({ postToolUseFailure: ['echo failure-hook-ran'] })
    const result = await runner.runPostToolUseFailure('bash', '{"command":"ls"}', 'command not found')
    expect(result.denied).toBe(false)
    expect(result.failed).toBe(false)
  })
})

describe('non-JSON stdout', () => {
  test('passes through plain text stdout as message', async () => {
    const runner = new HookRunner({ preToolUse: ['echo plain text output'] })
    const result = await runner.runPreToolUse('bash', '{"command":"ls"}')
    expect(result.messages.length).toBeGreaterThan(0)
    expect(result.messages[0]).toContain('plain text output')
  })
})

describe('HookAbortSignal', () => {
  test('aborted before run → cancelled, no commands executed', async () => {
    const runner = new HookRunner({ preToolUse: ['touch /tmp/orchentra-hook-abort-marker.$$'] })
    const signal = new HookAbortSignal()
    signal.abort()
    const result = await runner.runPreToolUse('bash', '{"command":"ls"}', { signal })
    expect(result.cancelled).toBe(true)
    expect(result.denied).toBe(false)
    expect(result.failed).toBe(false)
    expect(result.messages.some((m) => m.includes('cancelled'))).toBe(true)
  })

  test('aborted between commands → remaining commands skipped, cancelled', async () => {
    const signal = new HookAbortSignal()
    const runner = new HookRunner({
      preToolUse: ['echo FIRSTOK', 'sleep 0.05 && printf SHOULDNOTRUN'],
    })
    setTimeout(() => signal.abort(), 5)
    const result = await runner.runPreToolUse('bash', '{"command":"ls"}', { signal })
    expect(result.cancelled).toBe(true)
    const stdouts = result.messages.filter((m) => !m.includes('cancelled while'))
    expect(stdouts.some((m) => m.includes('SHOULDNOTRUN'))).toBe(false)
  })

  test('signal not aborted → runs normally', async () => {
    const signal = new HookAbortSignal()
    const runner = new HookRunner({ preToolUse: ['echo ok'] })
    const result = await runner.runPreToolUse('bash', '{"command":"ls"}', { signal })
    expect(result.cancelled).toBe(false)
    expect(result.denied).toBe(false)
  })
})

describe('failure message format', () => {
  test('exit 1 with no stdout: "Hook `cmd` exited with status 1"', async () => {
    const runner = new HookRunner({ preToolUse: ['exit 1'] })
    const result = await runner.runPreToolUse('bash', '{"command":"ls"}')
    expect(result.failed).toBe(true)
    expect(result.messages[0]).toBe('Hook `exit 1` exited with status 1')
  })

  test('exit code with stderr: "Hook `cmd` exited with status N: <stderr>"', async () => {
    const runner = new HookRunner({ preToolUse: ['echo bad >&2; exit 3'] })
    const result = await runner.runPreToolUse('bash', '{"command":"ls"}')
    expect(result.failed).toBe(true)
    expect(result.messages[0]).toMatch(/^Hook `echo bad >&2; exit 3` exited with status 3: bad$/)
  })

  test('exit code with stdout (non-JSON): stdout becomes the message', async () => {
    const runner = new HookRunner({ preToolUse: ['echo plain stdout text; exit 1'] })
    const result = await runner.runPreToolUse('bash', '{"command":"ls"}')
    expect(result.failed).toBe(true)
    expect(result.messages[0]).toBe('plain stdout text')
  })
})

describe('HookProgressReporter', () => {
  test('emits started + completed for each command', async () => {
    const reporter = new RecordingReporter()
    const runner = new HookRunner({ preToolUse: ['echo a', 'echo b'] })
    await runner.runPreToolUse('bash', '{"command":"ls"}', { reporter })
    expect(reporter.events).toEqual([
      { kind: 'started', event: 'PreToolUse', toolName: 'bash', command: 'echo a' },
      { kind: 'completed', event: 'PreToolUse', toolName: 'bash', command: 'echo a' },
      { kind: 'started', event: 'PreToolUse', toolName: 'bash', command: 'echo b' },
      { kind: 'completed', event: 'PreToolUse', toolName: 'bash', command: 'echo b' },
    ])
  })

  test('emits cancelled when aborted mid-command', async () => {
    const signal = new HookAbortSignal()
    const reporter = new RecordingReporter()
    const runner = new HookRunner({ preToolUse: ['sleep 0.1'] })
    setTimeout(() => signal.abort(), 5)
    await runner.runPreToolUse('bash', '{"command":"ls"}', { signal, reporter })
    expect(reporter.events.some((e) => e.kind === 'started' && e.command === 'sleep 0.1')).toBe(true)
    expect(reporter.events.some((e) => e.kind === 'cancelled' && e.command === 'sleep 0.1')).toBe(true)
  })

  test('emits completed for failed command (failure is still completion)', async () => {
    const reporter = new RecordingReporter()
    const runner = new HookRunner({ preToolUse: ['exit 1'] })
    await runner.runPreToolUse('bash', '{"command":"ls"}', { reporter })
    expect(reporter.events).toEqual([
      { kind: 'started', event: 'PreToolUse', toolName: 'bash', command: 'exit 1' },
      { kind: 'completed', event: 'PreToolUse', toolName: 'bash', command: 'exit 1' },
    ])
  })

  test('no reporter → runs normally', async () => {
    const runner = new HookRunner({ preToolUse: ['echo ok'] })
    const result = await runner.runPreToolUse('bash', '{"command":"ls"}')
    expect(result.failed).toBe(false)
  })
})
