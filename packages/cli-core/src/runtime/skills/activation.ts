import { dirname } from 'node:path'
import type { ParsedSkill } from './types'
import { substituteSkillArguments } from './arguments'

export function userInvocable(skill: ParsedSkill): boolean {
  return skill.meta['user-invocable'] !== false && skill.meta['user-invocable'] !== 'false'
}
export function modelInvocable(skill: ParsedSkill): boolean {
  return skill.meta['disable-model-invocation'] !== true && skill.meta['disable-model-invocation'] !== 'true'
}
export function renderSkill(skill: ParsedSkill, args: readonly string[]): string {
  const body = substituteSkillArguments(skill.body, [...args])
    .split('${CLAUDE_SKILL_DIR}')
    .join(dirname(skill.source))
    .split('${SKILL_DIR}')
    .join(dirname(skill.source))
  return `Skill: ${skill.name}\nSource: ${skill.source}\nResource directory: ${dirname(skill.source)}\n\n${body}`
}
