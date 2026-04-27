import type { ParsedSkill } from '@orchentra/cli-core'
import { substituteSkillArguments } from '@orchentra/cli-core'
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
    async execute(args: string[], _ctx: CommandContext): Promise<boolean> {
      const resolvedBody = substituteSkillArguments(skill.body, args)
      await deps.runTurn(resolvedBody)
      return true
    },
  }
}
