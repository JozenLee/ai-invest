# AI投资分析系统 - Python数据服务
# FastAPI + AKShare

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime

from routers import market, capital_flow, etf, macro_flow, news

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时预热常用数据缓存
    print("数据服务启动中，预热缓存...")
    import asyncio
    from services.akshare_client import client as ak_client

    async def warmup():
        """后台预热：提前加载常用数据到内存缓存"""
        try:
            # 并行预热指数行情和资金流向
            loop = asyncio.get_event_loop()
            await asyncio.gather(
                loop.run_in_executor(None, ak_client.get_index_spot),
                loop.run_in_executor(None, ak_client.get_market_capital_flow),
                loop.run_in_executor(None, ak_client.get_sector_capital_flow, "今日"),
                return_exceptions=True,
            )
            print("缓存预热完成")
        except Exception as e:
            print(f"缓存预热失败（不影响服务）: {e}")

    # 后台执行预热，不阻塞启动
    asyncio.create_task(warmup())

    yield
    # 关闭时清理
    print("数据服务关闭")

app = FastAPI(
    title="AI投资分析系统 - 数据服务",
    version="1.0.0",
    description="基于AKShare的A股数据采集服务",
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

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    }

@app.get("/")
async def root():
    return {
        "service": "AI投资分析系统 - 数据服务",
        "docs": "/docs",
        "health": "/health"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
