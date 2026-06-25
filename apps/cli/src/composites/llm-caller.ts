import type { Provider, ProviderRequest } from '@orchentra/cli-core'
import { createProvider, resolveModelAlias, type CreatedProvider } from '../provider-factory'
import type { LlmCaller } from './scan'

type ProviderFactory = (model: string) => CreatedProvider

// The production one-shot LLM caller: one streamed request, no tools, text +
// usage collected. This is the real caller that composites/scan.ts only stubs.
// `make` is injected so tests can supply a fake provider instead of hitting creds.
export function buildOneShotLlmCaller(model: string, make: ProviderFactory = createProvider): LlmCaller {
  const resolved = resolveModelAlias(model)
  const { provider } = make(resolved)
  return async ({ systemPrompt, userPrompt }) => {
    const request: ProviderRequest = {
      systemStatic: systemPrompt,
      systemDynamic: '',
      messages: [{ role: 'user', content: userPrompt }],
      tools: [],
      model: resolved,
      maxOutputTokens: 2048,
    }
    return collectOneShot(provider, request, resolved)
  }
}

async function collectOneShot(
  provider: Provider,
  request: ProviderRequest,
  model: string,
): Promise<{ text: string; model: string; tokensIn: number; tokensOut: number }> {
  let text = ''
  let tokensIn = 0
  let tokensOut = 0
  for await (const ev of provider.stream(request)) {
    if (ev.kind === 'text-delta') text += ev.delta
    else if (ev.kind === 'usage') {
      tokensIn = ev.usage.inputTokens
      tokensOut = ev.usage.outputTokens
    }
  }
  return { text, model, tokensIn, tokensOut }
}
