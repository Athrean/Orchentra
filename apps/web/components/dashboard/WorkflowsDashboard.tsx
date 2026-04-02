'use client'

import { DashboardLayout } from './DashboardLayout'
import { WorkflowsTab } from './WorkflowsTab'

export function WorkflowsDashboard({ repo }: { repo: string }): React.ReactElement {
  return (
    <DashboardLayout repo={repo} activeNav="monitoring">
      <WorkflowsTab repo={repo} />
    </DashboardLayout>
  )
}
