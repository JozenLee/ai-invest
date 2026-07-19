# AI投资分析系统 - Python数据服务
# FastAPI + AKShare

import logging
import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime

# 加载环境变量
load_dotenv()

from routers import market, capital_flow, etf, macro_flow, news, influencers, providers, ai, search, cache, datasources

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

    # 注册财联社新闻采集任务（每小时执行一次）
    from services.fetch_service import fetch_service

    async def fetch_cailian_news():
        """采集财联社新闻的任务函数"""
        try:
            logger.info("执行财联社新闻采集任务...")
            result = await fetch_service.execute_fetch_task(
                source_id="cailian_default",
                source_config={
                    "driverType": "api",
                    "provider": "akshare",
                    "keyword": "财联社",
                    "limit": 50
                }
            )
            logger.info(f"采集任务完成: {result}")
        except Exception as e:
            logger.error(f"采集任务失败: {e}")

    # 注册定时任务：每60分钟执行一次
    await scheduler_service.add_interval_job(
        job_id="fetch_cailian_news",
        func=fetch_cailian_news,
        minutes=60
    )
    logger.info("已注册财联社新闻采集任务 (每60分钟)")

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
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(market.router, prefix="/api/market", tags=["market"])
app.include_router(capital_flow.router, prefix="/api/capital-flow", tags=["capital-flow"])
app.include_router(etf.router, prefix="/api/etf", tags=["etf"])
app.include_router(macro_flow.router, prefix="/api/macro-flow", tags=["macro-flow"])
app.include_router(news.router, prefix="/api/news", tags=["news"])
app.include_router(influencers.router, tags=["influencers"])
app.include_router(providers.router, prefix="/api", tags=["providers"])
app.include_router(ai.router, prefix="/api", tags=["ai"])
app.include_router(search.router, prefix="", tags=["search"])
app.include_router(cache.router, prefix="", tags=["cache"])
app.include_router(datasources.router, prefix="/api", tags=["datasources"])

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
