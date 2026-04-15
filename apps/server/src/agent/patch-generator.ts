import { generateObject, type CoreMessage } from 'ai'
import { PatchSetSchema, type IncidentBrief } from '@orchentra/core'
import { createModel } from './llm'

const PATCH_SYSTEM_PROMPT = `You are a code repair agent. Given a CI failure diagnosis and the current
state of the relevant files, produce minimal, surgical file changes that fix the root cause.

Rules:
- Output only the files that need to change
- Each patch has: path (relative repo path), action (modify|create|delete), content (full file content for modify/create)
- For modify: provide the COMPLETE new file content, not a diff
- For delete: omit content
- Maximum 10 file changes
- Do not change files unrelated to the failure`

const ACTIONABLE_FAILURE_TYPES = new Set(['code_bug', 'env_missing', 'dependency_conflict'])
const MIN_CONFIDENCE = 0.7

interface PatchUsage {
  promptTokens?: number
  completionTokens?: number
}

interface PatchGenerationResult {
  generated: boolean
  patchJson: string | null
  usage: PatchUsage | null
}

export async function generatePatches(
  brief: IncidentBrief,
  investigationMessages: CoreMessage[],
): Promise<PatchGenerationResult> {
  if (!ACTIONABLE_FAILURE_TYPES.has(brief.failureType) || brief.confidence < MIN_CONFIDENCE) {
    return { generated: false, patchJson: null, usage: null }
  }

  try {
    const { object, usage } = await generateObject({
      model: createModel(),
      schema: PatchSetSchema,
      system: PATCH_SYSTEM_PROMPT,
      messages: investigationMessages,
    })

    if (object.patches.length === 0) {
      return { generated: false, patchJson: null, usage: null }
    }

    return { generated: true, patchJson: JSON.stringify(object), usage: usage ?? null }
  } catch (err) {
    console.error('Patch generation failed:', err)
    return { generated: false, patchJson: null, usage: null }
  }
}
