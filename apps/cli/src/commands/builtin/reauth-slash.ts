import type { CommandHandler, CommandContext, SlashCommandSpec } from '../registry'

// Reauth must run an interactive provider picker + API key prompt, which
// fights the TUI for stdin. We surface a card pointing the user at the
// shell verb instead, mirroring how /login handles non-anthropic OAuth.
export class ReauthCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'reauth',
    aliases: [],
    summary: 'Re-run the first-run LLM provider setup',
    argumentHint: '',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    ctx.ui?.({
      kind: 'card',
      title: 'Re-authenticate',
      subtitle: 'OS keychain write needs a clean terminal',
      sections: [
        {
          title: 'Run in a fresh terminal',
          rows: [{ key: '$', value: 'orchentra reauth' }],
        },
        {
          title: 'After reauth',
          rows: [
            { key: '1', value: 'pick a provider' },
            { key: '2', value: 'paste your API key' },
            { key: '3', value: 'restart orchentra' },
          ],
        },
      ],
    })
    return true
  }
}
