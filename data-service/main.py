# AI投资分析系统 - Python数据服务
# FastAPI + AKShare

import logging
import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime

# 加载环境变量（从项目根目录加载）
project_root = Path(__file__).parent.parent
env_path = project_root / '.env'
load_dotenv(env_path)
logger = logging.getLogger(__name__)
logger.info(f"加载环境变量: {env_path}, ENABLE_AI_ANALYSIS={os.getenv('ENABLE_AI_ANALYSIS')}")

# 修复：禁用系统代理，避免AKShare/requests库代理问题
# macOS系统配置了HTTP代理(127.0.0.1:1082)但代理连接不稳定
# 直连东方财富API更可靠
os.environ.pop('HTTP_PROXY', None)
os.environ.pop('HTTPS_PROXY', None)
os.environ.pop('http_proxy', None)
os.environ.pop('https_proxy', None)
os.environ['NO_PROXY'] = '*'

from routers import market, capital_flow, etf, macro_flow, news, influencers, providers, ai, search, cache, datasources, schedulers, trends, platform_configs, advanced_capital_flow

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时初始化统一数据服务并预热缓存
    logger.info("数据服务启动中...")
    import asyncio
    from services.data_service import data_service
    from services.scheduler_service import scheduler_service

    # 初始化数据源注册
    data_service.initialize()

    # 启动定时任务调度器
    await scheduler_service.start()

    # 从数据库同步调度任务（启用 + 错误容错 + 重试机制）
    max_retries = 3
    retry_delay = 1  # 秒

    for attempt in range(max_retries):
        try:
            logger.info(f"尝试同步调度任务 (第 {attempt + 1}/{max_retries} 次)...")
            sync_stats = await scheduler_service.sync_schedulers_from_database()

            if sync_stats['loaded'] > 0 or sync_stats['skipped'] > 0:
                logger.info(f"✅ 调度任务同步成功: {sync_stats}")
                break
            else:
                logger.warning(f"⚠️ 同步返回0个任务，可能数据库尚未就绪")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2  # 指数退避
        except Exception as e:
            logger.error(f"⚠️ 调度任务同步失败 (尝试 {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(retry_delay)
                retry_delay *= 2
            else:
                # 最后一次失败后记录错误但不阻塞服务启动
                logger.error(f"可以稍后通过API手动触发采集任务")

    # 注册财联社新闻采集任务（每小时执行一次）
    # DISABLED: 暂时禁用自动采集任务，避免AI API故障阻塞服务启动
    # from services.fetch_service import fetch_service
    #
    # async def fetch_cailian_news():
    #     """采集财联社新闻的任务函数"""
    #     try:
    #         logger.info("执行财联社新闻采集任务...")
    #         result = await fetch_service.execute_fetch_task(
    #             source_id="cailian_default",
    #             source_config={
    #                 "driverType": "api",
    #                 "provider": "akshare",
    #                 "keyword": "财联社",
    #                 "limit": 50
    #             }
    #         )
    #         logger.info(f"采集任务完成: {result}")
    #     except Exception as e:
    #         logger.error(f"采集任务失败: {e}")
    #
    # # 注册定时任务：每60分钟执行一次
    # await scheduler_service.add_interval_job(
    #     job_id="fetch_cailian_news",
    #     func=fetch_cailian_news,
    #     minutes=60
    # )
    # logger.info("已注册财联社新闻采集任务 (每60分钟)")
    logger.info("新闻采集任务已禁用（避免AI API故障阻塞服务）")

    # 注册每日缓存清理任务（在交易日收盘后15:30执行）
    async def daily_cache_refresh():
        """每日缓存刷新任务：清理Python服务缓存并通知Next.js清理缓存"""
        try:
            import aiohttp
            from services.cache_service import cache_service

            logger.info("执行每日缓存刷新任务...")

            # 1. 清理Python服务的内存缓存
            deleted_count = cache_service.clear()
            logger.info(f"Python缓存已清理: {deleted_count} 个键")

            # 2. 通知Next.js服务清理缓存
            next_js_url = os.getenv('NEXT_JS_URL', 'http://localhost:3000')
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        f"{next_js_url}/api/cache/clear",
                        timeout=aiohttp.ClientTimeout(total=5)
                    ) as response:
                        if response.status == 200:
                            logger.info("Next.js缓存已清理")
                        else:
                            logger.warning(f"Next.js缓存清理失败: HTTP {response.status}")
            except Exception as e:
                logger.warning(f"无法连接到Next.js服务: {e}")

            # 3. 预热常用数据
            await asyncio.gather(
                data_service.get_index_spot(),
                data_service.get_market_capital_flow(),
                data_service.get_sector_capital_flow("今日"),
                return_exceptions=True,
            )
            logger.info("缓存预热完成，每日刷新任务执行完毕")

        except Exception as e:
            logger.error(f"每日缓存刷新任务失败: {e}")

    # 添加定时任务：每天15:30执行（交易日收盘后）
    await scheduler_service.add_cron_job(
        job_id="daily_cache_refresh",
        func=daily_cache_refresh,
        hour=15,
        minute=30
    )
    logger.info("已注册每日缓存刷新任务 (每天15:30执行)")

    # 注册数据清理任务（每天凌晨2:00执行）
    from workers.data_cleanup import run_cleanup_task

    await scheduler_service.add_cron_job(
        job_id="data_cleanup",
        func=run_cleanup_task,
        hour=2,
        minute=0
    )
    logger.info("已注册数据清理任务 (每天凌晨2:00执行)")

    async def warmup():
        """后台预热：提前加载常用数据到内存缓存"""
        try:
            await asyncio.gather(
                data_service.get_index_spot(),
                data_service.get_market_capital_flow(),
                data_service.get_sector_capital_flow("今日"),
                return_exceptions=True,
            )
            logger.info("缓存预热完成")
        except Exception as e:
            logger.warning(f"缓存预热失败（不影响服务）: {e}")

    # 后台执行预热，不阻塞启动
    asyncio.create_task(warmup())

    yield
    # 关闭时清理
    await scheduler_service.stop()
    logger.info("数据服务关闭")

