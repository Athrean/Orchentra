import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'
import { isThemeName, loadActiveTheme, saveActiveTheme, themeNames, type ThemeName } from '../../tui/theme-registry'

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
    aliases: [],
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

function describeTheme(name: ThemeName): string {
  switch (name) {
    case 'dark':
      return 'Default dark palette · truecolor'
    case 'light':
      return 'Light-mode inverse · for white backgrounds'
    case 'dark-ansi':
      return '16-colour ANSI fallback · plain terminals'
    case 'solarized-dark':
      return 'Solarized dark · low-eyestrain palette'
    case 'solarized-light':
      return 'Solarized light · cream-paper canvas'
    case 'high-contrast':
      return 'High-contrast · WCAG AAA accessible'
  }
}
