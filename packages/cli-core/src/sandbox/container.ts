import { existsSync, readFileSync } from 'node:fs'
import type { ContainerEnvironment, SandboxDetectionInputs } from './types'

const ENV_NEEDLES = new Set(['container', 'docker', 'podman', 'kubernetes_service_host'])
const CGROUP_NEEDLES = ['docker', 'containerd', 'kubepods', 'podman', 'libpod'] as const

export function detectContainerEnvironment(): ContainerEnvironment {
  let cgroup: string | undefined
  try {
    cgroup = readFileSync('/proc/1/cgroup', 'utf8')
  } catch {
    cgroup = undefined
  }
  return detectContainerEnvironmentFrom({
    env_pairs: Object.entries(process.env).filter(([, v]) => v !== undefined) as Array<readonly [string, string]>,
    dockerenv_exists: existsSync('/.dockerenv'),
    containerenv_exists: existsSync('/run/.containerenv'),
    proc_1_cgroup: cgroup,
  })
}

export function detectContainerEnvironmentFrom(inputs: SandboxDetectionInputs): ContainerEnvironment {
  const markers: string[] = []
  if (inputs.dockerenv_exists) markers.push('/.dockerenv')
  if (inputs.containerenv_exists) markers.push('/run/.containerenv')

  for (const [key, value] of inputs.env_pairs) {
    if (value.length === 0) continue
    if (ENV_NEEDLES.has(key.toLowerCase())) {
      markers.push(`env:${key}=${value}`)
    }
  }

  if (inputs.proc_1_cgroup !== undefined) {
    for (const needle of CGROUP_NEEDLES) {
      if (inputs.proc_1_cgroup.includes(needle)) {
        markers.push(`/proc/1/cgroup:${needle}`)
      }
    }
  }

  markers.sort()
  const unique: string[] = []
  for (const m of markers) {
    if (unique[unique.length - 1] !== m) unique.push(m)
  }

  return { in_container: unique.length > 0, markers: unique }
}
