import { describe, expect, test } from 'bun:test'
import { detectContainerEnvironmentFrom } from '../src/sandbox/container'

describe('detectContainerEnvironmentFrom', () => {
  test('no markers anywhere → in_container false, empty markers', () => {
    const env = detectContainerEnvironmentFrom({
      env_pairs: [],
      dockerenv_exists: false,
      containerenv_exists: false,
    })
    expect(env.in_container).toBe(false)
    expect(env.markers).toEqual([])
  })

  test('/.dockerenv present → marker added, in_container true', () => {
    const env = detectContainerEnvironmentFrom({
      env_pairs: [],
      dockerenv_exists: true,
      containerenv_exists: false,
    })
    expect(env.in_container).toBe(true)
    expect(env.markers).toContain('/.dockerenv')
  })

  test('/run/.containerenv present → marker added', () => {
    const env = detectContainerEnvironmentFrom({
      env_pairs: [],
      dockerenv_exists: false,
      containerenv_exists: true,
    })
    expect(env.markers).toContain('/run/.containerenv')
  })

  test('container env var matched (case-insensitive)', () => {
    const env = detectContainerEnvironmentFrom({
      env_pairs: [['CONTAINER', 'docker']],
      dockerenv_exists: false,
      containerenv_exists: false,
    })
    expect(env.markers).toContain('env:CONTAINER=docker')
    expect(env.in_container).toBe(true)
  })

  test('docker / podman / kubernetes_service_host env vars all detected', () => {
    const env = detectContainerEnvironmentFrom({
      env_pairs: [
        ['DOCKER', '1'],
        ['podman', 'yes'],
        ['KUBERNETES_SERVICE_HOST', '10.0.0.1'],
      ],
      dockerenv_exists: false,
      containerenv_exists: false,
    })
    expect(env.markers.some((m) => m.startsWith('env:DOCKER='))).toBe(true)
    expect(env.markers.some((m) => m.startsWith('env:podman='))).toBe(true)
    expect(env.markers.some((m) => m.startsWith('env:KUBERNETES_SERVICE_HOST='))).toBe(true)
  })

  test('empty env var values are ignored', () => {
    const env = detectContainerEnvironmentFrom({
      env_pairs: [['CONTAINER', '']],
      dockerenv_exists: false,
      containerenv_exists: false,
    })
    expect(env.markers).toEqual([])
    expect(env.in_container).toBe(false)
  })

  test('unrelated env vars are ignored', () => {
    const env = detectContainerEnvironmentFrom({
      env_pairs: [
        ['HOME', '/root'],
        ['PATH', '/usr/bin'],
      ],
      dockerenv_exists: false,
      containerenv_exists: false,
    })
    expect(env.markers).toEqual([])
  })

  test('cgroup needles all matched', () => {
    const env = detectContainerEnvironmentFrom({
      env_pairs: [],
      dockerenv_exists: false,
      containerenv_exists: false,
      proc_1_cgroup: '12:memory:/docker/abc\n13:cpu:/kubepods/pod-id\n14:io:/podman/foo',
    })
    expect(env.markers).toContain('/proc/1/cgroup:docker')
    expect(env.markers).toContain('/proc/1/cgroup:kubepods')
    expect(env.markers).toContain('/proc/1/cgroup:podman')
  })

  test('multi-source detection: dockerenv + env + cgroup all reported', () => {
    const env = detectContainerEnvironmentFrom({
      env_pairs: [['container', 'docker']],
      dockerenv_exists: true,
      containerenv_exists: false,
      proc_1_cgroup: '12:memory:/docker/abc',
    })
    expect(env.in_container).toBe(true)
    expect(env.markers).toContain('/.dockerenv')
    expect(env.markers).toContain('env:container=docker')
    expect(env.markers).toContain('/proc/1/cgroup:docker')
  })

  test('markers are sorted and deduped', () => {
    const env = detectContainerEnvironmentFrom({
      env_pairs: [],
      dockerenv_exists: true,
      containerenv_exists: true,
      proc_1_cgroup: 'docker docker docker',
    })
    const sorted = [...env.markers].sort()
    expect(env.markers).toEqual(sorted)
    const unique = [...new Set(env.markers)]
    expect(env.markers.length).toBe(unique.length)
  })
})
