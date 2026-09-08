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
  /** Home directory to resolve interop skill roots against. Defaults to os.homedir(). */
  homeDir?: string
  /** Set false to load only Orchentra's own skill trees. Defaults to true. */
  interop?: boolean
}

export interface LoadSkillsResult {
  skills: ParsedSkill[]
  errors: LoadError[]
}
