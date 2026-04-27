import type { ParsedSkill, PermissionRuleConfig, SkillLoadError } from '@orchentra/cli-core'
import { substituteSkillArguments, translateAllowedTools } from '@orchentra/cli-core'
import type { CommandHandler, CommandContext, CommandRegistry, SlashCommandSpec } from '../registry'
import type { UiKVRow } from '../ui-output'
import { THEME } from '../../tui/theme'

export interface SkillTurnOptions {
  permissionOverlay?: PermissionRuleConfig
}

export interface SkillAdapterDeps {
  runTurn: (text: string, opts?: SkillTurnOptions) => Promise<void>
}

let loadedSkills: ParsedSkill[] = []
let loadErrors: SkillLoadError[] = []

export function registerSkillCommands(registry: CommandRegistry, skills: ParsedSkill[], deps: SkillAdapterDeps): void {
  loadedSkills = skills.slice()
  for (const skill of skills) {
    registry.register(buildSkillHandler(skill, deps))
  }
}

export function recordLoadErrors(errors: SkillLoadError[]): void {
  loadErrors = errors.slice()
}

export function getLoadedSkills(): readonly ParsedSkill[] {
  return loadedSkills
}

export function getLoadErrors(): readonly SkillLoadError[] {
  return loadErrors
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

export class SkillsCommand implements CommandHandler {
  spec: SlashCommandSpec = {
    name: 'skills',
    aliases: [],
    summary: 'List loaded skills + load errors',
  }

  async execute(_args: string[], ctx: CommandContext): Promise<boolean> {
    const skills = getLoadedSkills()
    const errors = getLoadErrors()

    const skillRows: UiKVRow[] = skills.map((s) => ({
      key: s.name,
      value: `${s.description}  ${s.source}`,
      valueColor: THEME.muted,
    }))
    const errorRows: UiKVRow[] = errors.map((e) => ({
      key: e.path,
      value: e.field ? `[${e.field}] ${e.message}` : e.message,
      valueColor: THEME.warn,
    }))

    if (ctx.ui) {
      const sections = []
      if (skillRows.length > 0) sections.push({ rows: skillRows })
      if (errorRows.length > 0) sections.push({ title: 'Errors', rows: errorRows })
      if (sections.length === 0) {
        sections.push({
          rows: [
            {
              key: 'Hint',
              value: 'Drop a SKILL.md in <repo>/.orchentra/skills/<name>/ to add a skill',
              valueColor: THEME.muted,
            },
          ],
        })
      }
      ctx.ui({
        kind: 'card',
        title: 'Skills',
        subtitle: `${skills.length} loaded${errors.length > 0 ? ` • ${errors.length} errors` : ''}`,
        sections,
      })
      return true
    }

    if (skills.length === 0 && errors.length === 0) {
      process.stdout.write('No skills loaded.\nDrop a SKILL.md in <repo>/.orchentra/skills/<name>/ to add one.\n')
      return true
    }
    const lines: string[] = [`Skills (${skills.length} loaded${errors.length > 0 ? `, ${errors.length} errors` : ''}):`]
    for (const s of skills) lines.push(`  ${s.name.padEnd(20)}  ${s.description}  (${s.source})`)
    for (const e of errors) lines.push(`  ! ${e.path}: ${e.message}`)
    process.stdout.write(lines.join('\n') + '\n')
    return true
  }
}
