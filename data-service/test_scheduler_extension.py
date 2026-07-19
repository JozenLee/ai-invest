"""
测试调度器扩展功能
"""

import asyncio
import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.dirname(__file__))

from services.scheduler_service import SchedulerService


async def test_scheduler_extensions():
    """测试调度器扩展方法"""

    print("=" * 60)
    print("测试调度器扩展功能")
    print("=" * 60)

    # 创建调度器实例
    scheduler = SchedulerService()
    await scheduler.start()

    print("\n✓ 调度器已启动")

    # 测试 1: enable_source_job
    print("\n【测试 1】启用数据源任务")
    success = await scheduler.enable_source_job(
        source_id="test_source_1",
        update_frequency=30,
        driver_config={"provider": "akshare", "keyword": "测试"}
    )
    print(f"  启用任务结果: {'成功' if success else '失败'}")

    # 检查任务是否存在
    job_status = scheduler.get_job_status("datasource_test_source_1")
    if job_status:
        print(f"  任务状态: {job_status['status']}")
        print(f"  执行间隔: {job_status.get('interval', 'N/A')}分钟")
        print(f"  下次执行: {job_status.get('next_run', 'N/A')}")

    # 测试 2: update_job_schedule
    print("\n【测试 2】更新任务调度")
    success = await scheduler.update_job_schedule(
        job_id="datasource_test_source_1",
        minutes=60
    )
    print(f"  更新调度结果: {'成功' if success else '失败'}")

    job_status = scheduler.get_job_status("datasource_test_source_1")
    if job_status:
        print(f"  新执行间隔: {job_status.get('interval', 'N/A')}分钟")

    # 测试 3: sync_datasource_jobs
    print("\n【测试 3】同步数据源任务")
    datasources = [
        {
            "id": "cailian_news",
            "isActive": True,
            "updateFrequency": 60,
            "driverConfig": {"provider": "akshare", "keyword": "财联社"}
        },
        {
            "id": "xueqiu_posts",
            "isActive": True,
            "updateFrequency": 30,
            "driverConfig": {"provider": "xueqiu", "user_id": "test"}
        },
        {
            "id": "inactive_source",
            "isActive": False,
            "updateFrequency": 30,
            "driverConfig": {}
        }
    ]

    stats = await scheduler.sync_datasource_jobs(datasources)
    print(f"  同步统计:")
    print(f"    - 新增: {stats['added']}")
    print(f"    - 更新: {stats['updated']}")
    print(f"    - 移除: {stats['removed']}")
    print(f"    - 跳过: {stats['skipped']}")

    # 测试 4: disable_source_job
    print("\n【测试 4】禁用数据源任务")
    success = await scheduler.disable_source_job("test_source_1")
    print(f"  禁用任务结果: {'成功' if success else '失败'}")

    # 测试 5: 获取所有任务
    print("\n【测试 5】获取所有任务列表")
    all_jobs = scheduler.get_all_jobs()
    print(f"  当前活跃任务数: {len(all_jobs)}")
    for job in all_jobs:
        print(f"    - {job['id']}: {job.get('status', 'unknown')}, 间隔={job.get('interval', 'N/A')}分钟")

    # 清理
    await scheduler.stop()
    print("\n✓ 调度器已停止")
    print("\n" + "=" * 60)
    print("所有测试完成")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_scheduler_extensions())
