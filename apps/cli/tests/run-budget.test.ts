import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Provider, ProviderStreamEvent, SharedToolState } from '@orchentra/cli-core'
import { DefaultToolRegistry } from '@orchentra/cli-tools'
import { LiveCli, type ModelResolver } from '../src/live-cli'

function sharedState(): SharedToolState {
  return {
    taskStore: {
      create: () => {
        throw new Error('not used')
      },
      get: () => undefined,
      list: () => [],
      update: () => {},
      cancel: () => {},
    },
    todos: [],
    agentCounter: 0,
    planMode: false,
  }
}

describe('run-scoped dollar budget', () => {
  test('spend accumulates across turns within one invocation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchentra-run-budget-'))
    try {
      let providerCalls = 0
      const provider: Provider = {
        async *stream(): AsyncGenerator<ProviderStreamEvent> {
          providerCalls++
          yield { kind: 'text-delta', delta: 'hi' }
          // 1000 output tokens at sonnet pricing ($15/M) = $0.015 > the $0.01 cap.
          yield {
            kind: 'usage',
            usage: { inputTokens: 0, outputTokens: 1000, cacheReadTokens: 0, cacheCreationTokens: 0 },
          }
          yield { kind: 'finish', stopReason: 'end_turn' }
        },
      }
      const resolveModel: ModelResolver = (model) => ({ model, provider, providerName: 'test' })
      const cli = new LiveCli({
        model: 'sonnet',
        permissionMode: 'workspace-write',
        provider,
        resolveModel,
        tools: new DefaultToolRegistry(),
        cwd: dir,
        sessionId: 'run-budget-test',
        sharedState: sharedState(),
        budgetConfig: { maxCostUsd: 0.01 },
      })

      const first = await cli.runTurn('one')
      expect(first.reason).toBe('cost_exhausted')

      // The second turn is stopped by the spend of the first, before the
      // provider is ever called — the budget outlives the turn.
      const second = await cli.runTurn('two')
      expect(second.reason).toBe('cost_exhausted')
      expect(providerCalls).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
