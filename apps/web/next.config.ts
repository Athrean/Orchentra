import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@orchentra/core", "@orchentra/db"],
}

export default nextConfig
