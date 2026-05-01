export type FilesystemIsolationMode = 'off' | 'workspace-only' | 'allow-list'

export function filesystemModeAsString(mode: FilesystemIsolationMode): string {
  return mode
}

export interface SandboxConfig {
  enabled?: boolean
  namespace_restrictions?: boolean
  network_isolation?: boolean
  filesystem_mode?: FilesystemIsolationMode
  allowed_mounts: string[]
}

export interface SandboxRequest {
  enabled: boolean
  namespace_restrictions: boolean
  network_isolation: boolean
  filesystem_mode: FilesystemIsolationMode
  allowed_mounts: string[]
}

export interface ContainerEnvironment {
  in_container: boolean
  markers: string[]
}

export interface SandboxStatus {
  enabled: boolean
  requested: SandboxRequest
  supported: boolean
  active: boolean
  namespace_supported: boolean
  namespace_active: boolean
  network_supported: boolean
  network_active: boolean
  filesystem_mode: FilesystemIsolationMode
  filesystem_active: boolean
  allowed_mounts: string[]
  in_container: boolean
  container_markers: string[]
  fallback_reason?: string
}

export interface SandboxDetectionInputs {
  env_pairs: Array<readonly [string, string]>
  dockerenv_exists: boolean
  containerenv_exists: boolean
  proc_1_cgroup?: string
}

export interface SandboxCommand {
  program: string
  args: string[]
  env: Array<readonly [string, string]>
}

export function defaultSandboxConfig(): SandboxConfig {
  return { allowed_mounts: [] }
}

export function defaultSandboxRequest(): SandboxRequest {
  return {
    enabled: false,
    namespace_restrictions: false,
    network_isolation: false,
    filesystem_mode: 'workspace-only',
    allowed_mounts: [],
  }
}

export function defaultSandboxStatus(): SandboxStatus {
  return {
    enabled: false,
    requested: defaultSandboxRequest(),
    supported: false,
    active: false,
    namespace_supported: false,
    namespace_active: false,
    network_supported: false,
    network_active: false,
    filesystem_mode: 'workspace-only',
    filesystem_active: false,
    allowed_mounts: [],
    in_container: false,
    container_markers: [],
    fallback_reason: undefined,
  }
}
