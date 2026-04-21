import { DEFAULT_SCOPES, pollForAccessToken, requestDeviceCode, type DeviceFlowConfig } from './device-flow'
import { resolveToken, writeTokenFile, MissingGitHubTokenError, type ResolvedToken } from './token'

export { MissingGitHubTokenError, type ResolvedToken, type TokenSource } from './token'
export { DeviceFlowError } from './device-flow'

export interface LoginOptions {
  readonly clientId: string
  readonly scopes?: readonly string[]
  readonly onUserCode: (info: { userCode: string; verificationUri: string }) => void
  readonly persist?: boolean
  readonly deviceFlow?: Partial<DeviceFlowConfig>
}

export interface LoginResult {
  readonly token: string
  readonly persistedPath?: string
}

export function requireToken(): ResolvedToken {
  const resolved = resolveToken()
  if (!resolved) throw new MissingGitHubTokenError()
  return resolved
}

export async function loginWithDeviceFlow(options: LoginOptions): Promise<LoginResult> {
  const config: DeviceFlowConfig = {
    clientId: options.clientId,
    scopes: options.scopes ?? DEFAULT_SCOPES,
    ...options.deviceFlow,
  }

  const deviceCode = await requestDeviceCode(config)
  options.onUserCode({ userCode: deviceCode.userCode, verificationUri: deviceCode.verificationUri })
  const token = await pollForAccessToken(deviceCode, config)

  if (options.persist !== false) {
    const persistedPath = writeTokenFile(token)
    return { token, persistedPath }
  }

  return { token }
}
