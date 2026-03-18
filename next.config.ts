import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'api.cc0mon.com', pathname: '/**' },
    ],
  },
};

export default nextConfig;
