import type { ParsedSkill } from '@orchentra/cli-core'
import type { CommandHandler, CommandContext, CommandRegistry, SlashCommandSpec } from '../registry'

export interface SkillAdapterDeps {
  runTurn: (text: string) => Promise<void>
}

export function registerSkillCommands(registry: CommandRegistry, skills: ParsedSkill[], deps: SkillAdapterDeps): void {
  for (const skill of skills) {
    registry.register(buildSkillHandler(skill, deps))
  }
}

function buildSkillHandler(skill: ParsedSkill, deps: SkillAdapterDeps): CommandHandler {
  const spec: SlashCommandSpec = {
    name: skill.name,
    aliases: [],
    summary: skill.description,
  }

  return {
    spec,
    async execute(_args: string[], _ctx: CommandContext): Promise<boolean> {
      await deps.runTurn(skill.body)
      return true
    },
  }
}
