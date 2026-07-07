import type { NextConfig } from 'next'
import { resolve } from 'path'

const nextConfig: NextConfig = {
  output: 'export',
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  images: {
    unoptimized: true,
  },
}

export default nextConfig
