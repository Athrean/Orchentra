import { generateObject } from 'ai'
import { eq } from 'drizzle-orm'
import { BriefSchema } from '@orchentra/core'
import { db, incidents, toolCalls } from '../db/client'
import { createModel } from './llm'
import { CLASSIFY_PROMPT } from './prompts'
import { updateSlackWithBrief } from '../slack/message'
import { fetchFailedJobLogs } from './tools/github-actions'
import type { WorkflowLogResult } from './tools/github-actions'

type IncidentRow = typeof incidents.$inferSelect

export async function runIncidentAgent(incident: IncidentRow): Promise<void> {
  try {
    // Step 1: Fetch actual CI logs
    const [owner, repo] = incident.repo.split('/')
    let logContext = ''
    let failedStep = incident.failedStep

    if (owner && repo && incident.workflowRunId) {
      const start = Date.now()
      const result = await fetchFailedJobLogs(owner, repo, incident.workflowRunId)
      const durationMs = Date.now() - start

      // Record tool call for audit trail
      await db.insert(toolCalls).values({
        id: crypto.randomUUID(),
        incidentId: incident.id,
        integration: 'github_actions',
        round: 1,
        durationMs,
        resultJson: JSON.stringify(
          'error' in result
            ? { error: result.error }
            : { jobName: result.jobName, failedStep: result.failedStep, logLines: result.logs.split('\n').length },
        ),
      })

      if (!('error' in result)) {
        const logs = result as WorkflowLogResult
        logContext = logs.logs
        failedStep = failedStep ?? logs.failedStep

        // Update failedStep in DB if we discovered it from logs
        if (logs.failedStep && !incident.failedStep) {
          await db.update(incidents).set({ failedStep: logs.failedStep }).where(eq(incidents.id, incident.id))
        }
      } else {
        console.warn(`Log fetch failed for ${incident.id}: ${result.error}`)
      }
    }

    // Step 2: Classify with LLM — now with actual log data
    const promptParts = [
      `Repo: ${incident.repo}`,
      `Workflow: ${incident.workflowName}`,
      `Branch: ${incident.branch}`,
      `Commit: ${incident.commit}`,
      `Failed step: ${failedStep ?? 'unknown'}`,
    ]

    if (logContext) {
      promptParts.push('', '--- CI Logs (last 300 lines) ---', logContext, '--- End Logs ---')
    } else {
      promptParts.push(
        '',
        'Note: CI logs were not available. Classify based on metadata only. Set confidence below 0.4.',
      )
    }

    promptParts.push('', 'Classify this CI failure and suggest a fix.')

    const { object: brief } = await generateObject({
      model: createModel(),
      schema: BriefSchema,
      system: CLASSIFY_PROMPT,
      prompt: promptParts.join('\n'),
    })

    // Step 3: Persist results
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
