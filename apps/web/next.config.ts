import type { NextConfig } from 'next'
import { resolve } from 'path'

const nextConfig: NextConfig = {
  // Only transpile core (types/utils). DB package uses native modules
  // and should only be imported in server components when needed.
  transpilePackages: ['@orchentra/core', '@orchentra/cli-core'],
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  serverExternalPackages: [],
}

export default nextConfig
