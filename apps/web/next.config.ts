import type { NextConfig } from 'next'
import { resolve } from 'path'

const nextConfig: NextConfig = {
  transpilePackages: ['@orchentra/cli-core'],
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  serverExternalPackages: ['postgres', 'drizzle-orm', '@octokit/auth-app', '@octokit/rest'],
  async redirects() {
    return [
      { source: '/dashboard', destination: '/investigate', permanent: false },
      { source: '/workspace', destination: '/triage', permanent: false },
      { source: '/runs', destination: '/traces', permanent: false },
      { source: '/runs/:path*', destination: '/traces/:path*', permanent: false },
      { source: '/graph', destination: '/detections', permanent: false },
      { source: '/crons', destination: '/evals', permanent: false },
    ]
  },
}

export default nextConfig
