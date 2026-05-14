import { runFirstRunFlow, makeDefaultFirstRunDeps, type FirstRunDeps } from '../auth/first-run-flow'

export async function runReauth(deps?: FirstRunDeps): Promise<number> {
  const flow = deps ?? makeDefaultFirstRunDeps()
  const result = await runFirstRunFlow(flow)
  if (result.kind === 'cancelled') {
    process.stderr.write('reauth cancelled — no changes\n')
    return 1
  }
  return 0
}
