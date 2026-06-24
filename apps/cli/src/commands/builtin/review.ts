import type { SlashCommandSpec } from '../registry'
import { ScanSlashCommand } from './scan-slash'

export class ReviewCommand extends ScanSlashCommand {
  spec: SlashCommandSpec = {
    name: 'review',
    aliases: [],
    summary: 'Review code changes with the configured model',
    argumentHint: '[--diff|--full|--path <p>]',
  }
}
