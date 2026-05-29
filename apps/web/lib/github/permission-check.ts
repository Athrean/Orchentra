/**
 * Runtime check of GitHub App permissions, read from the per-installation
 * snapshot stored in `user_installations.permissions` at install time. Lets a
 * GitHub-backed feature decide HONESTLY whether to fetch (and risk a 403) or
 * render a "connect to enable" card up front. GitHub permission values are
 * 'read' | 'write' | 'admin'; absence means not granted.
 */
export type PermissionLevel = 'read' | 'write' | 'admin'

const RANK: Record<string, number> = { read: 1, write: 2, admin: 3 }

export function hasPermission(
  permissions: Record<string, string>,
  key: string,
  level: PermissionLevel = 'read',
): boolean {
  const granted = permissions[key]
  if (!granted) return false
  return (RANK[granted] ?? 0) >= RANK[level]
}

export interface RequiredPermission {
  key: string
  level: PermissionLevel
}

/** Permissions in `required` that the installation does not satisfy. */
export function permissionGap(
  permissions: Record<string, string>,
  required: RequiredPermission[],
): RequiredPermission[] {
  return required.filter((r) => !hasPermission(permissions, r.key, r.level))
}

/**
 * Merge permission snapshots across a user's installations to the most
 * permissive level per key — used for page-level "is this feature reachable at
 * all" gating. Per-repo reads still try/catch, since a single installation may
 * be less permissive than the merged view.
 */
export function mergePermissions(snapshots: Array<Record<string, string>>): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const snapshot of snapshots) {
    for (const [key, value] of Object.entries(snapshot)) {
      if ((RANK[value] ?? 0) > (RANK[merged[key]] ?? 0)) merged[key] = value
    }
  }
  return merged
}
