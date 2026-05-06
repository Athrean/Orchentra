/**
 * Server-side `ApprovalPort` implementation. Bridges the portable mcp-server
 * package to the apps/server approval store. The mcp-server package never
 * imports from apps/server — this file is what makes that boundary work.
 */

import type { ApprovalPort, ApprovalRequestInput } from '@orchentra/mcp-server'
import { createApprovalRequest } from './store'

export const serverApprovalPort: ApprovalPort = {
  async requestApproval(input: ApprovalRequestInput) {
    const row = await createApprovalRequest({
      orgId: input.orgId,
      operationId: input.operationId,
      trustClass: input.trustClass,
      input: input.input,
      requestedBy: input.requestedBy,
    })
    return { approvalId: row.id, expiresAt: row.expiresAt.toISOString() }
  },
}
