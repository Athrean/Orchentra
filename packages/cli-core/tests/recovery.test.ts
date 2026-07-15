import { describe, expect, test } from 'bun:test'
import { classifyRecovery } from '../src/runtime/recovery'

describe('classified runtime recovery', () => {
  test('routes edit, browser, and worker startup failures through existing taxonomy', () => {
    expect(classifyRecovery({ toolName: 'edit_file', message: 'stale read' })).toMatchObject({
      failureClass: 'tool_runtime',
      action: 'replan',
    })
    expect(classifyRecovery({ toolName: 'browser_act', message: 'browser crash: page closed' })).toMatchObject({
      failureClass: 'tool_runtime',
      action: 'retry',
    })
    expect(
      classifyRecovery({
        message: 'worker boot stalled',
        startupEvidence: {
          lastLifecycleState: 'trust_required',
          paneCommand: 'orchentra',
          promptAcceptanceState: false,
          trustPromptDetected: true,
          transportHealthy: true,
          mcpHealthy: true,
          elapsedSeconds: 1,
        },
      }),
    ).toMatchObject({ failureClass: 'plugin_startup', action: 'reraise' })
  })
})
