import { operations, setGithubAdapter, setRepoMonitoredCheck, type Operation } from '@orchentra/operations'
import { buildLowercaseGithubAdapter, buildRepoMonitoredCheck, parseAllowedRepos } from '../commands/mcp-serve'
import { buildShellAction } from './factory'

const opsByVerb: Map<string, Operation<unknown, unknown>> = buildOpMap()

function buildOpMap(): Map<string, Operation<unknown, unknown>> {
  const m = new Map<string, Operation<unknown, unknown>>()
  for (const op of operations) {
    const name = (op.cliHints as { name?: string } | undefined)?.name ?? op.id
    m.set(name, op as Operation<unknown, unknown>)
  }
  return m
}

export function knownOpIds(): Set<string> {
  return new Set(opsByVerb.keys())
}

export async function runOpVerb(opId: string, argv: string[]): Promise<number> {
  const op = opsByVerb.get(opId)
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
