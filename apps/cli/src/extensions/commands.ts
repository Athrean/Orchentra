import { ExtensionStore, type ExtensionKind } from '@orchentra/cli-core'
import type { CommandHandler, CommandContext } from '../commands/registry'

const actions = new Set(['list', 'install', 'update', 'remove', 'enable', 'disable', 'rollback'])
export async function manageExtensions(
  kind: ExtensionKind,
  args: string[],
  store = new ExtensionStore(),
): Promise<string> {
  const action = args[0] ?? 'list'
  if (!actions.has(action)) throw new Error('Expected list, install, update, remove, enable, disable, or rollback')
  if (action === 'list') {
    const entries = await store.list(kind)
    return entries.length
      ? entries
          .map(
            (e) =>
              `${e.name} ${e.version} · ${e.enabled ? 'enabled' : 'disabled'} · ${e.revision ?? e.digest.slice(0, 12)}\n  ${e.source}`,
          )
          .join('\n')
      : `No ${kind}s installed.`
  }
  const name = args[1]
  if (!name)
    throw new Error(
      `${action} requires ${action === 'install' ? 'a local directory or HTTPS Git URL pinned to a commit' : 'an installed name'}`,
    )
  if (action === 'install' || action === 'update') {
    const entry = action === 'install' ? await store.install(kind, name) : await store.update(kind, name, args[2])
    return `${action === 'install' ? 'Installed' : 'Updated'} ${entry.name} ${entry.version} (${entry.digest.slice(0, 12)}).`
  }
  await store.change(kind, name, action as 'remove' | 'enable' | 'disable' | 'rollback')
  return `${kind} ${name}: ${action} complete.`
}

export class PluginsCommand implements CommandHandler {
  spec = {
    name: 'plugins',
    aliases: [] as string[],
    summary: 'Manage local plugin bundles',
    argumentHint: '[list|install|update|remove|enable|disable|rollback|reload]',
  }
  constructor(
    private readonly store = new ExtensionStore(),
    private readonly reload?: () => Promise<unknown>,
  ) {}
  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    let text: string
    try {
      if (args[0] === 'reload') {
        await this.reload?.()
        text = 'Extensions reloaded.'
      } else {
        text = await manageExtensions('plugin', args, this.store)
        if (args.length && args[0] !== 'list') await this.reload?.()
      }
    } catch (error) {
      text = `Plugin error: ${error instanceof Error ? error.message : String(error)}`
    }
    if (ctx.ui) ctx.ui({ kind: 'note', text })
    else process.stdout.write(text + '\n')
    return true
  }
}
