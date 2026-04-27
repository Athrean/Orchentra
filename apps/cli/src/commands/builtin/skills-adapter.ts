import type { ParsedSkill, PermissionRuleConfig } from '@orchentra/cli-core'
import { substituteSkillArguments, translateAllowedTools } from '@orchentra/cli-core'
import type { CommandHandler, CommandContext, CommandRegistry, SlashCommandSpec } from '../registry'

export interface SkillTurnOptions {
  permissionOverlay?: PermissionRuleConfig
}

export interface SkillAdapterDeps {
  runTurn: (text: string, opts?: SkillTurnOptions) => Promise<void>
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
      const { config: permissionOverlay, warnings } = translateAllowedTools(skill.allowedTools)
      for (const warning of warnings) {
        process.stderr.write(`[orchentra] skill '${skill.name}': ${warning}\n`)
      }
      await deps.runTurn(resolvedBody, permissionOverlay.allow.length > 0 ? { permissionOverlay } : undefined)
      return true
    },
  }
}
