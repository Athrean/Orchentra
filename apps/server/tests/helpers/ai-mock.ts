/**
 * Bun's mock.module is process-global. A partial 'ai' mock in one test file
 * leaks into others — causing "Export named X not found" when another test
 * statically imports something the partial mock didn't include.
 *
 * Each test that mocks 'ai' should spread `aiMockBase()` and override only
 * the named exports it actually drives, so unused exports are still defined.
 */
export function aiMockBase(): Record<string, unknown> {
  return {
    tool: (def: unknown) => def,
    generateText: async () => ({ text: '', usage: null, steps: [], finishReason: 'stop' }),
    generateObject: async () => ({ object: {}, usage: null }),
    streamText: () => ({
      textStream: (async function* () {})(),
    }),
    embed: async () => ({ embedding: [] }),
    cosineSimilarity: () => 0,
  }
}
