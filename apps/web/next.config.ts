import type { NextConfig } from 'next'
import { resolve } from 'path'

const nextConfig: NextConfig = {
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
}

export default nextConfig
