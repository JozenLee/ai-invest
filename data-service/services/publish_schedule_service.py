import asyncio
import logging
import shutil
import os
from pathlib import Path

async def run_publish_schedule():
    root = Path(__file__).resolve().parents[2]
    node = os.getenv('NODE_BINARY') or shutil.which('node')
    if not node:
        logging.error('自动发布需要 Node.js，请检查服务 PATH')
        return
    process = await asyncio.create_subprocess_exec(node, '--import', 'tsx', str(root / 'scripts/run-publish-schedule.ts'), cwd=str(root))
    await process.wait()
    if process.returncode:
        logging.error('自动发布后台异常退出: %s', process.returncode)
