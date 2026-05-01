import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildLinuxSandboxCommand, linuxCapabilityProbe } from './linux'
import { buildMacosSandboxCommand, macosCapabilityProbe } from './macos'
import { resolveRequest, resolveSandboxStatusForRequest } from './resolve'
import type { SandboxRequestOverrides } from './resolve'
import type { SandboxCommand, SandboxConfig, SandboxStatus } from './types'

export type {
  FilesystemIsolationMode,
  SandboxConfig,
  SandboxRequest,
  SandboxStatus,
  SandboxCommand,
  ContainerEnvironment,
  SandboxDetectionInputs,
} from './types'
export { defaultSandboxConfig, defaultSandboxRequest, defaultSandboxStatus, filesystemModeAsString } from './types'
export { resolveRequest, resolveSandboxStatusForRequest } from './resolve'
export type { SandboxCapabilityProbe, SandboxRequestOverrides } from './resolve'
export { detectContainerEnvironment, detectContainerEnvironmentFrom } from './container'
export { buildMacosSandboxCommand, macosCapabilityProbe } from './macos'
export { buildMacosSandboxProfile } from './macos-profile'
export { buildLinuxSandboxCommand, linuxCapabilityProbe, resetLinuxCapabilityCache } from './linux'

export interface WrapBashCommandInput {
  config: SandboxConfig
  overrides: SandboxRequestOverrides
}

export interface WrapBashCommandResult {
  command: SandboxCommand | null
  status: SandboxStatus
}

export function wrapBashCommand(
  command: string,
  cwd: string,
  input: WrapBashCommandInput,
): WrapBashCommandResult | null {
  const request = resolveRequest(input.config, input.overrides)
  if (!request.enabled) return null

  const probe = process.platform === 'linux' ? linuxCapabilityProbe() : macosCapabilityProbe()
  const status = resolveSandboxStatusForRequest(request, cwd, probe)

  let cmd: SandboxCommand | null = null
  if (process.platform === 'darwin') {
    cmd = buildMacosSandboxCommand(command, cwd, status)
  } else if (process.platform === 'linux') {
    cmd = buildLinuxSandboxCommand(command, cwd, status)
  }
  return { command: cmd, status }
}

export function prepareSandboxDirs(cwd: string): void {
  const cwdNorm = cwd.replace(/\/+$/, '')
  mkdirSync(join(cwdNorm, '.sandbox-home'), { recursive: true })
  mkdirSync(join(cwdNorm, '.sandbox-tmp'), { recursive: true })
}
