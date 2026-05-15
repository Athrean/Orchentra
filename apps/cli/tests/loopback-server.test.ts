import { describe, expect, test } from 'bun:test'
import { startLoopback } from '../src/auth/loopback-server'

const TIMEOUT_MS = 30_000

describe('startLoopback', () => {
  test('captures GET /install-cb query params and resolves the waiter', async () => {
    const server = await startLoopback({ timeoutMs: TIMEOUT_MS })
    const url = `http://127.0.0.1:${server.port}/install-cb?orgId=Athrean&installationId=12345&apiKey=plaintext-1`
    const fetchPromise = fetch(url)
    const payload = await server.waitForCallback()
    const res = await fetchPromise

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') ?? '').toContain('text/html')
    expect(payload.orgId).toBe('Athrean')
    expect(payload.installationId).toBe(12345)
    expect(payload.apiKey).toBe('plaintext-1')
    server.stop()
  })

  test('captures ?error= without orgId/apiKey and exposes it on the payload', async () => {
    const server = await startLoopback({ timeoutMs: TIMEOUT_MS })
    const fetchPromise = fetch(`http://127.0.0.1:${server.port}/install-cb?error=invalid_state`)
    const payload = await server.waitForCallback()
    await fetchPromise
    expect(payload.error).toBe('invalid_state')
    expect(payload.orgId).toBeUndefined()
    expect(payload.apiKey).toBeUndefined()
    server.stop()
  })

  test('returns 404 for paths other than /install-cb and keeps waiting', async () => {
    const server = await startLoopback({ timeoutMs: TIMEOUT_MS })
    const noise = await fetch(`http://127.0.0.1:${server.port}/other`)
    expect(noise.status).toBe(404)

    const success = fetch(`http://127.0.0.1:${server.port}/install-cb?orgId=o&installationId=1&apiKey=k`)
    const payload = await server.waitForCallback()
    await success
    expect(payload.orgId).toBe('o')
    server.stop()
  })

  test('binds on a random port in 49152-65535', async () => {
    const server = await startLoopback({ timeoutMs: TIMEOUT_MS })
    expect(server.port).toBeGreaterThanOrEqual(49152)
    expect(server.port).toBeLessThanOrEqual(65535)
    server.stop()
  })

  test('rejects waitForCallback once stop() is called', async () => {
    const server = await startLoopback({ timeoutMs: TIMEOUT_MS })
    const promise = server.waitForCallback()
    server.stop()
    await expect(promise).rejects.toThrow(/stopped|aborted/i)
  })

  test('honors timeoutMs and rejects waitForCallback with a timeout error', async () => {
    const server = await startLoopback({ timeoutMs: 100 })
    await expect(server.waitForCallback()).rejects.toThrow(/timeout/i)
    server.stop()
  })
})
