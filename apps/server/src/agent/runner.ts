import { generateObject } from 'ai'
import { eq } from 'drizzle-orm'
import { BriefSchema } from '@orchentra/core'
import { db, incidents } from '../db/client'
import { createModel } from './llm'
import { CLASSIFY_PROMPT } from './prompts'
import { updateSlackWithBrief } from '../slack/message'

type IncidentRow = typeof incidents.$inferSelect

export async function runIncidentAgent(incident: IncidentRow): Promise<void> {
  try {
    const { object: brief } = await generateObject({
      model: createModel(),
      schema: BriefSchema,
      system: CLASSIFY_PROMPT,
      prompt: [
        `Repo: ${incident.repo}`,
        `Workflow: ${incident.workflowName}`,
        `Branch: ${incident.branch}`,
        `Commit: ${incident.commit}`,
        `Failed step: ${incident.failedStep ?? 'unknown'}`,
        '',
        'Classify this CI failure and suggest a fix.',
      ].join('\n'),
    })

    await db
      .update(incidents)
      .set({
        briefJson: JSON.stringify(brief),
        rootCause: brief.rootCause,
        suggestedFix: brief.suggestedFix,
        confidence: brief.confidence,
        status: 'brief_ready',
      })
      .where(eq(incidents.id, incident.id))

    await updateSlackWithBrief(incident.id, brief)

    console.log(`Incident ${incident.id}: ${brief.failureType} (${Math.round(brief.confidence * 100)}%)`)
  } catch (error) {
    console.error(`Agent failed for ${incident.id}:`, error)

    await db
      .update(incidents)
      .set({ status: 'error', rootCause: 'Agent classification failed — check server logs' })
      .where(eq(incidents.id, incident.id))
  }
}
