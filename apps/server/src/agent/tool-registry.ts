import { tool, type CoreTool } from 'ai'
import type { z } from 'zod'
import { dispatch, type Operation, type OperationContext, type OperationScope } from '@orchentra/operations'

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

  /**
   * Adapt an Operation from `@orchentra/operations` to the legacy ToolDefinition
   * shape so the in-process agent loop keeps working unchanged. Every call funnels
   * through the shared `dispatch` so behavior is identical to other transports
   * (CLI, MCP, future HTTP) — this is the only place the conversion happens.
   */
  registerOperation<TParams, TResult>(op: Operation<TParams, TResult>): void {
    const ctx: OperationContext = {
      remote: false,
      allowedScopes: new Set<OperationScope>(['read', 'write', 'admin']),
    }
    this.register({
      name: op.id,
      permission: op.scope,
      description: op.description,
      parameters: op.parameters as z.ZodSchema,
      execute: async (args: unknown) => dispatch(op, ctx, args),
    })
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
