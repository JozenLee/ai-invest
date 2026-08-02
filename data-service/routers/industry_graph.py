# data-service/routers/industry_graph.py
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Optional
import uuid

from services.task_manager import task_manager

router = APIRouter(prefix="/api/v1/industry-graph", tags=["industry-graph"])

class ExploreRequest(BaseModel):
    name: str
    description: Optional[str] = None

class ApproveStructureRequest(BaseModel):
    approved: bool
    modified_structure: Optional[dict] = None

@router.post("/explore")
async def explore_industry(
    request: ExploreRequest,
    background_tasks: BackgroundTasks
):
    """启动产业链探索任务"""
    task_id = str(uuid.uuid4())

    # 创建任务
    task_manager.create_task(task_id, request.name)

    # 后台执行探索
    background_tasks.add_task(
        run_exploration_task,
        task_id=task_id,
        industry_name=request.name,
        description=request.description
    )

    return {
        "task_id": task_id,
        "status": "started",
        "message": "探索任务已启动"
    }

@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    """获取任务状态"""
    task = task_manager.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    return {
        "task_id": task.task_id,
        "status": task.status,
        "progress": task.progress,
        "current_step": task.current_step,
        "structure": task.structure.dict() if task.structure else None,
        "error": task.error
    }

@router.post("/tasks/{task_id}/approve-structure")
async def approve_structure(
    task_id: str,
    request: ApproveStructureRequest,
    background_tasks: BackgroundTasks
):
    """审核并批准产业链骨架"""
    task = task_manager.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    if task.status != "structure_ready":
        raise HTTPException(status_code=400, detail="任务状态不正确")

    if not request.approved:
        task_manager.update_task(task_id, status="rejected")
        return {"message": "骨架已拒绝"}

    # 使用修改后的骨架（如果有）
    structure = request.modified_structure or task.structure

    # 后台执行第二轮填充
    background_tasks.add_task(
        run_filling_task,
        task_id=task_id,
        structure=structure
    )

    task_manager.update_task(
        task_id,
        status="exploring_details",
        progress=50,
        current_step="正在填充企业信息..."
    )

    return {"message": "骨架已确认，开始填充企业信息"}

async def run_exploration_task(
    task_id: str,
    industry_name: str,
    description: Optional[str] = None
):
    """后台任务：第一轮探索"""
    try:
        task_manager.update_task(
            task_id,
            status="exploring_structure",
            progress=10,
            current_step="正在搜索产业资料..."
        )

        # 第一轮探索：使用AI分析产业链结构
        from services.industry_explorer import get_explorer_service
        explorer = get_explorer_service()
        structure = await explorer.explore_structure(industry_name)

        task_manager.update_task(
            task_id,
            status="structure_ready",
            progress=40,
            current_step="产业链结构已生成，等待审核",
            structure=structure
        )

    except Exception as e:
        task_manager.update_task(
            task_id,
            status="failed",
            error=str(e)
        )

async def run_filling_task(task_id: str, structure: dict):
    """后台任务：第二轮填充"""
    try:
        task_manager.update_task(
            task_id,
            status="exploring_details",
            progress=60,
            current_step="正在并行填充各环节企业..."
        )

        # 实现第二轮填充
        from services.industry_explorer import get_explorer_service
        from services.graph_writer import write_graph_to_neo4j
        from services.neo4j_service import get_neo4j_service
        from models.industry_models import IndustryStructure

        explorer = get_explorer_service()

        # 如果structure是dict，转换为IndustryStructure
        if isinstance(structure, dict):
            structure = IndustryStructure(**structure)

        result = await explorer.fill_companies(structure)

        # 写入Neo4j
        task_manager.update_task(
            task_id,
            status="writing_to_graph",
            progress=80,
            current_step="正在写入图数据库..."
        )

        neo4j_service = get_neo4j_service()
        stats = await write_graph_to_neo4j(result, neo4j_service)

        # 关闭Neo4j连接
        await neo4j_service.close()

        task_manager.update_task(
            task_id,
            status="completed",
            progress=100,
            current_step="探索完成",
            result=result,
            graph_stats=stats
        )

    except Exception as e:
        task_manager.update_task(
            task_id,
            status="failed",
            error=str(e)
        )
