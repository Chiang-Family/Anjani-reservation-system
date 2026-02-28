import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/report': ['./fonts/**/*'],
  },
};

export default nextConfig;
