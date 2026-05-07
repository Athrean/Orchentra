import type { Operation } from '@orchentra/operations'
import type { CommandContext, CommandRegistry } from '../commands/registry'
import { buildSlashHandlerArgs, type IoSinks } from './factory'

/**
 * Register one operation as a slash command on the registry. The slash name
 * is derived from `op.cliHints.name` (canonical id by default). Slice A
 * registers a single op; Slice B will iterate the operations array.
 */
export function registerOpAsSlash<T, R>(registry: CommandRegistry, op: Operation<T, R>, summary?: string): void {
  const name = op.cliHints?.name ?? op.id
  registry.register({
    spec: {
      name,
      aliases: op.cliHints?.aliases ?? [],
      summary: summary ?? op.description.split('. ')[0],
    },
    execute: async (args, ctx) => {
      const io: IoSinks = makeIoFromCtx(ctx)
      const handler = buildSlashHandlerArgs(op, io)
      const exit = await handler(args)
      return exit === 0
    },
  })
}

function makeIoFromCtx(ctx: CommandContext): IoSinks {
  return {
    writeStdout: (line) => {
      if (ctx.ui) {
        ctx.ui({ kind: 'text', text: line })
      } else {
        process.stdout.write(`${line}\n`)
      }
    },
    writeStderr: (line) => {
      if (ctx.ui) {
        ctx.ui({ kind: 'note', tone: 'warn', text: line })
      } else {
        process.stderr.write(`${line}\n`)
      }
    },
  }
}
