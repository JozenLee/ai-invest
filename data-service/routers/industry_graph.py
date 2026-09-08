# data-service/routers/industry_graph.py
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import uuid

from services.task_manager import task_manager
from services.state_machine import IndustryGraphStateMachine
from models.review_models import ReviewFeedback

router = APIRouter(prefix="/api/v1/industry-graph", tags=["industry-graph"])

# 全局状态机实例
state_machine = IndustryGraphStateMachine()

class ExploreRequest(BaseModel):
    name: str
    description: Optional[str] = None

class ApproveStructureRequest(BaseModel):
    approved: bool
    modified_structure: Optional[dict] = None

class ReviewStructureRequest(BaseModel):
    approved: bool
    comments: Optional[str] = None
    modified_structure: Optional[Dict[str, Any]] = None

class ReviewCompaniesRequest(BaseModel):
    approved: bool
    comments: Optional[str] = None
    modified_companies: Optional[Dict[str, Any]] = None

class UnifiedReviewRequest(BaseModel):
    """统一审核请求（同时处理结构和企业）"""
    approved: bool
    comments: Optional[str] = None
    modified_structure: Optional[Dict[str, Any]] = None
    modified_companies: Optional[Dict[str, Any]] = None

@router.post("/explore")
async def explore_industry(
    request: ExploreRequest,
    background_tasks: BackgroundTasks
):
    """启动产业链探索任务"""
    task_id = str(uuid.uuid4())
    industry_id = str(uuid.uuid4())  # 立即创建industry_id

    # 创建任务
    task = task_manager.create_task(task_id, request.name)
    # 将industry_id存储在metadata中
    task.metadata['industry_id'] = industry_id
    task_manager.save_task(task)

    # 后台执行探索
    background_tasks.add_task(
        run_exploration_task,
        task_id=task_id,
        industry_name=request.name,
        description=request.description
    )

    return {
        "task_id": task_id,
        "industry_id": industry_id,  # 新增：立即返回industry_id
        "status": "exploring_structure",
        "message": "AI正在深度探索产业链结构..."
    }


