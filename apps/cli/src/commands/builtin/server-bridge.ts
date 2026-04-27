import { postSlashCommand, resolveOrchentraConfig } from '@orchentra/cli-api'
import type { CommandContext, CommandHandler, SlashCommandSpec } from '../registry'

export interface ServerSendInput {
  readonly command: string
  readonly args: readonly string[]
  readonly sessionId: string
  readonly cwd: string
}

export interface ServerCommandDeps {
  /**
   * Stream chunks for a server slash command. Default implementation
   * resolves Orchentra config from env/settings/credentials and POSTs
   * to /api/orgs/:orgId/commands.
   */
  send: (input: ServerSendInput) => AsyncIterable<string>
}

const defaultSend: ServerCommandDeps['send'] = async function* (input) {
  const cfg = resolveOrchentraConfig({ cwd: input.cwd })
  yield* postSlashCommand({
    serverUrl: cfg.serverUrl,
    orgId: cfg.orgId,
    apiKey: cfg.apiKey,
    command: input.command,
    args: input.args,
    sessionId: input.sessionId,
  })
}

export function createServerCommand(
  spec: SlashCommandSpec,
  serverCommand: string,
  deps: ServerCommandDeps = { send: defaultSend },
): CommandHandler {
  return {
    spec,
    async execute(args: string[], ctx: CommandContext): Promise<boolean> {
      const label = `/${spec.name}`
      let lastChar = ''
      try {
        for await (const chunk of deps.send({
          command: serverCommand,
          args,
          sessionId: ctx.session.getSessionId(),
          cwd: ctx.cwd,
        })) {
          if (chunk.length === 0) continue
          if (ctx.ui) {
            ctx.ui({ kind: 'stream', delta: chunk, label })
          } else {
            process.stdout.write(chunk)
          }
          lastChar = chunk[chunk.length - 1]
        }
        if (lastChar !== '\n') {
          if (ctx.ui) ctx.ui({ kind: 'stream', delta: '\n', label })
          else process.stdout.write('\n')
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (ctx.ui) ctx.ui({ kind: 'note', tone: 'warn', text: `error: ${msg}` })
        else process.stdout.write(`error: ${msg}\n`)
      }
      return true
    },
  }
}
