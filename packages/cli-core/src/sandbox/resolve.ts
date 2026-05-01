import {
  type ContainerEnvironment,
  type FilesystemIsolationMode,
  type SandboxConfig,
  type SandboxRequest,
  type SandboxStatus,
} from './types'

export interface SandboxRequestOverrides {
  enabled?: boolean
  namespace_restrictions?: boolean
  network_isolation?: boolean
  filesystem_mode?: FilesystemIsolationMode
  allowed_mounts?: string[]
}

export interface SandboxCapabilityProbe {
  namespaceSupported(): boolean
  containerEnvironment(): ContainerEnvironment
}

export function resolveRequest(config: SandboxConfig, overrides: SandboxRequestOverrides): SandboxRequest {
  return {
    enabled: overrides.enabled ?? config.enabled ?? true,
    namespace_restrictions: overrides.namespace_restrictions ?? config.namespace_restrictions ?? true,
    network_isolation: overrides.network_isolation ?? config.network_isolation ?? false,
    filesystem_mode: overrides.filesystem_mode ?? config.filesystem_mode ?? 'workspace-only',
    allowed_mounts: overrides.allowed_mounts ?? [...config.allowed_mounts],
  }
}

export function resolveSandboxStatusForRequest(
  request: SandboxRequest,
  cwd: string,
  probe: SandboxCapabilityProbe,
): SandboxStatus {
  const container = probe.containerEnvironment()
  const namespaceSupported = probe.namespaceSupported()
  const networkSupported = namespaceSupported
  const filesystemActive = request.enabled && request.filesystem_mode !== 'off'
  const fallbackReasons: string[] = []

  if (request.enabled && request.namespace_restrictions && !namespaceSupported) {
    fallbackReasons.push('namespace isolation unavailable (requires Linux with `unshare`)')
  }
  if (request.enabled && request.network_isolation && !networkSupported) {
    fallbackReasons.push('network isolation unavailable (requires Linux with `unshare`)')
  }
  if (request.enabled && request.filesystem_mode === 'allow-list' && request.allowed_mounts.length === 0) {
    fallbackReasons.push('filesystem allow-list requested without configured mounts')
  }

  const active =
    request.enabled &&
    (!request.namespace_restrictions || namespaceSupported) &&
    (!request.network_isolation || networkSupported)

  return {
    enabled: request.enabled,
    requested: request,
    supported: namespaceSupported,
    active,
    namespace_supported: namespaceSupported,
    namespace_active: request.enabled && request.namespace_restrictions && namespaceSupported,
    network_supported: networkSupported,
    network_active: request.enabled && request.network_isolation && networkSupported,
    filesystem_mode: request.filesystem_mode,
    filesystem_active: filesystemActive,
    allowed_mounts: normalizeMounts(request.allowed_mounts, cwd),
    in_container: container.in_container,
    container_markers: container.markers,
    fallback_reason: fallbackReasons.length > 0 ? fallbackReasons.join('; ') : undefined,
  }
}

function normalizeMounts(mounts: readonly string[], cwd: string): string[] {
  const cwdNorm = cwd.replace(/\/+$/, '')
  return mounts.map((m) => (m.startsWith('/') ? m : `${cwdNorm}/${m}`))
}
