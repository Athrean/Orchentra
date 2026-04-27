import { tool, type CoreTool } from 'ai'
import type { z } from 'zod'

export type Permission = 'read' | 'write' | 'admin'

export interface ToolDefinition {
  name: string
  permission: Permission
  description: string
  parameters: z.ZodSchema
  execute: (args: unknown) => Promise<unknown>
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()

  register(def: ToolDefinition): void {
    if (this.tools.has(def.name)) {
      throw new Error(`Tool already registered: ${def.name}`)
    }
    this.tools.set(def.name, def)
  }

  getTools(_allowed: Set<Permission>): Record<string, CoreTool> {
    const out: Record<string, CoreTool> = {}
    for (const [name, def] of this.tools) {
      out[name] = tool({
        description: def.description,
        parameters: def.parameters,
        execute: def.execute,
      })
    }
    return out
  }
}
