import { z } from 'zod'
import { exportSkillMd, runbookToSkill } from '@orchentra/brain'
import type { Operation } from '../../types'
import { OperationError } from '../../types'
import { getBrainAdapter, type RunbookRow } from './adapter'

const parameters = z
  .object({
    runbookId: z.string().min(1).optional().describe('Single runbook to export by id.'),
    orgId: z.string().min(1).optional().describe('When set without runbookId, export every runbook the org owns.'),
  })
  .refine((v) => Boolean(v.runbookId) || Boolean(v.orgId), {
    message: 'export_skills_md requires either runbookId or orgId',
  })

type Params = z.infer<typeof parameters>

interface SkillExport {
  name: string
  markdown: string
}

interface Result {
  skills: SkillExport[]
}

function rowToExport(row: RunbookRow): SkillExport {
  // RunbookRow is the operations-package mirror of @orchentra/brain's Runbook;
  // their fields line up 1:1 so the exporter accepts the row directly.
  return { name: row.name, markdown: exportSkillMd(runbookToSkill(row)) }
}

export const exportSkillsMdOperation: Operation<Params, Result> = {
  id: 'export_skills_md',
  description:
    'Export one or more runbooks as SKILL.md documents. Pass runbookId for a single runbook, or orgId to export every ' +
    'runbook the org owns. Read-scoped; safe for remote callers.',
  scope: 'read',
  mutating: false,
  localOnly: false,
  parameters,
  cliHints: { name: 'export_skills_md' },
  handler: async (_ctx, params) => {
    const adapter = getBrainAdapter()
    if (params.runbookId) {
      const row = await adapter.getRunbook(params.runbookId)
      if (!row) {
        throw new OperationError({ code: 'not_found', message: `runbook ${params.runbookId} not found` })
      }
      return { skills: [rowToExport(row)] }
    }
    const rows = await adapter.listRunbooks({ orgId: params.orgId })
    return { skills: rows.map(rowToExport) }
  },
}
