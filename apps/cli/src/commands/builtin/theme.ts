import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { describeTheme, isThemeName, loadActiveTheme, saveActiveTheme, themeNames } from '../../tui/theme-registry'

/**
 * `/theme` slash handler. Three call shapes:
 *
 *   /theme                — open the picker overlay (TUI) or print current
 *                           theme name (non-TUI)
 *   /theme <name>         — switch + persist
 *   /theme list           — show every registered theme
 */
export class ThemeCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'theme',
    aliases: ['th'],
    summary: 'Switch the TUI colour theme — picker when no args',
    argumentHint: '[name|list]',
  }

  async execute(args: string[], ctx: CommandContext): Promise<boolean> {
    const requested = args.join(' ').trim()

    if (!requested) {
      if (ctx.ui) {
        ctx.ui({ kind: 'theme-picker' })
        return true
      }
      process.stdout.write(`Current theme: ${loadActiveTheme()}\n`)
      return true
    }

    if (requested === 'list') {
      if (ctx.ui) {
        ctx.ui({
          kind: 'card',
          title: 'Themes',
          subtitle: '/theme <name> to switch',
          sections: [
            {
              rows: themeNames().map((n) => ({
                key: n,
                value: describeTheme(n),
              })),
            },
          ],
        })
      } else {
        for (const n of themeNames()) process.stdout.write(`${n}\n`)
      }
      return true
    }

    if (!isThemeName(requested)) {
      const text = `unknown theme: ${requested} — try one of: ${themeNames().join(', ')}`
      if (ctx.ui) ctx.ui({ kind: 'note', tone: 'warn', text })
      else process.stderr.write(text + '\n')
      return true
    }

    saveActiveTheme(requested)
    const text = `theme → ${requested}`
    if (ctx.ui) ctx.ui({ kind: 'note', text })
    else process.stdout.write(text + '\n')
    return true
  }
}
