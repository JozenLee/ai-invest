module.exports = {
  apps: [
    {
      name: 'ai-invest-data',
      cwd: './data-service',
      script: 'main.py',
      interpreter: 'python3',
      env: {
        // 数据库配置
        DATABASE_URL: process.env.DATABASE_URL || 'file:../prisma/dev.db',

        // AI 服务配置（第三方 API）
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
        ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
        CLAUDE_MODEL: process.env.CLAUDE_MODEL,

        // 日志配置
        LOG_LEVEL: process.env.LOG_LEVEL || 'info',

        // 其他配置
        NODE_ENV: process.env.NODE_ENV || 'production',
        TZ: process.env.TZ || 'Asia/Shanghai',
      },
    },
    {
      name: 'ai-invest-web',
      script: 'npm',
      args: 'run dev',
      env: {
        // 数据库配置
        DATABASE_URL: process.env.DATABASE_URL || 'file:./prisma/dev.db',

        // 服务配置
        PYTHON_API_URL: 'http://localhost:8000',
        DATA_SERVICE_URL: 'http://localhost:8000',
        NEXT_PUBLIC_API_URL: 'http://localhost:3000',

        // 其他配置
        NODE_ENV: process.env.NODE_ENV || 'production',
        TZ: process.env.TZ || 'Asia/Shanghai',
      },
    },
  ],
};
