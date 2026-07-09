export interface ParsedSkill {
  name: string
  description: string
  body: string
  source: string
  allowedTools: string[]
  argumentNames: string[]
  meta: Record<string, unknown>
}

export interface LoadError {
  path: string
  message: string
  field?: string
}

export interface LoadSkillsOptions {
  workspaceRoot: string
  configHome?: string
}

export interface LoadSkillsResult {
  skills: ParsedSkill[]
  errors: LoadError[]
}
