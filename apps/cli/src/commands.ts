import { createBuiltinRegistry, type CommandContext, type CommandHandler } from './commands/builtin'

export type { CommandContext }

const registry = createBuiltinRegistry()

export function parseSlashCommand(input: string): { handler: CommandHandler; args: string[] } | null | Error {
  return registry.resolve(input)
}

export async function dispatchCommand(
  resolved: { handler: CommandHandler; args: string[] },
  ctx: CommandContext,
): Promise<boolean> {
  return resolved.handler.execute(resolved.args, ctx)
}

export { registry, createBuiltinRegistry }
