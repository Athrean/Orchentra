import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

export interface UserPaths {
  home: string
  config: string
  state: string
  cache: string
  legacy: string
}

/** One local storage contract. No account, platform key, or product home setup. */
export function userPaths(
  options: {
    home?: string
    env?: Readonly<Record<string, string | undefined>>
  } = {},
): UserPaths {
  const home = options.home ?? homedir()
  const env = options.env ?? process.env
  const root = (key: string, fallback: string): string => {
    const value = env[key]
    return value && isAbsolute(value) ? value : join(home, fallback)
  }
  return {
    home,
    config: join(root('XDG_CONFIG_HOME', '.config'), 'orchentra'),
    state: join(root('XDG_STATE_HOME', '.local/state'), 'orchentra'),
    cache: join(root('XDG_CACHE_HOME', '.cache'), 'orchentra'),
    legacy: join(home, '.orchentra'),
  }
}
