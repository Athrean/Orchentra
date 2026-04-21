export const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code'
export const GITHUB_DEVICE_TOKEN_URL = 'https://github.com/login/oauth/access_token'

export const DEFAULT_SCOPES = ['repo', 'read:org', 'workflow'] as const

export interface DeviceCodeResponse {
  readonly deviceCode: string
  readonly userCode: string
  readonly verificationUri: string
  readonly expiresInSeconds: number
  readonly intervalSeconds: number
}

export interface DeviceFlowConfig {
  readonly clientId: string
  readonly scopes?: readonly string[]
  readonly deviceCodeUrl?: string
  readonly tokenUrl?: string
  readonly fetchImpl?: typeof fetch
  readonly sleep?: (ms: number) => Promise<void>
  readonly now?: () => number
  readonly requestTimeoutMs?: number
}

export class DeviceFlowError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'DeviceFlowError'
  }
}

export async function requestDeviceCode(config: DeviceFlowConfig): Promise<DeviceCodeResponse> {
  const fetchImpl = config.fetchImpl ?? fetch
  const scopes = (config.scopes ?? DEFAULT_SCOPES).join(' ')
  const timeoutMs = config.requestTimeoutMs ?? 30_000

  const response = await fetchWithTimeout(
    fetchImpl,
    config.deviceCodeUrl ?? GITHUB_DEVICE_CODE_URL,
    {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: config.clientId, scope: scopes }),
    },
    timeoutMs,
  )

  if (!response.ok) {
    throw new DeviceFlowError(`device code request failed: ${response.status}`, 'device_code_request_failed')
  }

  const body = (await response.json()) as {
    device_code: string
    user_code: string
    verification_uri: string
    expires_in: number
    interval: number
  }

  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: body.verification_uri,
    expiresInSeconds: body.expires_in,
    intervalSeconds: body.interval,
  }
}

export async function pollForAccessToken(deviceCode: DeviceCodeResponse, config: DeviceFlowConfig): Promise<string> {
  const fetchImpl = config.fetchImpl ?? fetch
  const sleep = config.sleep ?? defaultSleep
  const now = config.now ?? (() => Date.now())
  const url = config.tokenUrl ?? GITHUB_DEVICE_TOKEN_URL
  const timeoutMs = config.requestTimeoutMs ?? 30_000

  const deadline = now() + deviceCode.expiresInSeconds * 1000
  let intervalMs = deviceCode.intervalSeconds * 1000

  while (now() < deadline) {
    await sleep(intervalMs)

    const response = await fetchWithTimeout(
      fetchImpl,
      url,
      {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: config.clientId,
          device_code: deviceCode.deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      },
      timeoutMs,
    )

    const body = (await response.json()) as {
      access_token?: string
      error?: string
      interval?: number
    }

    if (body.access_token) {
      return body.access_token
    }

    switch (body.error) {
      case 'authorization_pending':
        continue
      case 'slow_down':
        intervalMs = (body.interval ?? deviceCode.intervalSeconds + 5) * 1000
        continue
      case 'expired_token':
      case 'access_denied':
      case 'unsupported_grant_type':
      case 'incorrect_client_credentials':
      case 'incorrect_device_code':
        throw new DeviceFlowError(body.error, body.error)
      default:
        throw new DeviceFlowError(body.error ?? 'unknown device flow error', body.error ?? 'unknown')
    }
  }

  throw new DeviceFlowError('device code expired before authorization', 'expired_token')
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (isAbortError(error)) {
      throw new DeviceFlowError(`device flow request timed out after ${timeoutMs}ms`, 'request_timeout')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
