# TypeScript Standards

Rules for all TypeScript code in `apps/`, `packages/`, and `libs/`.

## Scope

- `apps/**`
- `packages/**`
- `libs/**`

## Rules

- [R1] Always use camelCase for variables, functions, and properties.
- [R2] Always use PascalCase for types, interfaces, classes, and components.
- [R3] Never use `any`. Use `unknown` with narrowing or concrete types.
- [R4] Never use `@ts-ignore`. Fix the type error properly.
- [R5] Every function must have an explicit return type.
- [R6] Use `satisfies` for object conformance. Prefer `interface` over `type` for object shapes.
- [R7] Only use generics when they add real type safety.
- [R8] Keep files under ~150 lines. Split by concern when exceeding.
- [R9] No dumping-ground files like `utils.ts` or `helpers.ts`.
- [R10] Never include AI-related mentions in commits or PRs.

## Examples

### Good

```ts
interface ToolResult {
  output: string
  exitCode: number
}

function executeTool(command: string): ToolResult {
  return { output: 'done', exitCode: 0 }
}
```

### Bad

```ts
type toolResult = any // @ts-ignore - no any, no @ts-ignore, PascalCase for types
function executeTool(command) {
  return { output: 'done', exitCode: 0 }
} // no return type
```
