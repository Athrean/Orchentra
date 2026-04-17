export interface SystemPromptInput {
  staticParts: string[]
  dynamicParts: string[]
}

export interface SystemPrompt {
  static: string
  dynamic: string
}

export function buildSystemPrompt(input: SystemPromptInput): SystemPrompt {
  return {
    static: joinSections(input.staticParts),
    dynamic: joinSections(input.dynamicParts),
  }
}

function joinSections(parts: string[]): string {
  const trimmed = parts.map((p) => p.trim()).filter((p) => p.length > 0)
  return trimmed.join('\n\n')
}