app = FastAPI(
    title="AI投资分析系统 - 数据服务",
    version="2.0.0",
    description="基于AKShare的A股数据采集服务，支持多数据源和定时任务",
    lifespan=lifespan
)

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://100.80.210.104:3000",  # 内网访问
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(market.router, prefix="/api/market", tags=["market"])
app.include_router(capital_flow.router, prefix="/api/capital-flow", tags=["capital-flow"])
app.include_router(advanced_capital_flow.router, prefix="/api/capital-flow/advanced", tags=["advanced-capital-flow"])
app.include_router(etf.router, prefix="/api/etf", tags=["etf"])
app.include_router(macro_flow.router, prefix="/api/macro-flow", tags=["macro-flow"])
app.include_router(news.router, prefix="/api/news", tags=["news"])
app.include_router(influencers.router, tags=["influencers"])
app.include_router(providers.router, prefix="/api", tags=["providers"])
app.include_router(ai.router, prefix="/api", tags=["ai"])
app.include_router(search.router, prefix="", tags=["search"])
app.include_router(cache.router, prefix="", tags=["cache"])
app.include_router(datasources.router, prefix="/api", tags=["datasources"])
app.include_router(schedulers.router, prefix="/schedulers", tags=["schedulers"])
app.include_router(trends.router, prefix="/api/trends", tags=["trends"])
app.include_router(platform_configs.router, prefix="/api/platform-configs", tags=["platform-configs"])

@app.get("/health")
async def health_check():
    from services.scheduler_service import scheduler_service
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "2.0.0",
        "scheduler_running": scheduler_service.is_running,
        "active_jobs": len(scheduler_service.get_all_jobs())
    }

@app.get("/")
async def root():
    return {
        "service": "AI投资分析系统 - 数据服务",
        "docs": "/docs",
        "health": "/health",
        "version": "2.0.0",
        "features": [
            "多数据源支持",
            "定时任务调度",
            "大V动态监控",
            "内容智能分析"
        ]
    }

@app.get("/api/scheduler/status")
async def get_scheduler_status():
    """获取定时任务状态"""
    from services.scheduler_service import scheduler_service
    return {
        "is_running": scheduler_service.is_running,
        "jobs": scheduler_service.get_all_jobs()
    }

@app.post("/api/scheduler/pause/{job_id}")
async def pause_scheduler_job(job_id: str):
    """暂停定时任务"""
    from services.scheduler_service import scheduler_service
    result = await scheduler_service.pause_job(job_id)
    return {"success": result, "job_id": job_id}

@app.post("/api/scheduler/resume/{job_id}")
async def resume_scheduler_job(job_id: str):
    """恢复定时任务"""
    from services.scheduler_service import scheduler_service
    result = await scheduler_service.resume_job(job_id)
    return {"success": result, "job_id": job_id}

@app.post("/api/scheduler/run/{job_id}")
async def run_scheduler_job(job_id: str):
    """立即执行定时任务"""
    from services.scheduler_service import scheduler_service
    result = await scheduler_service.run_job_now(job_id)
    return {"success": result, "job_id": job_id}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
