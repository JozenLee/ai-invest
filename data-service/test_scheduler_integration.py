"""
测试调度器服务的数据库集成功能
验证sync_schedulers_from_database和execute_fetch_with_tracking逻辑
"""

import asyncio
import logging
from datetime import datetime
from services.scheduler_service import scheduler_service

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_database_queries():
    """测试数据库查询函数"""
    logger.info("=" * 60)
    logger.info("测试1: 数据库查询函数")
    logger.info("=" * 60)

    # 测试获取启用的调度任务
    schedulers = await scheduler_service._get_enabled_schedulers()
    logger.info(f"✓ 获取到 {len(schedulers)} 个启用的调度任务")

    if schedulers:
        for scheduler in schedulers:
            logger.info(f"  - Scheduler ID: {scheduler.get('id')}")
            logger.info(f"    Source ID: {scheduler.get('sourceId')}")
            logger.info(f"    Schedule Type: {scheduler.get('scheduleType')}")
            logger.info(f"    Config: {scheduler.get('scheduleConfig')}")
            logger.info(f"    Enabled: {scheduler.get('isEnabled')}")
            logger.info(f"    Last Run: {scheduler.get('lastRunAt')}")
            logger.info(f"    Next Run: {scheduler.get('nextRunAt')}")
            logger.info("")


async def test_scheduler_lookup():
    """测试根据source_id查询调度器"""
    logger.info("=" * 60)
    logger.info("测试2: 根据source_id查询调度器")
    logger.info("=" * 60)

    # 先获取所有调度任务
    schedulers = await scheduler_service._get_enabled_schedulers()

    if schedulers:
        source_id = schedulers[0].get('sourceId')
        logger.info(f"测试查询: source_id={source_id}")

        scheduler = await scheduler_service.get_scheduler_by_source_id(source_id)
        if scheduler:
            logger.info(f"✓ 成功查询到调度器配置:")
            logger.info(f"  ID: {scheduler.get('id')}")
            logger.info(f"  Schedule Type: {scheduler.get('scheduleType')}")
            logger.info(f"  Config: {scheduler.get('scheduleConfig')}")
        else:
            logger.warning("✗ 未找到调度器配置")
    else:
        logger.warning("数据库中没有启用的调度任务")


async def test_timestamp_update():
    """测试时间戳更新"""
    logger.info("=" * 60)
    logger.info("测试3: 更新调度器时间戳")
    logger.info("=" * 60)

    schedulers = await scheduler_service._get_enabled_schedulers()

    if schedulers:
        scheduler_id = schedulers[0].get('id')
        logger.info(f"测试更新: scheduler_id={scheduler_id}")

        # 测试更新lastRunAt
        now = datetime.now()
        success = await scheduler_service.update_scheduler_timestamps(
            scheduler_id=scheduler_id,
            last_run_at=now
        )

        if success:
            logger.info(f"✓ 成功更新lastRunAt: {now.isoformat()}")
        else:
            logger.error("✗ 更新lastRunAt失败")

        # 验证更新结果
        scheduler = await scheduler_service.get_scheduler_by_source_id(schedulers[0].get('sourceId'))
        if scheduler:
            logger.info(f"  验证 - lastRunAt: {scheduler.get('lastRunAt')}")
    else:
        logger.warning("数据库中没有启用的调度任务")


async def test_sync_from_database():
    """测试从数据库同步调度任务"""
    logger.info("=" * 60)
    logger.info("测试4: 从数据库同步调度任务")
    logger.info("=" * 60)

    # 启动调度器
    await scheduler_service.start()
    logger.info("✓ 调度器已启动")

    # 同步调度任务
    try:
        stats = await scheduler_service.sync_schedulers_from_database()
        logger.info(f"✓ 同步完成: {stats}")
        logger.info(f"  - 成功加载: {stats.get('loaded')} 个")
        logger.info(f"  - 失败: {stats.get('failed')} 个")
        logger.info(f"  - 跳过: {stats.get('skipped')} 个")

        # 查看注册的任务
        jobs = scheduler_service.get_all_jobs()
        logger.info(f"\n当前注册的任务数量: {len(jobs)}")
        for job in jobs:
            logger.info(f"  - Job ID: {job.get('id')}")
            logger.info(f"    Interval: {job.get('interval')} min")
            logger.info(f"    Next Run: {job.get('next_run')}")
            logger.info(f"    Status: {job.get('status')}")
            logger.info("")

    except Exception as e:
        logger.error(f"✗ 同步失败: {e}")

    # 停止调度器
    await scheduler_service.stop()
    logger.info("✓ 调度器已停止")


async def test_integration_logic():
    """测试整体集成逻辑"""
    logger.info("=" * 60)
    logger.info("测试5: 整体集成逻辑验证")
    logger.info("=" * 60)

    # 检查数据库中的数据源和调度任务
    from db import db

    async with db.get_connection() as conn:
        # 检查数据源
        cursor = await conn.execute("SELECT COUNT(*) as count FROM DataSource WHERE isActive = 1")
        row = await cursor.fetchone()
        active_sources = row[0]
        logger.info(f"活跃数据源数量: {active_sources}")

        # 检查调度任务
        cursor = await conn.execute("SELECT COUNT(*) as count FROM SchedulerJob WHERE isEnabled = 1")
        row = await cursor.fetchone()
        enabled_jobs = row[0]
        logger.info(f"启用的调度任务数量: {enabled_jobs}")

        # 显示关联关系
        cursor = await conn.execute("""
            SELECT
                sj.id as scheduler_id,
                sj.sourceId,
                ds.name as source_name,
                ds.provider,
                ds.isActive,
                sj.scheduleType,
                sj.scheduleConfig,
                sj.isEnabled
            FROM SchedulerJob sj
            LEFT JOIN DataSource ds ON sj.sourceId = ds.id
            WHERE sj.isEnabled = 1
        """)
        rows = await cursor.fetchall()

        logger.info("\n启用的调度任务详情:")
        for row in rows:
            logger.info(f"  Scheduler: {row[0]}")
            logger.info(f"    Source: {row[2]} (ID: {row[1]})")
            logger.info(f"    Provider: {row[3]}")
            logger.info(f"    Active: {row[4]}")
            logger.info(f"    Type: {row[5]}")
            logger.info(f"    Config: {row[6]}")
            logger.info("")


async def main():
    """主测试流程"""
    logger.info("\n" + "=" * 60)
    logger.info("开始调度器数据库集成测试")
    logger.info("=" * 60 + "\n")

    try:
        await test_integration_logic()
        await test_database_queries()
        await test_scheduler_lookup()
        await test_timestamp_update()
        await test_sync_from_database()

        logger.info("\n" + "=" * 60)
        logger.info("所有测试完成")
        logger.info("=" * 60)

    except Exception as e:
        logger.error(f"\n测试失败: {e}", exc_info=True)


if __name__ == "__main__":
    asyncio.run(main())
