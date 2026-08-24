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

# 🔧 禁用代理，避免AKShare访问东方财富时的代理连接问题
os.environ['NO_PROXY'] = '*'
os.environ['no_proxy'] = '*'
for proxy_key in ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy']:
    os.environ.pop(proxy_key, None)

# 加载环境变量（从项目根目录加载）
project_root = Path(__file__).parent.parent
env_path = project_root / '.env'
service_env_path = Path(__file__).parent / '.env'
# 统一以项目根目录 .env 为单一运行时配置源；服务目录 .env 只补充根目录不存在的变量。
# 这样不会因为历史遗留的 data-service/.env 覆盖 Neo4j、数据库和数据源配置。
load_dotenv(service_env_path, override=False)
load_dotenv(env_path, override=True)
logger = logging.getLogger(__name__)
logger.info(
    f"加载环境变量: {env_path} + {service_env_path}, "
    f"ENABLE_AI_ANALYSIS={os.getenv('ENABLE_AI_ANALYSIS')}"
)

# 修复：禁用系统代理，避免AKShare/requests库代理问题
# macOS系统配置了HTTP代理(127.0.0.1:1082)但代理连接不稳定
# 直连东方财富API更可靠
os.environ.pop('HTTP_PROXY', None)
os.environ.pop('HTTPS_PROXY', None)
os.environ.pop('http_proxy', None)
os.environ.pop('https_proxy', None)
os.environ['NO_PROXY'] = '*'

from routers import market, capital_flow, etf, macro_flow, news, influencers, providers, ai, search, cache, datasources, schedulers, trends, platform_configs, advanced_capital_flow, industry_graph, industry_query, impact
from routers import stocks, industry_analysis, fund

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 全局AI分析器实例（用于health检查）
global_ai_analyzer = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时初始化统一数据服务并预热缓存
    logger.info("数据服务启动中...")
    import asyncio
    from services.data_service import data_service
    from services.scheduler_service import scheduler_service
    from providers.multi_source_provider import MultiSourceProvider

    # 初始化数据源注册
    data_service.initialize()

    # 🔥 预热多数据源缓存（减少首次请求延迟）
    logger.info("🔥 预热数据缓存...")
    multi_source = MultiSourceProvider()
    asyncio.create_task(multi_source.warmup_cache())

    # 初始化全局AI分析器（延迟加载产业细分领域）
    # 产业细分领域将在服务启动后由后台任务加载
    logger.info("✅ AI分析器将在服务启动后自动加载产业细分领域")

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

    # 注册后台任务：延迟加载AI分析器的产业细分领域
    async def load_ai_segments_delayed():
        """延迟5秒后加载产业细分领域（确保服务已启动）"""
        global global_ai_analyzer
        await asyncio.sleep(5)
        try:
            from workers.ai_analyzer import AIAnalyzer
            from services.ai_service import set_global_analyzer

            logger.info("开始加载AI分析器的产业细分领域...")
            global_ai_analyzer = AIAnalyzer()
            await global_ai_analyzer.load_industry_segments(max_retries=3, retry_delay=2.0)

            # 注册到ai_service模块，供其他服务使用
            set_global_analyzer(global_ai_analyzer)

            logger.info(f"✅ AI分析器产业细分领域加载完成，共 {len(global_ai_analyzer.industry_segments)} 个领域")
        except Exception as e:
            logger.error(f"❌ AI分析器产业细分领域加载失败: {e}")

    # 启动后台任务
    asyncio.create_task(load_ai_segments_delayed())

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

    async def portfolio_sync_monitor():
        """每分钟检查持仓同步计划；具体执行时间由 Next.js 中的组合配置决定。"""
        try:
            import aiohttp

            next_js_url = os.getenv('NEXT_JS_URL', 'http://localhost:3000')
            headers = {}
            sync_secret = os.getenv('PORTFOLIO_SYNC_SECRET')
            if sync_secret:
                headers['x-portfolio-sync-secret'] = sync_secret
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{next_js_url}/api/portfolio/sync-scheduled",
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=60),
                ) as response:
                    result = await response.json(content_type=None)
                    if response.status != 200 or not result.get('success'):
                        logger.warning(f"持仓定时同步检查失败: HTTP {response.status}, {result}")
                    elif result.get('data', {}).get('results'):
                        logger.info(f"持仓定时同步执行结果: {result['data']['results']}")
        except Exception as e:
            logger.warning(f"无法检查持仓同步计划: {e}")

    await scheduler_service.add_interval_job(
        job_id="portfolio_sync_monitor",
        func=portfolio_sync_monitor,
        minutes=1,
    )
    logger.info("已注册持仓同步监控任务 (每分钟检查，到点执行)")

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
app.include_router(fund.router, prefix="/api/fund", tags=["fund"])
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
app.include_router(industry_graph.router)
app.include_router(industry_query.router)
app.include_router(impact.router)
app.include_router(stocks.router)
app.include_router(industry_analysis.router, prefix="/api")

@app.get("/health")
async def health_check():
    from services.scheduler_service import scheduler_service

    # 检查AI分析器状态
    ai_enabled = os.getenv('ENABLE_AI_ANALYSIS', 'true').lower() == 'true'
    api_key = os.getenv('ANTHROPIC_API_KEY')
    api_configured = bool(api_key)

    # 从全局实例获取AI分析器状态
    ai_ready = False
    segments_loaded = 0

    if global_ai_analyzer is not None:
        ai_ready = global_ai_analyzer.claude_client is not None
        segments_loaded = len(global_ai_analyzer.industry_segments)

    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "2.0.0",
        "scheduler_running": scheduler_service.is_running,
        "active_jobs": len(scheduler_service.get_all_jobs()),
        "ai_analyzer": {
            "enabled": ai_enabled,
            "ready": ai_ready,
            "segments_loaded": segments_loaded,
            "api_configured": api_configured
        }
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
