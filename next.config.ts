import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允许远程访问开发服务器
  allowedDevOrigins: [
    '100.80.210.104',      // Tailscale IP
    '192.168.0.104',       // 本地网络IP
    '192.168.0.0/24',      // 本地网络段
    '100.80.0.0/16',       // Tailscale网络段
  ],

  // 配置WebSocket代理以支持远程HMR
  async rewrites() {
    return [
      {
        source: '/_next/webpack-hmr',
        destination: '/_next/webpack-hmr',
      },
    ];
  },

  // 生产环境优化
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