@router.post("/edit/{industry_id}")
async def edit_industry(industry_id: str):
    """
    为现有产业创建编辑任务

    该端点会：
    1. 从Neo4j加载现有产业数据
    2. 创建一个新的任务
    3. 将任务状态设置为structure_reviewing
    4. 返回任务ID供前端使用
    """
    from services.neo4j_service import get_neo4j_service
    from models.industry_models import IndustryStructure, EvidenceRef

    try:
        # 从Neo4j加载产业数据
        neo4j_service = get_neo4j_service()

        async with neo4j_service.session() as session:
            # 查询产业基本信息
            query = """
            MATCH (ind:Industry {id: $industry_id})
            RETURN ind.name as name, ind.code as code, ind.description as description,
                   COALESCE(ind.source_urls, []) as source_urls
            """
            result = await session.run(query, industry_id=industry_id)
            records = await result.data()

            if not records or len(records) == 0:
                raise HTTPException(status_code=404, detail="产业不存在")

            industry_info = records[0]
            industry_name = industry_info['name']

            # 查询完整的产业链结构
            structure_query = """
            MATCH (ind:Industry {id: $industry_id})-[:HAS_STAGE]->(stage:Stage)
            OPTIONAL MATCH (stage)-[:HAS_SEGMENT]->(seg:Segment)
            OPTIONAL MATCH (seg)-[:INCLUDES]->(comp:Company)
            WITH stage, seg, collect(comp) as companies
            ORDER BY stage.order, seg.order
            WITH stage, collect({
                name: seg.name,
                code: seg.code,
                description: seg.description,
                key_categories: seg.key_categories,
                companies: [c IN companies | {
                    name: c.name,
                    name_en: c.name_en,
                    ticker: c.ticker,
                    exchange: c.exchange,
                    country: c.country,
                    market_position: c.market_position,
                    key_products: c.key_products,
                    description: c.description,
                    evidence_urls: COALESCE(c.source_urls, []),
                    representative_etfs: c.representative_etfs_json,
                    representative_indices: c.representative_indices_json,
                    match_source: c.match_source,
                    match_confidence: c.match_confidence,
                    representativeness_score: c.representativeness_score,
                    selection_reason: c.selection_reason,
                    value_signals: c.value_signals_json
                }]
            }) as segments
            ORDER BY stage.order
            RETURN collect({
                stage: stage.name,
                stage_code: stage.code,
                description: stage.description,
                segments: segments
            }) as structure
            """

            structure_result = await session.run(structure_query, industry_id=industry_id)
            structure_records = await structure_result.data()
            relationship_result = await session.run(
                """MATCH (ind:Industry {id: $industry_id})-[:HAS_STAGE]->(:Stage)-[:HAS_SEGMENT]->(source:Segment)
                   MATCH (source)-[rel:SUPPLIES|INFLUENCES|CONSTRAINS|SUBSTITUTES]->(target:Segment)
                   RETURN source.code AS source_code, target.code AS target_code,
                          type(rel) AS type, COALESCE(rel.direction, 'positive') AS direction,
                          COALESCE(rel.weight, 0.5) AS weight,
                          COALESCE(rel.confidence, 0.5) AS confidence,
                          rel.lag AS lag, rel.description AS description,
                          COALESCE(rel.source_urls, []) AS evidence_urls""",
                industry_id=industry_id,
            )
            relationship_records = await relationship_result.data()

        if not structure_records or len(structure_records) == 0:
            raise HTTPException(status_code=404, detail="产业链结构不存在")

        structure_data = structure_records[0]['structure']

        # 创建新任务
        task_id = str(uuid.uuid4())
        task = task_manager.create_task(task_id, industry_name)
        task.metadata['industry_id'] = industry_id
        task.metadata['is_edit_mode'] = True
        task_manager.save_task(task)

        # 构建IndustryStructure对象
        structure = IndustryStructure(
            industry={
                "name": industry_name,
                "code": industry_info.get('code', ''),
                "description": industry_info.get('description', '')
            },
            structure=structure_data,
            relationships=[{
                "from": row["source_code"], "to": row["target_code"],
                "type": row["type"], "direction": row["direction"],
                "weight": row["weight"], "confidence": row["confidence"],
                "lag": row["lag"], "description": row["description"],
                "evidence_urls": row["evidence_urls"],
            } for row in relationship_records],
            evidence=[EvidenceRef(title=url, url=url, source_type="graph_revision") for url in industry_info.get("source_urls", [])]
        )

        # 将结构中的企业数据转换为result格式
        from models.industry_models import ExplorationResult, SegmentDetail, CompanyInfo

        details = {}
        for stage in structure_data:
            for segment in stage.get('segments', []):
                segment_code = segment.get('code')
                companies = segment.get('companies', [])

                # 转换为CompanyInfo对象列表
                company_list = []
                for comp in companies:
                    if isinstance(comp, dict):
                        import json
                        company_list.append(CompanyInfo(
                            name=comp.get('name', ''),
                            name_en=comp.get('name_en'),
                            ticker=comp.get('ticker'),
                            exchange=comp.get('exchange'),
                            country=comp.get('country', 'CN'),
                            market_position=comp.get('market_position', 'major'),
                            key_products=comp.get('key_products', []),
                            description=comp.get('description'),
                            segment_code=segment_code,
                            stage_code=stage.get('stage_code'),
                            evidence_urls=comp.get('evidence_urls', []),
                            representative_etfs=json.loads(comp.get('representative_etfs') or '[]') if isinstance(comp.get('representative_etfs'), str) else (comp.get('representative_etfs') or []),
                            representative_indices=json.loads(comp.get('representative_indices') or '[]') if isinstance(comp.get('representative_indices'), str) else (comp.get('representative_indices') or []),
                            match_source=comp.get('match_source') or 'web_search',
                            match_confidence=comp.get('match_confidence') or 0.5,
                            representativeness_score=comp.get('representativeness_score') or 0.0,
                            selection_reason=comp.get('selection_reason'),
                            value_signals=json.loads(comp.get('value_signals') or '{}') if isinstance(comp.get('value_signals'), str) else (comp.get('value_signals') or {}),
                        ))

                details[segment_code] = SegmentDetail(
                    companies=company_list,
                    relationships=[]
                )

        result = ExplorationResult(
            structure=structure,
            details=details,
            metadata={
                "total_companies": sum(len(d.companies) for d in details.values()),
                "edit_mode": True
            }
        )

        # 将任务状态设置为reviewing（统一审核状态），让用户可以立即审核
        task_manager.update_task(
            task_id,
            status="reviewing",
            progress=70,
            current_step="知识图谱加载完成，等待审核",
            structure=structure,
            result=result
        )

        return {
            "task_id": task_id,
            "industry_id": industry_id,
            "status": "reviewing",
            "message": "编辑任务已创建，可以开始审核"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建编辑任务失败: {str(e)}")

@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    """获取任务状态（扩展版本）"""
    task = task_manager.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    # 计算graph_stats：如果尚未写入图数据库，从result.details计算预估值
    graph_stats = task.graph_stats
    if not graph_stats and task.result and task.result.details:
        # 从result.details计算预估统计
        total_companies = 0
        segment_codes = set()
        stage_codes = set()

        for segment_code, segment_detail in task.result.details.items():
            segment_codes.add(segment_code)
            companies = segment_detail.companies if hasattr(segment_detail, 'companies') else []
            total_companies += len(companies)

            # 从公司信息中提取stage_code
            for company in companies:
                if hasattr(company, 'stage_code') and company.stage_code:
                    stage_codes.add(company.stage_code)

        # 如果从companies中无法提取stage信息，从structure中获取
        if not stage_codes and task.structure and hasattr(task.structure, 'structure'):
            for stage in task.structure.structure:
                if hasattr(stage, 'stage_code'):
                    stage_codes.add(stage.stage_code)

        graph_stats = {
            "nodes_created": total_companies + len(segment_codes) + len(stage_codes) + 1,  # +1 for industry node
            "relationships_created": total_companies + len(segment_codes) + len(stage_codes),  # estimate
            "companies": total_companies,
            "segments": len(segment_codes),
            "stages": len(stage_codes),
            "preliminary": True  # 标记这是预估值
        }

    return {
        "task_id": task.task_id,
        "industry_id": task.metadata.get('industry_id'),  # 新增：返回 industry_id
        "industry_name": task.industry_name,
        "status": task.status,
        "progress": task.progress,
        "current_step": task.current_step,
        "structure": task.structure.dict() if task.structure else None,
        "result": task.result.dict() if task.result else None,
        "graph_stats": graph_stats,
        "error": task.error,
        # 新增字段
        "coverage_assessment": task.coverage_assessment.dict() if task.coverage_assessment else None,
        "exploration_context": task.exploration_context.dict() if task.exploration_context else None,
        "structure_iterations": task.structure_iterations,
        "companies_iterations": task.companies_iterations,
        "review_history": [h.dict() for h in task.review_history],
        "metadata": task.metadata  # 新增：返回metadata包含is_edit_mode
    }

@router.post("/tasks/{task_id}/approve-structure")
async def approve_structure(
    task_id: str,
    request: ApproveStructureRequest,
    background_tasks: BackgroundTasks
):
    """审核并批准产业链骨架（已废弃，使用review-structure代替）"""
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


@router.post("/tasks/{task_id}/review-structure")
async def review_structure(
    task_id: str,
    request: ReviewStructureRequest,
    background_tasks: BackgroundTasks
):
    """审核产业链结构（支持多轮迭代）

    Args:
        task_id: 任务ID
        request: Review请求
            - approved: 是否通过
            - comments: 用户评论（可选）
            - modified_structure: 用户修改的结构数据（可选）

    Returns:
        状态转换结果
    """
    task = task_manager.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    # 验证当前状态是否允许review
    if task.status != "structure_reviewing":
        raise HTTPException(
            status_code=400,
            detail=f"任务状态不正确，当前状态: {task.status}，期望状态: structure_reviewing"
        )

    # 构建ReviewFeedback
    feedback = ReviewFeedback(
        approved=request.approved,
        comments=request.comments,
        modified_data=request.modified_structure
    )

    # 记录Review历史
    task_manager.add_review_history(task_id, "structure", feedback)

    # 使用状态机验证并转换状态
    try:
        next_state = state_machine.validate_review_action(task.status, request.approved)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 更新任务状态
    task_manager.update_task(
        task_id,
        status=next_state,
        progress=state_machine._get_progress_for_state(next_state),
        current_step=state_machine._get_step_description(next_state)
    )

    if request.approved:
        # 检查是否是编辑模式
        is_edit_mode = task.metadata.get('is_edit_mode', False)

        if is_edit_mode:
            # 编辑模式：跳过企业探索，直接进入企业审核阶段
            # 从结构中提取企业数据并构建result对象
            from models.industry_models import ExplorationResult, SegmentDetail, CompanyInfo

            structure = request.modified_structure or task.structure
            if isinstance(structure, dict):
                from models.industry_models import IndustryStructure
                structure = IndustryStructure(**structure)

            # 将结构中的企业数据转换为result格式
            details = {}
            for stage in structure.structure:
                for segment in stage.segments:
                    segment_code = segment.code
                    # 检查segment是否有companies属性（从Neo4j加载时包含）
                    companies = []
                    if hasattr(segment, 'companies'):
                        companies = segment.companies
                    elif isinstance(segment, dict) and 'companies' in segment:
                        companies = segment['companies']

                    # 转换为CompanyInfo对象列表
                    company_list = []
                    for comp in companies:
                        if isinstance(comp, dict):
                            company_list.append(CompanyInfo(
                                name=comp.get('name', ''),
                                name_en=comp.get('name_en'),
                                ticker=comp.get('ticker'),
                                exchange=comp.get('exchange'),
                                country=comp.get('country', 'CN'),
                                market_position=comp.get('market_position', 'major'),
                                key_products=comp.get('key_products', []),
                                description=comp.get('description'),
                                segment_code=segment_code,
                                stage_code=stage.stage_code,
                                evidence_urls=comp.get('evidence_urls', []),
                                representative_etfs=comp.get('representative_etfs', []),
                                representative_indices=comp.get('representative_indices', []),
                                match_source=comp.get('match_source') or 'web_search',
                                match_confidence=comp.get('match_confidence') or 0.5,
                                representativeness_score=comp.get('representativeness_score') or 0.0,
                                selection_reason=comp.get('selection_reason'),
                                value_signals=comp.get('value_signals', {}),
                            ))
                        else:
                            # 如果已经是CompanyInfo对象，直接使用
                            company_list.append(comp)

                    details[segment_code] = SegmentDetail(
                        companies=company_list,
                        relationships=[]
                    )

            result = ExplorationResult(
                structure=structure,
                details=details,
                metadata={
                    "total_companies": sum(len(d.companies) for d in details.values()),
                    "edit_mode": True
                }
            )

            # 直接设置为reviewing统一审核状态
            task_manager.update_task(
                task_id,
                status="reviewing",
                progress=70,
                current_step="知识图谱就绪，等待审核",
                result=result
            )

            return {
                "message": "结构已加载，进入统一审核",
                "new_status": "reviewing"
            }
        else:
            # 创建模式：启动企业信息填充
            structure = request.modified_structure or task.structure
            background_tasks.add_task(
                run_filling_task,
                task_id=task_id,
                structure=structure
            )
            return {
                "message": "结构已批准，开始填充企业信息",
                "new_status": next_state
            }
    else:
        # 需要优化，启动结构优化任务
        background_tasks.add_task(
            run_structure_refining_task,
            task_id=task_id,
            feedback=feedback
        )
        return {
            "message": "已接受反馈，正在优化结构...",
            "new_status": next_state
        }


@router.post("/tasks/{task_id}/review-companies")
async def review_companies(
    task_id: str,
    request: ReviewCompaniesRequest,
    background_tasks: BackgroundTasks
):
    """审核企业信息（支持多轮迭代）

    Args:
        task_id: 任务ID
        request: Review请求
            - approved: 是否通过
            - comments: 用户评论（可选）
            - modified_companies: 用户修改的企业数据（可选）

    Returns:
        状态转换结果
    """
    task = task_manager.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    # 验证当前状态
    if task.status != "companies_reviewing":
        raise HTTPException(
            status_code=400,
            detail=f"任务状态不正确，当前状态: {task.status}，期望状态: companies_reviewing"
        )

    # 构建ReviewFeedback
    feedback = ReviewFeedback(
        approved=request.approved,
        comments=request.comments,
        modified_data=request.modified_companies
    )

    # 记录Review历史
    task_manager.add_review_history(task_id, "companies", feedback)

    # 使用状态机验证并转换状态
    try:
        next_state = state_machine.validate_review_action(task.status, request.approved)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 更新任务状态
    task_manager.update_task(
        task_id,
        status=next_state,
        progress=state_machine._get_progress_for_state(next_state),
        current_step=state_machine._get_step_description(next_state)
    )

    if request.approved:
        # 批准通过，启动写入图数据库
        result = request.modified_companies or task.result
        background_tasks.add_task(
            run_write_to_graph_task,
            task_id=task_id,
            result=result
        )
        return {
            "message": "企业信息已批准，开始写入图数据库",
            "new_status": next_state
        }
    else:
        # 需要补充，启动企业信息优化任务
        background_tasks.add_task(
            run_companies_refining_task,
            task_id=task_id,
            feedback=feedback
        )
        return {
            "message": "已接受反馈，正在补充企业信息...",
            "new_status": next_state
        }


@router.get("/tasks/{task_id}/coverage")
async def get_coverage(task_id: str):
    """获取任务的覆盖度评估

    Args:
        task_id: 任务ID

    Returns:
        CoverageAssessment: 覆盖度评估结果
    """
    task = task_manager.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    if not task.coverage_assessment:
        raise HTTPException(status_code=404, detail="覆盖度评估尚未生成")

    return task.coverage_assessment.dict()


@router.get("/tasks/{task_id}/exploration-history")
async def get_exploration_history(task_id: str):
    """获取探索迭代历史和Review历史

    Args:
        task_id: 任务ID

    Returns:
        探索历史记录
    """
    task = task_manager.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    # 构建迭代历史
    iterations = []
    if task.exploration_context:
        for i in range(task.exploration_context.iteration):
            iteration_data = {
                "iteration": i + 1,
                "search_queries": (
                    [task.exploration_context.search_queries[i]]
                    if i < len(task.exploration_context.search_queries)
                    else []
                ),
                "summary": (
                    task.exploration_context.previous_results[i]
                    if i < len(task.exploration_context.previous_results)
                    else ""
                ),
                "coverage_score": task.coverage_assessment.score if task.coverage_assessment else 0.0
            }
            iterations.append(iteration_data)

    return {
        "iterations": iterations,
        "review_history": [h.dict() for h in task.review_history]
    }


@router.post("/tasks/{task_id}/review")
async def unified_review(
    task_id: str,
    request: UnifiedReviewRequest,
    background_tasks: BackgroundTasks
):
    """统一审核知识图谱（同时处理结构和企业）

    Args:
        task_id: 任务ID
        request: 统一审核请求
            - approved: 是否通过
            - comments: 用户评论（可选）
            - modified_structure: 用户修改的结构数据（可选）
            - modified_companies: 用户修改的企业数据（可选）

    Returns:
        状态转换结果
    """
    import logging
    logger = logging.getLogger(__name__)

    logger.info(f"[unified_review] 收到请求 task_id={task_id}, approved={request.approved}, comments={request.comments}")

    task = task_manager.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    # 验证当前状态是否允许review
    if task.status != "reviewing":
        raise HTTPException(
            status_code=400,
            detail=f"任务状态不正确，当前状态: {task.status}，期望状态: reviewing"
        )

    # 验证反馈内容：如果不通过，必须提供反馈
    if not request.approved:
        if not request.comments and not request.modified_structure and not request.modified_companies:
            raise HTTPException(
                status_code=400,
                detail="请提供反馈意见或修改内容"
            )

    # 构建ReviewFeedback
    # 只有当用户真的提供了修改数据时才设置modified_data
    modified_data = None
    if request.modified_structure or request.modified_companies:
        modified_data = {
            "structure": request.modified_structure,
            "companies": request.modified_companies
        }

    feedback = ReviewFeedback(
        approved=request.approved,
        comments=request.comments,
        modified_data=modified_data
    )

    # 记录Review历史（使用unified作为phase）
    task_manager.add_review_history(task_id, "unified", feedback)

    # 使用状态机验证并转换状态
    try:
        next_state = state_machine.validate_review_action(task.status, request.approved)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 更新任务状态
    task_manager.update_task(
        task_id,
        status=next_state,
        progress=state_machine._get_progress_for_state(next_state),
        current_step=state_machine._get_step_description(next_state)
    )

    if request.approved:
        # 批准通过，启动写入图数据库
        from models.industry_models import ExplorationResult, IndustryStructure
        result = ExplorationResult(**request.modified_companies) if request.modified_companies else task.result
        if request.modified_structure:
            structure = IndustryStructure(**request.modified_structure)
            result = result.model_copy(update={"structure": structure}) if result else ExplorationResult(structure=structure, details={})
        background_tasks.add_task(
            run_write_to_graph_task,
            task_id=task_id,
            result=result
        )
        return {
            "message": "知识图谱已批准，开始写入图数据库",
            "new_status": next_state
        }
    else:
        # 需要优化，启动统一优化任务
        background_tasks.add_task(
            run_unified_refining_task,
            task_id=task_id,
            feedback=feedback
        )
        return {
            "message": "已接受反馈，正在优化知识图谱...",
            "new_status": next_state
        }

async def run_exploration_task(
    task_id: str,
    industry_name: str,
    description: Optional[str] = None
):
    """后台任务：完整探索（结构+企业）"""
    try:
        task_manager.update_task(
            task_id,
            status="exploring_structure",
            progress=10,
            current_step="正在搜索产业资料..."
        )

        # 第一轮探索：使用AI分析产业链结构
        from services.industry_explorer import get_explorer_service
        from models.industry_models import ExplorationResult

        explorer = get_explorer_service()
        structure = await explorer.explore_structure(industry_name, description)
        from services.graph_cognition import assess_structure_cognition
        cognition = assess_structure_cognition(structure)
        task = task_manager.get_task(task_id)
        if task:
            task.metadata["structure_cognition"] = cognition
            task_manager.save_task(task)
        if not structure.structure or cognition["score"] < 50:
            raise ValueError(f"产业结构认知质量不足，未进入审核: {'；'.join(cognition['issues'])}")

        task_manager.update_task(
            task_id,
            status="exploring_details",
            progress=40,
            current_step=f"产业链结构已生成（认知质量 {cognition['score']:.0f}），开始填充企业信息...",
            structure=structure
        )

        # 第二轮：填充企业信息
        result = await explorer.fill_companies(structure)

        # 直接进入统一审核状态
        task_manager.update_task(
            task_id,
            status="reviewing",
            progress=70,
            current_step="知识图谱已生成，等待审核",
            structure=structure,
            result=result
        )

    except Exception as e:
        task_manager.update_task(
            task_id,
            status="failed",
            error=str(e)
        )


async def run_structure_refining_task(task_id: str, feedback: ReviewFeedback):
    """后台任务：根据反馈优化结构"""
    import logging
    logger = logging.getLogger(__name__)

    # 强制输出到标准输出
    print(f"[DEBUG] run_structure_refining_task 开始执行，task_id={task_id}")
    print(f"[DEBUG] feedback: approved={feedback.approved}, comments={feedback.comments}")

    try:
        logger.info(f"[run_structure_refining_task] 开始执行，task_id={task_id}")
        logger.info(f"[run_structure_refining_task] feedback: approved={feedback.approved}, comments={feedback.comments}, has_modified_data={bool(feedback.modified_data)}")

        task = task_manager.get_task(task_id)
        if not task:
            logger.error(f"[run_structure_refining_task] 任务不存在: {task_id}")
            return

        # 更新状态为优化中
        logger.info(f"[run_structure_refining_task] 更新状态为 structure_refining")
        task_manager.update_task(
            task_id,
            status="structure_refining",
            progress=25,
            current_step="AI正在分析反馈..."
        )

        # 如果用户直接提供了修改后的结构数据，使用用户的版本
        if feedback.modified_data:
            logger.info(f"[run_structure_refining_task] 使用用户提供的修改数据")
            from models.industry_models import IndustryStructure
            structure = IndustryStructure(**feedback.modified_data)
        elif feedback.comments:
            # 否则，如果用户提供了反馈意见，调用AI进行增量优化
            logger.info(f"[run_structure_refining_task] 调用 AI 进行增量优化")
            logger.info(f"[run_structure_refining_task] 反馈内容: {feedback.comments}")

            task_manager.update_task(
                task_id,
                current_step="AI正在根据反馈优化结构..."
            )

            from services.industry_explorer import get_explorer_service
            explorer = get_explorer_service()

            # 结合当前结构和用户反馈，让AI进行增量修改
            logger.info(f"[run_structure_refining_task] 调用 refine_structure...")
            structure = await explorer.refine_structure(
                current_structure=task.structure,
                feedback_comments=feedback.comments
            )
            logger.info(f"[run_structure_refining_task] AI 优化完成")
        else:
            # 如果既没有修改数据也没有反馈意见，保持原结构
            logger.warning(f"[run_structure_refining_task] 没有反馈意见也没有修改数据，保持原结构")
            structure = task.structure

        # 更新任务状态，回到structure_reviewing等待新一轮审核
        # 同时初始化空的result对象
        logger.info(f"[run_structure_refining_task] 更新状态为 structure_reviewing")

        from models.industry_models import ExplorationResult
        result = ExplorationResult(
            structure=structure,
            details={},  # 空字典，企业信息待后续填充
            metadata={
                "total_companies": 0,
                "structure_only": True,
                "refined": True
            }
        )

        task_manager.update_task(
            task_id,
            status="structure_reviewing",
            progress=30,
            current_step="结构已优化，等待审核",
            structure=structure,
            result=result
        )
        logger.info(f"[run_structure_refining_task] 任务完成")

    except Exception as e:
        logger.error(f"[run_structure_refining_task] 异常: {str(e)}", exc_info=True)
        task_manager.update_task(
            task_id,
            status="failed",
            error=f"结构优化失败: {str(e)}"
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
        from models.industry_models import IndustryStructure

        explorer = get_explorer_service()

        # 如果structure是dict，转换为IndustryStructure
        if isinstance(structure, dict):
            structure = IndustryStructure(**structure)

        result = await explorer.fill_companies(structure)

        # 更新任务状态到companies_reviewing
        task_manager.update_task(
            task_id,
            status="companies_reviewing",
            progress=70,
            current_step="企业信息已填充，等待审核",
            result=result
        )

    except Exception as e:
        task_manager.update_task(
            task_id,
            status="failed",
            error=str(e)
        )


async def run_companies_refining_task(task_id: str, feedback: ReviewFeedback):
    """后台任务：根据反馈补充企业信息"""
    import logging
    logger = logging.getLogger(__name__)

    try:
        task = task_manager.get_task(task_id)
        if not task:
            logger.error(f"[run_companies_refining_task] 任务不存在: {task_id}")
            return

        # 更新状态为优化中
        logger.info(f"[run_companies_refining_task] 开始执行，task_id={task_id}")
        task_manager.update_task(
            task_id,
            status="companies_refining",
            progress=65,
            current_step="AI正在分析反馈..."
        )

        # 如果用户直接提供了修改后的企业数据，使用用户的版本
        if feedback.modified_data:
            logger.info(f"[run_companies_refining_task] 使用用户提供的修改数据")
            from models.industry_models import ExplorationResult
            result = ExplorationResult(**feedback.modified_data)
        elif feedback.comments:
            # 否则，如果用户提供了反馈意见，调用AI进行增量优化
            logger.info(f"[run_companies_refining_task] 调用 AI 进行增量优化")
            logger.info(f"[run_companies_refining_task] 反馈内容: {feedback.comments}")

            from services.industry_explorer import get_explorer_service
            explorer = get_explorer_service()

            # 分析需要补充的环节
            logger.info(f"[run_companies_refining_task] 分析需要补充的环节...")
            affected_segments = await explorer._analyze_companies_feedback(
                task.result,
                feedback.comments
            )
            logger.info(f"[run_companies_refining_task] 需要补充 {len(affected_segments)} 个环节")

            # 更新进度：显示要处理的环节数量
            task_manager.update_task(
                task_id,
                current_step=f"准备补充 {len(affected_segments)} 个环节的企业信息..."
            )

            # 结合当前结果和用户反馈，让AI进行增量补充
            logger.info(f"[run_companies_refining_task] 调用 refine_companies...")
            result = await explorer.refine_companies(
                current_result=task.result,
                feedback_comments=feedback.comments
            )
            logger.info(f"[run_companies_refining_task] AI 优化完成")
        else:
            # 如果既没有修改数据也没有反馈意见，保持原数据
            logger.warning(f"[run_companies_refining_task] 没有反馈意见也没有修改数据，保持原数据")
            result = task.result

        # 更新任务状态，回到companies_reviewing等待新一轮审核
        logger.info(f"[run_companies_refining_task] 更新状态为 companies_reviewing")
        task_manager.update_task(
            task_id,
            status="companies_reviewing",
            progress=70,
            current_step="企业信息已补充，等待审核",
            result=result
        )
        logger.info(f"[run_companies_refining_task] 任务完成")

    except Exception as e:
        logger.error(f"[run_companies_refining_task] 异常: {str(e)}", exc_info=True)
        task_manager.update_task(
            task_id,
            status="failed",
            error=f"企业信息优化失败: {str(e)}"
        )


async def run_unified_refining_task(task_id: str, feedback: ReviewFeedback):
    """后台任务：根据反馈统一优化结构和企业信息"""
    import logging
    logger = logging.getLogger(__name__)

    print(f"\n{'='*80}")
    print(f"[run_unified_refining_task] *** 后台任务已启动 ***")
    print(f"[run_unified_refining_task] task_id: {task_id}")
    print(f"[run_unified_refining_task] feedback.approved: {feedback.approved}")
    print(f"[run_unified_refining_task] feedback.comments: {feedback.comments}")
    print(f"{'='*80}\n")

    try:
        task = task_manager.get_task(task_id)
        if not task:
            logger.error(f"[run_unified_refining_task] 任务不存在: {task_id}")
            print(f"[run_unified_refining_task] ERROR: 任务不存在")
            return

        # 更新状态为优化中
        logger.info(f"[run_unified_refining_task] 开始执行，task_id={task_id}")
        print(f"[run_unified_refining_task] 任务找到，开始优化...")
        task_manager.update_task(
            task_id,
            status="refining",
            progress=65,
            current_step="AI正在分析反馈..."
        )

        # 如果用户直接提供了修改数据，使用用户的版本
        if feedback.modified_data:
            logger.info(f"[run_unified_refining_task] 使用用户提供的修改数据")
            from models.industry_models import IndustryStructure, ExplorationResult

            modified_structure = feedback.modified_data.get("structure")
            modified_companies = feedback.modified_data.get("companies")

            if modified_structure:
                structure = IndustryStructure(**modified_structure)
            else:
                structure = task.structure

            if modified_companies:
                result = ExplorationResult(**modified_companies)
            else:
                result = task.result

        elif feedback.comments:
            # 如果用户提供了反馈意见，调用AI进行增量优化
            logger.info(f"[run_unified_refining_task] 调用 AI 进行增量优化")
            logger.info(f"[run_unified_refining_task] 反馈内容: {feedback.comments}")

            task_manager.update_task(
                task_id,
                current_step="AI正在根据反馈优化知识图谱..."
            )

            from services.industry_explorer import get_explorer_service
            explorer = get_explorer_service()

            # 调用统一优化方法（同时优化结构和企业）
            logger.info(f"[run_unified_refining_task] 调用 refine_unified...")
            structure, result = await explorer.refine_unified(
                current_structure=task.structure,
                current_result=task.result,
                feedback_comments=feedback.comments
            )
            logger.info(f"[run_unified_refining_task] AI 优化完成")
        else:
            # 如果既没有修改数据也没有反馈意见，保持原数据
            logger.warning(f"[run_unified_refining_task] 没有反馈意见也没有修改数据，保持原数据")
            structure = task.structure
            result = task.result

        # 更新任务状态，回到reviewing等待新一轮审核
        logger.info(f"[run_unified_refining_task] 更新状态为 reviewing")
        task_manager.update_task(
            task_id,
            status="reviewing",
            progress=70,
            current_step="知识图谱已优化，等待审核",
            structure=structure,
            result=result
        )
        logger.info(f"[run_unified_refining_task] 任务完成")

    except Exception as e:
        logger.error(f"[run_unified_refining_task] 异常: {str(e)}", exc_info=True)
        task_manager.update_task(
            task_id,
            status="failed",
            error=f"知识图谱优化失败: {str(e)}"
        )


async def run_write_to_graph_task(task_id: str, result: dict):
    """后台任务：写入图数据库"""
    try:
        task = task_manager.get_task(task_id)
        if not task:
            return

        # 从任务元数据中获取industry_id
        industry_id = task.metadata.get('industry_id')
        if not industry_id:
            raise ValueError("任务元数据中未找到industry_id")

        task_manager.update_task(
            task_id,
            status="writing_to_graph",
            progress=90,
            current_step="正在写入图数据库..."
        )

        from services.graph_writer import write_graph_to_neo4j
        from services.neo4j_service import get_neo4j_service
        from models.industry_models import ExplorationResult

        # 如果result是dict，转换为ExplorationResult
        if isinstance(result, dict):
            result = ExplorationResult(**result)

        neo4j_service = get_neo4j_service()
        # 传递industry_id到write_graph_to_neo4j
        stats = await write_graph_to_neo4j(result, neo4j_service, industry_id)

        # Publish invalidation is part of the graph lifecycle. A failed projection
        # refresh must not roll back an already committed Neo4j revision.
        try:
            from services.cache_service import cache_service
            from services.ai_service import get_global_analyzer
            cache_service.invalidate_all_graph_cache()
            analyzer = get_global_analyzer()
            if analyzer:
                analyzer.industry_segments.clear()
                analyzer.segments_prompt = ""
                await analyzer.load_industry_segments(max_retries=1)

            import aiohttp
            import os
            app_url = os.getenv("APP_URL", "http://localhost:3000").rstrip("/")
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{app_url}/api/graph/projection/refresh",
                    timeout=aiohttp.ClientTimeout(total=20),
                ) as response:
                    if response.status >= 400:
                        stats["projection_refresh_warning"] = f"HTTP {response.status}"
        except Exception as refresh_error:
            stats["projection_refresh_warning"] = str(refresh_error)

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


# ==================== 新闻分类相关端点 ====================

@router.get("/segments/by-tags")
async def get_segments_by_tags(
    tags: Optional[str] = None
):
    """
    根据Tag codes反查关联的Segments（用于新闻显示）

    Query Parameters:
        tags: 逗号分隔的Tag代码列表

    Returns:
        {
            "success": True,
            "data": {
                "tag_code": {
                    "segments": [
                        {
                            "industry_code": "...",
                            "industry_name": "...",
                            "segment_code": "...",
                            "segment_name": "..."
                        }
                    ]
                }
            }
        }
    """
    from services.neo4j_service import get_neo4j_service

    if not tags:
        raise HTTPException(status_code=400, detail="tags参数不能为空")

    tag_list = [t.strip() for t in tags.split(',') if t.strip()]

    if not tag_list:
        raise HTTPException(status_code=400, detail="tags列表为空")

    try:
        neo4j_service = get_neo4j_service()

        # 查询每个Tag关联的Segments
        result = {}
        for tag_code in tag_list:
            segments = await neo4j_service.find_segments_by_tags([tag_code])

            # 为每个Segment获取完整信息（产业、阶段）
            if segments:
                segment_infos = []
                for seg in segments:
                    # 查询Segment的完整信息
                    async with neo4j_service.session() as session:
                        query = """
                        MATCH (i:Industry)-[:HAS_STAGE]->(st:Stage)-[:HAS_SEGMENT]->(seg:Segment {code: $segment_code})
                        RETURN i.code AS industry_code,
                               i.name AS industry_name,
                               seg.code AS segment_code,
                               seg.name AS segment_name
                        """
                        query_result = await session.run(query, segment_code=seg['segment_code'])
                        record = await query_result.single()

                        if record:
                            segment_infos.append({
                                'industry_code': record['industry_code'],
                                'industry_name': record['industry_name'],
                                'segment_code': record['segment_code'],
                                'segment_name': record['segment_name']
                            })

                result[tag_code] = segment_infos
            else:
                result[tag_code] = []

        return {
            "success": True,
            "data": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@router.get("/segments/tags")
async def get_segment_tag_codes(
    industry: Optional[str] = None,
    segments: Optional[str] = None
):
    """
    获取Segment关联的Tag codes（用于新闻筛选）

    Query Parameters:
        industry: 产业代码（可选，用于验证）
        segments: 逗号分隔的Segment代码列表

    Returns:
        {
            "success": True,
            "data": {
                "industry": "ai_hardware",
                "segments": ["chip_design", "chip_manufacturing"],
                "tag_codes": ["tag_gpu", "tag_ai_chip", "tag_tsmc"]
            }
        }
    """
    from services.neo4j_service import get_neo4j_service

    if not segments:
        raise HTTPException(status_code=400, detail="segments参数不能为空")

    segment_list = [s.strip() for s in segments.split(',') if s.strip()]

    if not segment_list:
        raise HTTPException(status_code=400, detail="segments列表为空")

    try:
        neo4j_service = get_neo4j_service()
        tag_codes = await neo4j_service.get_tag_codes_by_segments(segment_list)

        return {
            "success": True,
            "data": {
                "industry": industry,
                "segments": segment_list,
                "tag_codes": tag_codes
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@router.get("/{industry_id}/segments")
async def get_industry_segments(industry_id: str):
    """
    获取某个产业的所有Segment列表（用于前端筛选器）

    Returns:
        {
            "success": True,
            "data": {
                "segments": [
                    {
                        "stage_name": "上游",
                        "stage_code": "upstream",
                        "segment_code": "chip_design",
                        "segment_name": "芯片设计",
                        "description": "..."
                    }
                ]
            }
        }
    """
    from services.neo4j_service import get_neo4j_service

    try:
        neo4j_service = get_neo4j_service()

        # 先获取产业基本信息
        industry_info = await neo4j_service.get_industry_basic(industry_id)

        if not industry_info:
            raise HTTPException(status_code=404, detail="产业不存在")

        industry_code = industry_info['code']

        # 获取Segment列表
        segments = await neo4j_service.get_segments_by_industry(industry_code)

        return {
            "success": True,
            "data": {
                "industry": industry_info,
                "segments": segments
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@router.get("/{industry_id}/impact-chain")
async def get_impact_chain(
    industry_id: str,
    segment: Optional[str] = None,
    max_depth: int = 3
):
    """
    获取影响链路（图遍历）

    Query Parameters:
        segment: Segment代码（可选，如果为空则返回整个产业概览）
        max_depth: 最大遍历深度（默认3）

    Returns:
        {
            "success": True,
            "data": {
                "direct": {...},
                "upstream": [...],
                "downstream": [...],
                "cross_industry": [...]
            }
        }
    """
    from services.neo4j_service import get_neo4j_service

    if not segment:
        raise HTTPException(
            status_code=400,
            detail="segment参数不能为空"
        )

    try:
        neo4j_service = get_neo4j_service()

        # 获取产业代码
        industry_info = await neo4j_service.get_industry_basic(industry_id)

        if not industry_info:
            raise HTTPException(status_code=404, detail="产业不存在")

        industry_code = industry_info['code']

        # 获取影响链路
        impact_chain = await neo4j_service.get_segment_impact_chain(
            industry_code,
            segment,
            max_depth
        )

        if not impact_chain:
            raise HTTPException(status_code=404, detail="Segment不存在")

        return {
            "success": True,
            "data": impact_chain
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@router.get("/segments/batch")
async def get_segments_batch(
    codes: Optional[str] = None
):
    """
    批量查询Segment的产业信息（用于新闻详情显示）

    Query Parameters:
        codes: 逗号分隔的Segment代码列表

    Returns:
        {
            "success": True,
            "data": [
                {
                    "industry_code": "ai_hardware",
                    "industry_name": "AI算力硬件",
                    "segment_code": "ai_chip_design",
                    "segment_name": "AI芯片设计"
                }
            ]
        }
    """
    from services.neo4j_service import get_neo4j_service

    if not codes:
        return {
            "success": True,
            "data": []
        }

    code_list = [c.strip() for c in codes.split(',') if c.strip()]

    if not code_list:
        return {
            "success": True,
            "data": []
        }

    try:
        neo4j_service = get_neo4j_service()

        # 查询所有产业及其segments
        all_industries = await neo4j_service.list_industries()

        segments = []
        for industry in all_industries:
            industry_id = industry['id']

            # 获取产业的完整图谱
            graph = await neo4j_service.get_industry_full_graph(industry_id)

            if graph and 'stages' in graph:
                for stage in graph['stages']:
                    for segment in stage.get('segments', []):
                        if segment['code'] in code_list:
                            segments.append({
                                "industry_code": industry['code'],
                                "industry_name": industry['name'],
                                "stage_code": stage['code'],
                                "stage_name": stage['name'],
                                "segment_code": segment['code'],
                                "segment_name": segment['name']
                            })

        return {
            "success": True,
            "data": segments
        }

    except Exception as e:
        import traceback
        print(f"查询Segments失败: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


class SegmentMatchResult(BaseModel):
    """Segment匹配结果"""
    segment_id: str
    etfs: List[Dict] = []  # [{code, name, relevance, reasoning}]
    indices: List[Dict] = []  # [{code, name, relevance, reasoning}]


@router.post("/segments/{segment_id}/match-results")
async def save_segment_match_results(
    segment_id: str,
    match_result: SegmentMatchResult
):
    """
    保存Segment的ETF/指数匹配结果到Neo4j

    将匹配结果存储为Segment节点的属性（JSON字符串格式）
    """
    from services.neo4j_service import get_neo4j_service
    import json

    try:
        neo4j_service = get_neo4j_service()
        mapping_revision_id = str(uuid.uuid4())

        async with neo4j_service.session() as session:
            # 将匹配结果转换为JSON字符串存储
            etfs_json = json.dumps(match_result.etfs, ensure_ascii=False)
            indices_json = json.dumps(match_result.indices, ensure_ascii=False)

            # 更新Segment节点，存储匹配结果
            query = """
            MATCH (industry:Industry)-[:HAS_STAGE]->(:Stage)-[:HAS_SEGMENT]->(s:Segment {id: $segment_id})
            SET s.matched_etfs = $etfs,
                s.matched_indices = $indices,
                s.last_matched_at = datetime(),
                industry.mapping_revision_id = $mapping_revision_id,
                industry.mapping_content_hash = null,
                industry.mapping_published_at = datetime(),
                industry.mapping_updated_at = datetime()
            WITH s
            OPTIONAL MATCH (s)-[:INCLUDES]->(company:Company)
            RETURN s.name as name,
                   collect(DISTINCT {id: company.id, ticker: company.ticker,
                     representative_etfs_json: company.representative_etfs_json}) AS companies
            """

            result = await session.run(
                query,
                segment_id=segment_id,
                etfs=etfs_json,
                indices=indices_json,
                mapping_revision_id=mapping_revision_id,
            )

            records = await result.data()

            if not records or len(records) == 0:
                raise HTTPException(status_code=404, detail="Segment节点不存在")

            company_mapping_count = 0
            etf_by_code = {
                str(item.get("code") or "").strip(): item
                for item in match_result.etfs
                if item.get("code")
            }
            for company in records[0].get("companies", []):
                if not company.get("id") or not company.get("ticker"):
                    continue
                ticker = str(company["ticker"]).strip()
                placeholders = ",".join("?" for _ in etf_by_code)
                holding_rows = []
                if placeholders:
                    try:
                        from db import db
                        holding_rows = db.execute(
                            f"SELECT etfCode, weight, updateDate FROM ETFHolding WHERE stockCode = ? AND etfCode IN ({placeholders}) ORDER BY weight DESC",
                            (ticker, *etf_by_code.keys()),
                        )
                    except Exception:
                        holding_rows = []
                representative_etfs = []
                for holding in holding_rows:
                    item = etf_by_code.get(str(holding.get("etfCode") or ""))
                    if not item:
                        continue
                    representative_etfs.append({
                        "code": item["code"],
                        "name": item.get("name") or item["code"],
                        "relevance": float(item.get("relevance") or 0),
                        "holding_weight": float(holding.get("weight") or 0),
                        "report_period": str(holding.get("updateDate") or ""),
                        "source": "local_etf_holding",
                        "holding_verified": True,
                    })
                try:
                    existing = json.loads(company.get("representative_etfs_json") or "[]")
                except (TypeError, ValueError):
                    existing = []
                merged = {str(item.get("code")): item for item in existing if item.get("code")}
                merged.update({str(item["code"]): item for item in representative_etfs})
                representative_indices = [{
                    "code": item.get("code"),
                    "name": item.get("name") or item.get("code"),
                    "relevance": float(item.get("relevance") or 0),
                    "source": "segment_semantic_mapping",
                } for item in match_result.indices if item.get("code")]
                await session.run(
                    """MATCH (segment:Segment {id: $segment_id})-[membership:INCLUDES]->(company:Company {id: $company_id})
                       SET membership.representative_etfs_json = $segment_representative_etfs,
                           membership.representative_indices_json = $representative_indices,
                           membership.mapping_revision_id = $mapping_revision_id,
                           membership.mapping_updated_at = datetime()
                       SET company.representative_etfs_json = $representative_etfs,
                           company.representative_indices_json = $representative_indices,
                           company.mapping_updated_at = datetime()
                       RETURN company.id""",
                    segment_id=segment_id,
                    company_id=company["id"],
                    segment_representative_etfs=json.dumps(representative_etfs, ensure_ascii=False),
                    representative_etfs=json.dumps(list(merged.values()), ensure_ascii=False),
                    representative_indices=json.dumps(representative_indices, ensure_ascii=False),
                    mapping_revision_id=mapping_revision_id,
                )
                company_mapping_count += 1

            return {
                "success": True,
                "message": f"成功保存 {records[0]['name']} 的匹配结果",
                "data": {
                    "segment_id": segment_id,
                    "etf_count": len(match_result.etfs),
                    "index_count": len(match_result.indices),
                    "company_mapping_count": company_mapping_count,
                    "mapping_revision_id": mapping_revision_id,
                }
            }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"保存匹配结果失败: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")
