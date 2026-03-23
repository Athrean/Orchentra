import { loadConfigFromPath } from './config-schema'

export type { Config } from './config-schema'
export { ConfigSchema, loadConfigFromPath } from './config-schema'

export const config = loadConfigFromPath(process.env.ORCHENTRA_CONFIG ?? 'orchentra.yml')
