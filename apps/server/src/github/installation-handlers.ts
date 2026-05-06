import { z } from 'zod'
import { recordInstallation, suspendInstallation } from './installations'

const AccountSchema = z.object({
  login: z.string(),
  id: z.number(),
  type: z.enum(['User', 'Organization']),
})

export const InstallationPayloadSchema = z.object({
  action: z.enum(['created', 'deleted', 'suspend', 'unsuspend', 'new_permissions_accepted']),
  installation: z.object({
    id: z.number(),
    account: AccountSchema,
    repository_selection: z.enum(['all', 'selected']),
    permissions: z.record(z.string(), z.string()).default({}),
    events: z.array(z.string()).default([]),
  }),
})

export const InstallationRepositoriesPayloadSchema = z.object({
  action: z.enum(['added', 'removed']),
  installation: z.object({
    id: z.number(),
    account: AccountSchema,
    repository_selection: z.enum(['all', 'selected']),
    permissions: z.record(z.string(), z.string()).default({}),
    events: z.array(z.string()).default([]),
  }),
})

export type InstallationPayload = z.infer<typeof InstallationPayloadSchema>
export type InstallationRepositoriesPayload = z.infer<typeof InstallationRepositoriesPayloadSchema>

/**
 * Resolve which Orchentra org owns this GH installation. Slice 3 ships a
 * dev-loop fallback (single org). Slice 6 (auth/trust) replaces this with a
 * proper mapping table populated during the install OAuth flow.
 */
export function resolveOrgIdForInstallation(_installationId: number): string {
  return process.env.ORCHENTRA_DEFAULT_ORG_ID ?? 'Athrean'
}

export async function handleInstallationEvent(payload: InstallationPayload): Promise<void> {
  const { action, installation } = payload
  if (action === 'deleted' || action === 'suspend') {
    await suspendInstallation(installation.id)
    return
  }
  await recordInstallation({
    installationId: installation.id,
    orgId: resolveOrgIdForInstallation(installation.id),
    account: installation.account,
    repositorySelection: installation.repository_selection,
    permissions: installation.permissions,
    events: installation.events,
    suspendedAt: null,
  })
}

export async function handleInstallationRepositoriesEvent(payload: InstallationRepositoriesPayload): Promise<void> {
  const { installation } = payload
  await recordInstallation({
    installationId: installation.id,
    orgId: resolveOrgIdForInstallation(installation.id),
    account: installation.account,
    repositorySelection: installation.repository_selection,
    permissions: installation.permissions,
    events: installation.events,
  })
}
