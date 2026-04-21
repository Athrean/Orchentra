import { describe, expect, test } from 'bun:test'
import {
  pollForAccessToken,
  requestDeviceCode,
  DeviceFlowError,
  type DeviceCodeResponse,
} from '../src/github/device-flow'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function hangingFetch(): typeof fetch {
  return (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      const rejectAbort = (): void => {
        const error = new Error('request aborted')
        error.name = 'AbortError'
        reject(error)
      }
      if (!signal) return
      if (signal.aborted) {
        rejectAbort()
        return
      }
      signal.addEventListener('abort', rejectAbort, { once: true })
    })
  }) as typeof fetch
}

describe('requestDeviceCode', () => {
  test('maps GitHub response to camelCase', async () => {
    const fetchImpl = async (): Promise<Response> =>
      jsonResponse({
        device_code: 'dev-123',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5,
      })

    const result = await requestDeviceCode({
      clientId: 'client',
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(result.deviceCode).toBe('dev-123')
    expect(result.userCode).toBe('ABCD-EFGH')
    expect(result.expiresInSeconds).toBe(900)
    expect(result.intervalSeconds).toBe(5)
  })

  test('throws on non-ok status', async () => {
    const fetchImpl = async (): Promise<Response> => new Response('nope', { status: 500 })
    await expect(requestDeviceCode({ clientId: 'client', fetchImpl: fetchImpl as typeof fetch })).rejects.toThrow(
      DeviceFlowError,
    )
  })

  test('times out hung requests', async () => {
    await expect(
      requestDeviceCode({
        clientId: 'client',
        fetchImpl: hangingFetch(),
        requestTimeoutMs: 5,
      }),
    ).rejects.toMatchObject({ code: 'request_timeout' })
  })
})

describe('pollForAccessToken', () => {
  const baseDeviceCode: DeviceCodeResponse = {
    deviceCode: 'dev',
    userCode: 'UU',
    verificationUri: 'https://example',
    expiresInSeconds: 900,
    intervalSeconds: 1,
  }

  test('returns access token on success', async () => {
    let calls = 0
    const fetchImpl = async (): Promise<Response> => {
      calls++
      if (calls === 1) return jsonResponse({ error: 'authorization_pending' })
      return jsonResponse({ access_token: 'gho_abc' })
    }

    const token = await pollForAccessToken(baseDeviceCode, {
      clientId: 'client',
      fetchImpl: fetchImpl as typeof fetch,
      sleep: async (): Promise<void> => {},
    })

    expect(token).toBe('gho_abc')
    expect(calls).toBe(2)
  })

  test('honors slow_down by increasing interval', async () => {
    const sleeps: number[] = []
    let calls = 0
    const fetchImpl = async (): Promise<Response> => {
      calls++
      if (calls === 1) return jsonResponse({ error: 'slow_down', interval: 10 })
      return jsonResponse({ access_token: 'tok' })
    }

    await pollForAccessToken(baseDeviceCode, {
      clientId: 'client',
      fetchImpl: fetchImpl as typeof fetch,
      sleep: async (ms: number): Promise<void> => {
        sleeps.push(ms)
      },
    })

    expect(sleeps[0]).toBe(1000)
    expect(sleeps[1]).toBe(10000)
  })

  test('throws DeviceFlowError on access_denied', async () => {
    const fetchImpl = async (): Promise<Response> => jsonResponse({ error: 'access_denied' })
    await expect(
      pollForAccessToken(baseDeviceCode, {
        clientId: 'client',
        fetchImpl: fetchImpl as typeof fetch,
        sleep: async (): Promise<void> => {},
      }),
    ).rejects.toMatchObject({ code: 'access_denied' })
  })

  test('throws on deadline exceeded', async () => {
    let now = 0
    await expect(
      pollForAccessToken(
        { ...baseDeviceCode, expiresInSeconds: 1 },
        {
          clientId: 'client',
          fetchImpl: (async (): Promise<Response> => jsonResponse({ error: 'authorization_pending' })) as typeof fetch,
          sleep: async (): Promise<void> => {
            now += 2000
          },
          now: () => now,
        },
      ),
    ).rejects.toMatchObject({ code: 'expired_token' })
  })

  test('times out hung token polling requests', async () => {
    await expect(
      pollForAccessToken(baseDeviceCode, {
        clientId: 'client',
        fetchImpl: hangingFetch(),
        sleep: async (): Promise<void> => {},
        requestTimeoutMs: 5,
      }),
    ).rejects.toMatchObject({ code: 'request_timeout' })
  })
})
