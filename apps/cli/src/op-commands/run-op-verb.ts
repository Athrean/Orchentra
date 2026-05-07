import { getPullRequestOperation, setGithubAdapter, setRepoMonitoredCheck } from '@orchentra/operations'
import { buildLowercaseGithubAdapter, buildRepoMonitoredCheck, parseAllowedRepos } from '../commands/mcp-serve'
import { buildShellAction } from './factory'

// Slice A foundation tracer: only get_pull_request is wired. Slice B will
// walk the operations registry and register every op via the same factory.
const opsByVerb: Record<string, typeof getPullRequestOperation> = {
  get_pull_request: getPullRequestOperation,
}

export async function runOpVerb(opId: string, argv: string[]): Promise<number> {
  const op = opsByVerb[opId]
  if (!op) {
    process.stderr.write(`error: no op registered for verb '${opId}'\n`)
    return 1
  }

  const allowedRepos = parseAllowedRepos(process.env.ORCHENTRA_ALLOWED_REPOS)
  setGithubAdapter(buildLowercaseGithubAdapter())
  setRepoMonitoredCheck(buildRepoMonitoredCheck(allowedRepos))

  const action = buildShellAction(op, {
    writeStdout: (line) => process.stdout.write(`${line}\n`),
    writeStderr: (line) => process.stderr.write(`${line}\n`),
  })
  return action(argv)
}
