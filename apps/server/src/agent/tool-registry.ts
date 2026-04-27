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

export interface ToolPostContext {
  name: string
  args: unknown
  result?: unknown
  error?: unknown
  durationMs: number
}

export interface ToolHooks {
  pre?: (ctx: { name: string; args: unknown }) => Promise<void> | void
  post?: (ctx: ToolPostContext) => Promise<void> | void
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()
  private hooks: ToolHooks = {}

  register(def: ToolDefinition): void {
    if (this.tools.has(def.name)) {
      throw new Error(`Tool already registered: ${def.name}`)
    }
    this.tools.set(def.name, def)
  }

  setHooks(hooks: ToolHooks): void {
    this.hooks = hooks
  }

  /** List registered tool definitions filtered by permission. Stable insertion order. */
  listDefinitions(allowed: Set<Permission>): ToolDefinition[] {
    const out: ToolDefinition[] = []
    for (const def of this.tools.values()) {
      if (allowed.has(def.permission)) out.push(def)
    }
    return out
  }

  getTools(allowed: Set<Permission>): Record<string, CoreTool> {
    const out: Record<string, CoreTool> = {}
    for (const [name, def] of this.tools) {
      if (!allowed.has(def.permission)) continue
      out[name] = tool({
        description: def.description,
        parameters: def.parameters,
        execute: async (args: unknown) => {
          const start = Date.now()
          if (this.hooks.pre) await this.hooks.pre({ name, args })
          try {
            const result = await def.execute(args)
            if (this.hooks.post) await this.hooks.post({ name, args, result, durationMs: Date.now() - start })
            return result
          } catch (err) {
            if (this.hooks.post) await this.hooks.post({ name, args, error: err, durationMs: Date.now() - start })
            const message = err instanceof Error ? err.message : String(err)
            return { isError: true as const, error: message }
          }
        },
      })
    }
    return out
  }
}
