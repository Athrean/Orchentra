import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Only transpile core (types/utils). DB package uses native modules
  // and should only be imported in server components when needed.
  transpilePackages: ['@orchentra/core'],
  serverExternalPackages: [],
}

export default nextConfig
