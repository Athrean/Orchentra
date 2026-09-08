import { describe, expect, test } from 'bun:test'
import { createProvider } from '../src/provider-factory'
import { MODEL_CATALOG } from '../src/model-catalog'

/**
 * The two opencode hosts and the Antigravity host all share ids with something
 * else, so routing is entirely carried by the catalog's prefixes. These pin the
 * three facts that a wrong prefix turns into an opaque 401/404/500:
 *   `go/`  -> /zen/go/v1  (flat plan)      vs `zen/` -> /zen/v1 (prepaid credits)
 *   GPT/Grok/Muse Spark -> /responses      vs everything else -> /chat/completions
 *   `antigravity/` -> Code Assist          vs bare `gemini-*` -> public Gemini API
 */
describe('gateway routing', () => {
  test('go/ and zen/ are different providers on the same key', () => {
    expect(createProvider('go/kimi-k3').providerName).toBe('zen-go')
    expect(createProvider('zen/nemotron-3-ultra-free').providerName).toBe('zen')
  })

  test.each([
    ['go/gpt-5.6-luna', 'ResponsesProvider'],
    ['go/grok-4.6', 'ResponsesProvider'],
    ['go/muse-spark-1.3-contributor', 'ResponsesProvider'],
    ['go/omen-alpha', 'OpenAiCompatProvider'],
    ['go/qwen3.6-plus', 'OpenAiCompatProvider'],
    ['zen/muse-spark-1.3-contributor-free', 'ResponsesProvider'],
    ['zen/nemotron-3-ultra-free', 'OpenAiCompatProvider'],
    ['zen/ling-3.0-flash-fin-free', 'OpenAiCompatProvider'],
  ])('%s streams via %s', (model, expected) => {
    expect(createProvider(model).provider.constructor.name).toBe(expected)
  })

  // Regression: qwen ids used to hit a hardcoded "endpoint not implemented"
  // throw, which made two of the plan's own models unreachable.
  test('no catalog gateway model throws while being constructed', () => {
    for (const m of MODEL_CATALOG) {
      if (!m.id.startsWith('go/') && !m.id.startsWith('zen/')) continue
      expect(() => createProvider(m.id)).not.toThrow()
    }
  })

  test('antigravity/ reaches Code Assist; a bare gemini id does not', () => {
    expect(createProvider('antigravity/gemini-3.6-flash-high').providerName).toBe('antigravity')
    expect(createProvider('antigravity/claude-sonnet-4-6').providerName).toBe('antigravity')
    // Same trailing id, different host — this is why the prefix exists.
    expect(createProvider('claude-sonnet-4-6').providerName).toBe('anthropic')
  })

  test('every catalog id constructs a provider', () => {
    for (const m of MODEL_CATALOG) {
      expect(() => createProvider(m.id)).not.toThrow()
    }
  })
})
