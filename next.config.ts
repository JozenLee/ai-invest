import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '192.168.1.6',
    '192.168.1.0/24',
  ],
};

export default nextConfig;
