module.exports = {
  apps: [
    {
      name: 'ai-invest-data',
      cwd: './data-service',
      script: 'main.py',
      interpreter: 'python3',
      env: {
        // 数据库配置
        DATABASE_URL: 'file:../prisma/dev.db',

        // AI 服务配置（第三方 API）
        ANTHROPIC_API_KEY: 'sk-d65f4c3e3c4849fb168f0450491e7f070f1eafb7f6ee64abb874db661fe4cf2f',
        ANTHROPIC_BASE_URL: 'https://apiclaude.cc',
        ANTHROPIC_AUTH_TOKEN: 'sk-d65f4c3e3c4849fb168f0450491e7f070f1eafb7f6ee64abb874db661fe4cf2f',
        CLAUDE_MODEL: 'claude-opus-4-8',

        // 日志配置
        LOG_LEVEL: 'info',

        // 其他配置
        NODE_ENV: 'production',
        TZ: 'Asia/Shanghai',
      },
    },
    {
      name: 'ai-invest-web',
      script: 'npm',
      args: 'run dev',
      env: {
        // 数据库配置
        DATABASE_URL: 'file:./prisma/dev.db',

        // 服务配置
        PYTHON_API_URL: 'http://localhost:8000',
        DATA_SERVICE_URL: 'http://localhost:8000',
        NEXT_PUBLIC_API_URL: 'http://localhost:3000',

        // 其他配置
        NODE_ENV: 'production',
        TZ: 'Asia/Shanghai',
      },
    },
  ],
};
