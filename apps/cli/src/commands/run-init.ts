import { resolveToken } from '@orchentra/cli-api'
import { initializeRepo, type InitReport } from '../init'
import { createTerminalLoginIo, runLogin } from './run-auth'

export interface RunInitOptions {
  readonly cwd?: string
  readonly initialize?: (cwd: string) => InitReport
  readonly hasGitHubToken?: () => boolean
  readonly loginGitHub?: () => Promise<boolean>
  readonly out?: (message: string) => void
}

export async function runInit(options: RunInitOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd()
  const report = (options.initialize ?? initializeRepo)(cwd)
  const out = options.out ?? ((message: string) => process.stdout.write(`${message}\n`))

  out(`Initialized ${report.projectRoot}`)
  for (const artifact of report.artifacts) out(`  ${artifact.status.padEnd(7)} ${artifact.name}`)

  const hasGitHubToken = options.hasGitHubToken ?? (() => resolveToken() !== null)
  if (hasGitHubToken()) {
    out('✓ GitHub already connected')
    return 0
  }

  out('GitHub login required for PRs, issues, and Actions.')
  const loginGitHub = options.loginGitHub ?? (() => runLogin('github', createTerminalLoginIo()))
  return (await loginGitHub()) ? 0 : 1
}
