import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { ToolRegistry } from '../src/agent/tool-registry'
import { buildAgentSystemPrompt } from '../src/agent/prompts'

function fixtureRegistry(): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register({
    name: 'get_workflow_logs',
    permission: 'read',
    description: 'Fetch the last 300 lines of the failed job logs.',
    parameters: z.object({ owner: z.string(), repo: z.string(), runId: z.number() }),
    execute: async () => ({}),
  })
  return registry
}

describe('buildAgentSystemPrompt — branching on execution.kind', () => {
  const registry = fixtureRegistry()

  test('default kind (no arg) preserves the existing CI-failure persona', () => {
    const prompt = buildAgentSystemPrompt({ registry })
    expect(prompt).toContain('incident triage agent')
    expect(prompt).toContain('CI/CD failure')
  })

  test('kind=ci_failure renders the CI-failure persona', () => {
    const prompt = buildAgentSystemPrompt({ registry, kind: 'ci_failure' })
    expect(prompt).toContain('CI/CD failure')
  })

  test('kind=cron renders a scheduled-task persona', () => {
    const prompt = buildAgentSystemPrompt({ registry, kind: 'cron' })
    expect(prompt).toContain('scheduled task')
    expect(prompt).not.toContain('CI/CD failure')
  })

  test('all kinds still render the tool catalog (deep-module contract)', () => {
    for (const kind of ['ci_failure', 'cron'] as const) {
      const prompt = buildAgentSystemPrompt({ registry, kind })
      expect(prompt).toContain('Available tools:')
      expect(prompt).toContain('get_workflow_logs')
    }
  })

  test('all kinds still render the strategy/rules tail so caching still hits per-kind', () => {
    for (const kind of ['ci_failure', 'cron'] as const) {
      const prompt = buildAgentSystemPrompt({ registry, kind })
      expect(prompt).toContain('Tool calling strategy')
      expect(prompt).toContain('Confidence scoring')
    }
  })
})
