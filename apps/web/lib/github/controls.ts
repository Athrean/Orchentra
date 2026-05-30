import { hasPermission, type PermissionLevel } from './permission-check'

/**
 * GitHub-native DevOps controls and the App permission each needs. Coverage is
 * computed from the REAL granted scopes in `user_installations.permissions`, so
 * the Traces page reports truthfully what Orchentra can and cannot access —
 * never a control rendered as if available when the permission is absent.
 */
export interface ControlCoverage {
  label: string
  permission: string
  authorized: boolean
}

const CONTROLS: Array<{ label: string; key: string; level: PermissionLevel }> = [
  { label: 'Workflow runs & re-runs', key: 'actions', level: 'write' },
  { label: 'Pull request checks', key: 'checks', level: 'read' },
  { label: 'Pull requests & required checks', key: 'pull_requests', level: 'read' },
  { label: 'Releases & repository contents', key: 'contents', level: 'read' },
  { label: 'Branch protection, runners, environments', key: 'administration', level: 'read' },
  { label: 'Repository secrets', key: 'secrets', level: 'read' },
  { label: 'Vulnerability alerts', key: 'security_events', level: 'read' },
]

export function buildControlsCoverage(permissions: Record<string, string>): ControlCoverage[] {
  return CONTROLS.map((control) => ({
    label: control.label,
    permission: `${control.key}: ${control.level}`,
    authorized: hasPermission(permissions, control.key, control.level),
  }))
}
