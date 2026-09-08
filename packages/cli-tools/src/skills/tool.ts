import { readFile, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { containedPath, modelInvocable, renderSkill, type ParsedSkill, type ToolDefinition } from '@orchentra/cli-core'

/** Only summaries enter the tool schema. Bodies and companion references load on demand. */
export function createSkillTool(skills: readonly ParsedSkill[]): ToolDefinition {
  const catalog = skills.filter(modelInvocable)
  return {
    name: 'skill',
    level: 'read',
    description:
      'Load a skill by name before following its instructions. Resources can be read using a relative resource path. Skills do not change session permissions. Available skills:\n' +
      catalog
        .map((skill) => `${skill.name}: ${skill.description.slice(0, 300)}`)
        .join('\n')
        .slice(0, 20_000),
    scheduling: { pure: true, idempotent: true, concurrencySafe: true, resourceClass: 'filesystem' },
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        arguments: { type: 'array', items: { type: 'string' }, maxItems: 50 },
        resource: { type: 'string' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    async execute(args, ctx) {
      const input = args as { name: string; arguments?: string[]; resource?: string }
      const skill = catalog.find((entry) => entry.name === input.name)
      if (!skill) return { content: `Skill is unavailable for model invocation: ${input.name}`, isError: true }
      try {
        ctx.signal?.throwIfAborted()
        if (input.resource) {
          const path = await containedPath(dirname(skill.source), input.resource)
          if (!(await stat(path)).isFile() || (await stat(path)).size > 256 * 1024)
            throw new Error('Skill resource must be a regular text file of at most 256 KiB')
          const content = await readFile(path, 'utf8')
          if (content.includes('\0')) throw new Error('Binary skill resources are not supported')
          return {
            content: `Skill resource: ${path}\n\n${content}`,
            isError: false,
            data: { name: skill.name, source: path },
          }
        }
        return {
          content: renderSkill(skill, input.arguments ?? []),
          isError: false,
          data: { name: skill.name, source: skill.source, allowedTools: skill.allowedTools },
        }
      } catch (error) {
        return { content: error instanceof Error ? error.message : String(error), isError: true }
      }
    },
  }
}
