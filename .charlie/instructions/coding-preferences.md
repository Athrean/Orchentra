# Coding Preferences

How to approach implementation tasks in Orchentra.

## Scope

- All code in the workspace.

## Rules

- [R1] Readability over cleverness. Explicitness over implicitness.
- [R2] Follow existing patterns before introducing new ones.
- [R3] Every addition must justify its existence. No speculative code.
- [R4] Surgical changes: only touch what the task requires. No adjacent cleanup unless asked.
- [R5] Validate at system boundaries only (user input, external APIs). Trust internal contracts.
- [R6] No error handling for impossible scenarios.
- [R7] No unnecessary abstractions. Three similar lines are better than a premature one.
- [R8] No feature flags, configuration options, or plugin hooks unless the task explicitly asks for them.
- [R9] If you write 200 lines and it could be 50, rewrite it.
- [R10] When changes make code unused (imports, variables, functions), remove the orphans. Do not remove pre-existing dead code unless asked.

## Examples

### Good — trust internal contracts

```ts
// Internal caller — ConfigLoader guarantees non-null after load()
const config = loader.load()
return config.featureConfig.model
```

### Bad — over-validate internal calls

```ts
const config = loader.load()
if (!config || !config.featureConfig || !config.featureConfig.model) {
  throw new Error('Missing config') // unnecessary — loader handles this
}
```
