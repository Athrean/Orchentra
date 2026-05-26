import type { NextConfig } from 'next'
import { resolve } from 'path'

const nextConfig: NextConfig = {
  transpilePackages: ['@orchentra/cli-core'],
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  serverExternalPackages: ['postgres', 'drizzle-orm', '@octokit/auth-app', '@octokit/rest'],
}

export default nextConfig
