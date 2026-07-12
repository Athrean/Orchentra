import { ConversationRuntime, buildSystemPrompt, type DoneReason, type ToolRegistry } from '@orchentra/cli-core'
import { createProvider, resolveModelAlias, type CreatedProvider } from '../provider-factory'
import type { LlmCaller } from './scan'

type ProviderFactory = (model: string) => CreatedProvider

const noTools: ToolRegistry = {
  list: () => [],
  has: () => false,
  register: () => {},
  execute: async () => ({ content: 'no tools available in a composite one-shot call', isError: true }),
}

// The production one-shot LLM caller: a single ConversationRuntime turn with
// no tools, text + usage collected. Re-homed from a raw provider.stream loop
// so composites can't execute outside the runtime (ADR-0008). `make` is
// injected so tests can supply a fake provider instead of hitting creds.
export function buildOneShotLlmCaller(model: string, make: ProviderFactory = createProvider): LlmCaller {
  const resolved = resolveModelAlias(model)
  const { provider } = make(resolved)
  return async ({ systemPrompt, userPrompt }) => {
    const runtime = new ConversationRuntime(
      {
        model: resolved,
        maxOutputTokens: 2048,
        contextWindowTokens: 200_000,
        compactionThreshold: 0.8,
        keepRecentOnCompact: 6,
        // No tools are advertised, so the turn ends after one provider call;
        // maxSteps 2 keeps the clean path reporting 'stop' instead of tripping
        // the post-turn step guard.
        budget: { maxSteps: 2, maxTokens: 200_000, model: resolved },
        sessionId: 'composite-one-shot',
        cwd: process.cwd(),
      },
      {
        provider,
        tools: noTools,
        systemPrompt: buildSystemPrompt({ staticParts: [systemPrompt], dynamicParts: [] }),
      },
    )

    let text = ''
    let tokensIn = 0
    let tokensOut = 0
    let errorMessage = ''
    let reason: DoneReason = 'stop'
    for await (const ev of runtime.run({ userMessage: userPrompt })) {
      if (ev.kind === 'text') {
        text += ev.delta
      } else if (ev.kind === 'usage') {
        tokensIn = ev.cumulative.inputTokens
        tokensOut = ev.cumulative.outputTokens
      } else if (ev.kind === 'error') {
        errorMessage = ev.message
      } else if (ev.kind === 'done') {
        reason = ev.reason
      }
    }
    // The old raw-stream caller propagated provider failures; keep that contract.
    if (reason === 'error') {
      throw new Error(errorMessage || 'provider stream failed')
    }
    return { text, model: resolved, tokensIn, tokensOut }
  }
}
