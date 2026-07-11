import { createBuiltinRegistry, type CommandContext } from './commands/builtin'

export type { CommandContext }

const registry = createBuiltinRegistry()

export { registry, createBuiltinRegistry }
