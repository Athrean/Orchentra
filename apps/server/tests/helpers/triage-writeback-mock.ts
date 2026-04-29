/**
 * Shared baseline for `mock.module('../src/github/triage-writeback', ...)`.
 */
export function triageWritebackMockBase(): Record<string, unknown> {
  return {
    publishInitialGithubTriage: async () => {},
    publishFinalGithubTriage: async () => {},
  }
}
