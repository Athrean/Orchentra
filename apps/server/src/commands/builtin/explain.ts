import { streamText } from 'ai'
import type { CommandContext, CommandHandler, SlashCommandSpec } from '../registry'
import { findIncident } from '../../queries/incidents'
import { createModel } from '../../agent/llm'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const EXPLAIN_SYSTEM_PROMPT =
  'You translate a structured incident brief into 2 to 4 short sentences of plain English. ' +
  'Tell the reader what failed, why it failed, and what to try next. Keep it concrete. No headings, no bullet points, no JSON.'

export class ExplainCommand implements CommandHandler {
  readonly spec: SlashCommandSpec = {
    name: 'explain',
    aliases: [],
    summary: 'Explain a stored incident brief in plain English',
    argumentHint: '<incidentId>',
  }

  async *execute(args: string[], ctx: CommandContext): AsyncIterable<string> {
    if (args.length === 0 || !UUID_RE.test(args[0])) {
      yield `error: expected <incidentId> as a UUID\n`
      return
    }

    const incident = await findIncident(args[0], ctx.orgId)
    if (!incident) {
      yield `error: incident ${args[0]} not found\n`
      return
    }

    if (!incident.briefJson) {
      yield `Investigation is still running for ${incident.id}. Try /status to see current progress.\n`
      return
    }

    const userPrompt = [
      `Incident in ${incident.repo} (workflow: ${incident.workflowName ?? 'unknown'})`,
      incident.failedStep ? `Failed step: ${incident.failedStep}` : null,
      `Brief:\n${incident.briefJson}`,
    ]
      .filter(Boolean)
      .join('\n\n')

    const result = streamText({
      model: createModel(),
      system: EXPLAIN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    for await (const chunk of result.textStream) {
      yield chunk
    }
    yield '\n'
  }
}
