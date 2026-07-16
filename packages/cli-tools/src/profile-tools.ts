import type { ModelProfile } from '@orchentra/cli-core'
import type { DefaultToolRegistry } from './tool-registry'
import { fileEditTool } from './tools/file-edit-tool'
import { filePatchTool } from './tools/file-patch-tool'

/**
 * Apply a ModelProfile's tool specializations to the registry (M5).
 * Idempotent and reversible: called again with a generic profile (or after a
 * mid-session model switch) it restores the default edit dialect and pristine
 * descriptions, so the registry always reflects exactly the active profile.
 */
export function applyModelProfile(registry: DefaultToolRegistry, profile: ModelProfile): void {
  if (profile.editDialect === 'unified-diff') {
    registry.unregister(fileEditTool.name)
    registry.register(filePatchTool)
  } else {
    registry.unregister(filePatchTool.name)
    if (!registry.has(fileEditTool.name)) registry.register(fileEditTool)
  }
  registry.overrideDescriptions(profile.toolDescriptions ?? {})
}
