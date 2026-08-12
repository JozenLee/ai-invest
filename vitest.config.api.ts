/**
 * Vitest配置文件 - API层测试
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'api-tests',
    include: ['tests/api/**/*.test.ts'],
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 10000,
    teardownTimeout: 5000,

    // 并发配置
    sequence: {
      concurrent: true,
    },
    maxConcurrency: 5,

    // 重试配置
    retry: process.env.CI ? 2 : 0,

    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/app/api/**/*.ts'],
      exclude: [
        'node_modules/**',
        'tests/**',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
    },

    // 报告器配置
    reporters: ['verbose'],

    // 环境变量
    env: {
      NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000',
    },
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
