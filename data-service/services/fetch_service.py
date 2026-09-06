"""
采集任务管理服务
负责执行数据源采集任务，集成AI清洗，并持久化到本地数据库
"""

import logging
import asyncio
import json
import hashlib
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

# 导入数据库实例
from db import db


class FetchService:
    """采集任务管理服务"""

    def __init__(self):
        self.is_running = False
        self.active_tasks = {}

    async def execute_fetch_task(
        self,
        source_id: str,
        source_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        执行单个数据源的采集任务

        Args:
            source_id: 数据源ID
            source_config: 数据源配置

        Returns:
            采集结果字典
        """
        start_time = datetime.now()
        log_id = None

        try:
            logger.info(f"开始采集任务: source_id={source_id}")

            # 创建采集日志（初始状态）
            log_id = await self._create_fetch_log(source_id, "running")

            # 1. 根据 driverType 获取对应的 Provider
            driver_type = source_config.get("driverType", "api")
            provider = await self._get_provider(driver_type, source_config)

            # 2. 执行数据采集
            raw_data = await self._fetch_data(provider, source_config)
            fetched_count = len(raw_data)
            logger.info(f"采集完成: source_id={source_id}, count={fetched_count}")

            # 3. 去重：过滤已存在的新闻（在AI分析前，减少AI处理负担）
            new_data = await self._filter_duplicates(raw_data)
            duplicate_count = fetched_count - len(new_data)
            # 重试已经离开上游滚动窗口的未分类文章。
            pending = db.execute('SELECT title,content,url,publishTime,source FROM NewsArticle WHERE sourceId=? AND aiProcessed=0 ORDER BY publishTime DESC LIMIT 20', (source_id,))
            identities = {(row.get('title'), row.get('publishTime')) for row in new_data}
            new_data.extend(row for row in pending if (row['title'], row['publishTime']) not in identities)
            logger.info(f"去重完成: source_id={source_id}, 原始={fetched_count}, 去重后={len(new_data)}, 重复={duplicate_count}")

            # 4. AI数据清洗（仅处理产业细分和影响力）
            processed_data = await self._process_with_ai(new_data, source_id)
            processed_count = len([d for d in processed_data if d.get("aiProcessed")])
            failed_count = len([d for d in processed_data if d.get("aiError")])

            logger.info(
                f"AI处理完成: source_id={source_id}, "
                f"processed={processed_count}, failed={failed_count}"
            )

            # 5. 持久化到本地数据库（简化版 - 不再需要去重检查）
            logger.info(f"准备持久化数据: source_id={source_id}, count={len(processed_data)}")
            stored_count = await self._store_to_database(processed_data, source_id)
            storage_failed = max(0, len(processed_data) - stored_count)
            ai_failed = failed_count
            failed_count = max(failed_count, storage_failed)
            logger.info(f"持久化完成: source_id={source_id}, stored_count={stored_count}")

            # 6. 计算耗时
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            # 7. 更新采集日志
            await self._update_fetch_log(
                log_id=log_id,
                status="partial" if failed_count else "success",
                fetched_count=fetched_count,
                processed_count=processed_count,
                failed_count=failed_count,
                duration=duration_ms,
                message=f"入库 {stored_count} 条；AI成功 {processed_count} 条，失败 {failed_count} 条；批处理统计 {json.dumps(getattr(processed_data, 'stats', {}), ensure_ascii=False)}"
            )

            # 8. 更新数据源状态
            await self._update_source_status(
                source_id=source_id,
                status="partial" if failed_count else "success",
                last_fetch_at=datetime.now(timezone.utc),
                error_message=f'AI分类失败 {ai_failed} 条；入库失败 {storage_failed} 条，请查看更新记录，后续采集重试' if failed_count else ''
            )

            return {
                "success": True,
                "source_id": source_id,
                "fetched_count": fetched_count,
                "processed_count": processed_count,
                "failed_count": failed_count,
                "stored_count": stored_count,
                "duration_ms": duration_ms
            }

        except Exception as e:
            logger.error(f"采集任务失败: source_id={source_id}, error={str(e)}")

            # 更新失败日志
            if log_id:
                duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
                await self._update_fetch_log(
                    log_id=log_id,
                    status="failed",
                    fetched_count=0,
                    processed_count=0,
                    failed_count=0,
                    duration=duration_ms,
                    message=str(e),
                    error_detail=str(e)
                )

            # 更新数据源状态
            await self._update_source_status(
                source_id=source_id,
                status="failed",
                last_fetch_at=datetime.now(timezone.utc),
                error_message=str(e)
            )

            return {
                "success": False,
                "source_id": source_id,
                "error": str(e)
            }

    async def batch_fetch(self, source_ids: List[str]) -> List[Dict[str, Any]]:
        """
        批量并行采集多个数据源

        Args:
            source_ids: 数据源ID列表

        Returns:
            采集结果列表
        """
        logger.info(f"开始批量采集: count={len(source_ids)}")

        # TODO: 从数据库获取数据源配置
        # 这里先返回空结果，等集成 Prisma Client 后实现
        tasks = []
        for source_id in source_ids:
            # task = self.execute_fetch_task(source_id, config)
            # tasks.append(task)
            pass

        # results = await asyncio.gather(*tasks, return_exceptions=True)
        results = []

        logger.info(f"批量采集完成: total={len(results)}")
        return results

    async def _get_provider(self, driver_type: str, config: Dict[str, Any]):
        """根据驱动类型获取对应的 Provider"""
        provider_name = config.get("provider", "akshare")

        if provider_name == "xueqiu":
            from providers.xueqiu_provider import XueqiuProvider
            return XueqiuProvider()
        elif provider_name == "newsnow":
            from providers.newsnow_provider import NewsNowProvider
            return NewsNowProvider()
        elif provider_name == "akshare":
            # 直接使用AKShareProvider实例，而不是data_service
            from providers.akshare_provider import AKShareProvider
            return AKShareProvider()
        elif provider_name == "tushare":
            from providers.tushare_provider import TushareProvider
            return TushareProvider()
        else:
            raise ValueError(f"数据源驱动尚未接入: {provider_name}，请配置受支持的采集器")

    async def _fetch_data(self, provider, config: Dict[str, Any]) -> List[Dict]:
        """执行数据采集"""
        try:
            # 动态使用配置中的关键词和限制
            keywords = config.get("keywords", [])
            keyword = keywords[0] if keywords else config.get("keyword", "")
            limit = config.get("limit", 50)
            api = config.get("api", "stock_news_em")  # 新增：API类型

            logger.info(f"开始采集数据: api={api}, keyword={keyword}, limit={limit}")

            import pandas as pd
            # 调用Provider的get_news方法，传入api参数
            df = await provider.get_news(keyword=keyword, limit=limit, api=api)

            if df.empty:
                logger.warning("采集结果为空")
                return []

            # 转换为字典列表
            news_list = []
            for idx, row in df.iterrows():
                news_list.append({
                    "title": str(row.get("新闻标题", "")),
                    "content": str(row.get("新闻内容", "")),
                    "url": str(row.get("新闻链接", "")),
                    "publishTime": str(row.get("发布时间", "")),
                    "source": str(row.get("来源", "未知"))  # 动态获取来源
                })

            logger.info(f"成功转换 {len(news_list)} 条数据")
            return news_list

        except Exception as e:
            logger.error(f"数据采集失败: {e}")
            raise

    async def _filter_duplicates(self, raw_data: List[Dict]) -> List[Dict]:
        """
        过滤已存在的新闻（通过URL或title+publishTime去重）

        Args:
            raw_data: 原始数据列表

        Returns:
            去重后的新数据列表
        """
        if not raw_data:
            return []

        new_data = []
        seen = set()

        for item in raw_data:
            url = item.get("url", "")
            title = item.get("title", "")
            publish_time = item.get("publishTime", "")

            if not title.strip() or title.strip().lower() in ('nan', 'none', 'null') or not publish_time:
                continue
            try:
                normalized_time = self._parse_publish_time(publish_time).isoformat()
            except (ValueError, TypeError):
                continue
            identity = (title.strip(), normalized_time)
            if identity in seen:
                continue
            seen.add(identity)
            existing = db.execute('SELECT id,aiProcessed FROM NewsArticle WHERE (url=? AND url<>\'\') OR (title=? AND publishTime=?) LIMIT 1', (url, title, normalized_time))
            if existing:
                if not existing[0]['aiProcessed']:
                    new_data.append(item)
                continue

            # 检查URL是否存在
            if url and db.check_article_exists(url):
                logger.debug(f"重复新闻(URL): {title[:30]}")
                continue

            # 如果没有URL，通过title+publishTime去重
            if not url:
                # 生成唯一ID用于去重检查
                unique_key = f"{title}_{publish_time}"
                article_id = hashlib.md5(unique_key.encode()).hexdigest()

                # 检查ID是否存在
                if db.check_article_id_exists(article_id):
                    logger.debug(f"重复新闻(ID): {title[:30]}")
                    continue

            new_data.append(item)

        return new_data

    async def _process_with_ai(
        self,
        raw_data: List[Dict],
        source_id: str
    ) -> List[Dict]:
        """
        AI数据清洗（简化版 - 只提取产业细分和影响力）

        Args:
            raw_data: 原始数据列表
            source_id: 数据源ID

        Returns:
            处理后的数据列表
        """
        if not raw_data:
            return []

        try:
            # 检查是否启用AI分析（环境变量控制）
            import os
            enable_ai_analysis = os.getenv('ENABLE_AI_ANALYSIS', 'false').lower() == 'true'

            if not enable_ai_analysis:
                logger.info(f"AI分析已禁用（ENABLE_AI_ANALYSIS=false），跳过AI批量分析")
                # 返回基础数据，不进行AI分析
                processed_data = []
                for item in raw_data:
                    processed_item = {
                        **item,
                        "segmentCodes": [],
                        "impact": 3,
                        "aiProcessed": False,
                        "aiError": "AI分类已禁用，等待启用后重试"
                    }
                    processed_data.append(processed_item)
                return processed_data

            # 使用全局 AI 分析器实例（避免重复加载产业细分领域）
            from workers.ai_analyzer import AIAnalyzer
            from models.article import RawArticle
            from services.ai_service import get_global_analyzer, is_analyzer_ready

            # 优先使用全局AI分析器（已预加载产业细分领域）
            if is_analyzer_ready():
                ai_analyzer = get_global_analyzer()
                logger.info(f"✅ 使用全局AI分析器: {len(ai_analyzer.industry_segments)} 个产业细分领域已加载")
            else:
                # 降级：创建新实例并尝试加载
                logger.warning("⚠️ 全局AI分析器未就绪，创建临时实例")
                ai_analyzer = AIAnalyzer()
                if not ai_analyzer.industry_segments:
                    logger.info("正在加载产业细分领域...")
                    await ai_analyzer.load_industry_segments(max_retries=3, retry_delay=2.0)
                    logger.info(f"临时实例加载完成: {len(ai_analyzer.industry_segments)} 个领域")

            if not ai_analyzer.industry_segments:
                raise ValueError('产业分类词典未加载，保留原文等待分类重试')

            # 转换为 RawArticle 对象
            raw_articles = []
            for item in raw_data:
                try:
                    raw_article = RawArticle(
                        id=hashlib.md5((item.get("url") or item.get("title", "")).encode()).hexdigest(),
                        title=item.get("title", ""),
                        content=item.get("content", ""),
                        source=item.get("source", "未知"),
                        url=item.get("url", ""),
                        publishTime=item.get("publishTime", "")
                    )
                    raw_articles.append(raw_article)
                except Exception as e:
                    logger.error(f"创建RawArticle失败: {e}")
                    continue

            # 批量AI分析（简化版 - 只提取产业细分和影响力）
            logger.info(f"开始AI批量分析: count={len(raw_articles)}")
            analyzed_articles = await ai_analyzer.analyze_batch(raw_articles)

            # 转换为字典格式（简化版）
            processed_data = []
            for analyzed in analyzed_articles:
                try:
                    processed_item = {
                        "id": analyzed.id,
                        "title": analyzed.title,
                        "content": analyzed.content,
                        "source": analyzed.source,
                        "url": analyzed.url,
                        "publishTime": analyzed.publishTime,
                        "segmentCodes": analyzed.segmentCodes or [],
                        "sentiment": analyzed.sentiment,  # 添加情绪字段
                        "impact": analyzed.impact or 3,
                        "aiProcessed": analyzed.aiProcessed,
                        "aiProcessedAt": analyzed.aiProcessedAt.isoformat() if analyzed.aiProcessedAt else datetime.now(timezone.utc).isoformat(),
                        "aiError": analyzed.aiError
                    }

                    # Debug logging
                    if analyzed.segmentCodes:
                        logger.info(f"[转换] title={analyzed.title[:40]}, segmentCodes={analyzed.segmentCodes}, sentiment={analyzed.sentiment}, impact={analyzed.impact}")

                    processed_data.append(processed_item)

                except Exception as e:
                    logger.error(f"转换分析结果失败: {e}")
                    continue

            logger.info(f"AI分析完成: processed={len(processed_data)}")
            from services.news_classification import ClassificationBatch
            return ClassificationBatch(processed_data, getattr(analyzed_articles, 'stats', {}))

        except Exception as e:
            logger.error(f"AI批量分析失败: {e}")
            # 降级：返回未分析的数据
            return [{**item, "segmentCodes": [], "impact": 3, "aiProcessed": False, "aiError": str(e)} for item in raw_data]

    def _simple_process(self, raw_data: List[Dict]) -> List[Dict]:
        """简单规则处理（AI不可用时的降级方案）"""
        processed_data = []

        for item in raw_data:
            try:
                title = item.get("title", "")
                content = item.get("content", "")

                # 简单摘要（截取内容前100字）
                summary = content[:100] if content else title[:100]

                # 简单分类
                category = self._categorize_news(title)

                # 简单情感分析
                sentiment_score, sentiment_label = self._simple_sentiment(title)

                # 简单影响力评估（默认3）
                impact = 3

                # 提取板块
                sectors = self._extract_sectors(title)

                processed_item = {
                    **item,
                    "summary": summary,
                    "category": category,
                    "sentiment": sentiment_score,
                    "sentimentLabel": sentiment_label,
                    "sentimentConfidence": 0.5,  # 简单规则的置信度较低
                    "impact": impact,
                    "sectors": sectors,
                    "keywords": [],
                    "entities": [],
                    "aiProcessed": True,
                    "aiProcessedAt": datetime.now(timezone.utc).isoformat(),
                    "aiError": None
                }

                processed_data.append(processed_item)

            except Exception as e:
                logger.error(f"简单处理单条数据失败: {e}")
                processed_data.append({
                    **item,
                    "aiProcessed": False,
                    "aiError": str(e)
                })

        return processed_data

    def _categorize_news(self, title: str) -> str:
        """简单分类逻辑"""
        title_lower = title.lower()

        if any(kw in title_lower for kw in ["政策", "补贴", "规划", "意见"]):
            return "policy"
        elif any(kw in title_lower for kw in ["财报", "业绩", "营收", "利润"]):
            return "earnings"
        elif any(kw in title_lower for kw in ["发布", "新品", "产品", "推出"]):
            return "product"
        elif any(kw in title_lower for kw in ["合作", "并购", "收购", "战略"]):
            return "partnership"
        elif any(kw in title_lower for kw in ["供应", "产能", "出货", "订单"]):
            return "supply"
        elif any(kw in title_lower for kw in ["技术", "突破", "研发", "创新"]):
            return "tech"
        else:
            return "market"

    def _simple_sentiment(self, title: str) -> tuple:
        """简单情感分析"""
        positive_words = ["上涨", "利好", "增长", "突破", "创新", "成功", "盈利"]
        negative_words = ["下跌", "利空", "下滑", "失败", "亏损", "暴跌"]

        pos_count = sum(1 for word in positive_words if word in title)
        neg_count = sum(1 for word in negative_words if word in title)

        if pos_count > neg_count:
            return 0.5, "bullish"
        elif neg_count > pos_count:
            return -0.5, "bearish"
        else:
            return 0.0, "neutral"

    def _extract_sectors(self, title: str) -> List[str]:
        """提取板块"""
        sectors = []
        sector_keywords = {
            "半导体": ["半导体", "芯片", "GPU"],
            "光通信": ["光模块", "光通信"],
            "服务器": ["服务器", "算力"],
            "AI应用": ["大模型", "人工智能", "AI"]
        }

        for sector, keywords in sector_keywords.items():
            if any(kw in title for kw in keywords):
                sectors.append(sector)

        return sectors

    def apply_domain_filter(
        self,
        articles: List[Dict[str, Any]],
        domain_filter_config: Optional[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        应用领域筛选规则

        Args:
            articles: 文章列表
            domain_filter_config: 领域筛选配置
                格式: {"enabled": true, "domainIds": ["id1", "id2"], "mode": "include"}

        Returns:
            筛选后的文章列表
        """
        # 如果没有配置或未启用，返回原始列表
        if not domain_filter_config or not domain_filter_config.get("enabled"):
            return articles

        domain_ids = domain_filter_config.get("domainIds", [])
        mode = domain_filter_config.get("mode", "include")

        # 如果没有指定领域ID，返回原始列表
        if not domain_ids:
            logger.warning("领域筛选已启用但未指定domainIds，跳过筛选")
            return articles

        filtered_articles = []

        for article in articles:
            # 获取文章的领域ID列表
            article_domains = article.get("domainIds", [])

            # 如果domainIds是字符串（JSON），先解析
            if isinstance(article_domains, str):
                try:
                    article_domains = json.loads(article_domains)
                except:
                    article_domains = []

            # 判断是否匹配
            has_match = any(domain_id in domain_ids for domain_id in article_domains)

            # 根据模式决定是否保留
            if mode == "include":
                # include模式：只保留匹配的
                if has_match:
                    filtered_articles.append(article)
            elif mode == "exclude":
                # exclude模式：过滤掉匹配的
                if not has_match:
                    filtered_articles.append(article)
            else:
                logger.warning(f"未知的筛选模式: {mode}，使用include模式")
                if has_match:
                    filtered_articles.append(article)

        return filtered_articles

    async def _store_to_database(
        self,
        data: List[Dict],
        source_id: str
    ) -> int:
        """
        持久化数据到本地数据库（简化版 - 已在AI分析前去重）
        """
        stored_count = 0
        logger.info(f"[存储] 开始持久化: source_id={source_id}, count={len(data)}")

        try:
            for idx, item in enumerate(data):
                try:
                    # 解析发布时间
                    publish_time = self._parse_publish_time(item.get("publishTime", ""))

                    # 计算过期时间（默认7天后）
                    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

                    # 生成文章 ID
                    url = item.get("url", "")
                    title = item.get("title", "")
                    if url:
                        article_id = hashlib.md5(url.encode()).hexdigest()
                    else:
                        article_id = hashlib.md5(f"{title}_{publish_time}".encode()).hexdigest()

                    # 准备数据（简化版 - 只保存必要字段）
                    segment_codes_value = json.dumps(item.get("segmentCodes", []), ensure_ascii=False)
                    article_data = {
                        "id": article_id,
                        "title": title[:500],  # 限制长度
                        "content": item.get("content", "")[:10000],
                        "source": item.get("source", "未知"),
                        "url": url or None,
                        "publishTime": publish_time.isoformat() if isinstance(publish_time, datetime) else publish_time,
                        "segmentCodes": segment_codes_value,  # 产业细分
                        "sentiment": item.get("sentiment"),  # 情绪分数
                        "impact": item.get("impact", 3),  # 影响力
                        "sourceId": source_id,
                        "aiProcessed": item.get("aiProcessed", False),
                        "aiProcessedAt": item.get("aiProcessedAt"),
                        "aiError": item.get("aiError"),
                        "expiresAt": expires_at
                    }

                    # 调试日志
                    logger.info(f"[存储] 准备插入: title={title[:30]}, segmentCodes={segment_codes_value}, sentiment={item.get('sentiment')}, impact={article_data['impact']}")

                    # 直接插入数据库（已在AI分析前去重，不需要再检查）
                    existing = db.execute('SELECT id FROM NewsArticle WHERE id=? OR (url=? AND url<>\'\') OR (title=? AND publishTime=?) LIMIT 1', (article_id, url, title[:500], article_data['publishTime']))
                    if existing:
                        result = db.update('UPDATE NewsArticle SET segmentCodes=?,sentiment=?,impact=?,aiProcessed=?,aiProcessedAt=?,aiError=?,sourceId=? WHERE id=?', (segment_codes_value, item.get('sentiment'), item.get('impact', 3), bool(item.get('aiProcessed')), item.get('aiProcessedAt'), item.get('aiError'), source_id, existing[0]['id']))
                    else:
                        result = db.insert_news_article(article_data)
                        if result and item.get('aiError'):
                            db.update('UPDATE NewsArticle SET aiError=? WHERE id=?', (item['aiError'], article_id))
                    if result:
                        stored_count += 1
                        if (idx + 1) % 10 == 0:  # 每10条记录一次日志
                            logger.info(f"[存储] 进度: {idx + 1}/{len(data)}, 成功: {stored_count}")

                except Exception as e:
                    logger.error(f"[存储] 插入单条数据失败: {e}, title={title[:50]}")
                    continue

            logger.info(f"[存储] 数据持久化完成: source_id={source_id}, stored={stored_count}/{len(data)}")
            return stored_count

        except Exception as e:
            logger.error(f"[存储] 数据持久化失败: {e}")
            return stored_count

    def _parse_publish_time(self, time_str: str) -> datetime:
        """解析发布时间"""
        if not time_str:
            raise ValueError('缺少资讯发布时间')

        try:
            try:
                parsed = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
                return (parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone(timedelta(hours=8)))).astimezone(timezone.utc)
            except ValueError:
                pass
            # 尝试标准格式
            for fmt in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y/%m/%d"]:
                try:
                    return datetime.strptime(time_str, fmt).replace(tzinfo=timezone(timedelta(hours=8))).astimezone(timezone.utc)
                except ValueError:
                    continue

            # 相对时间处理
            import re
            now = datetime.now(timezone.utc)

            if "天前" in time_str:
                match = re.search(r"(\d+)\s*天前", time_str)
                if match:
                    return now - timedelta(days=int(match.group(1)))
            elif "小时前" in time_str:
                match = re.search(r"(\d+)\s*小时前", time_str)
                if match:
                    return now - timedelta(hours=int(match.group(1)))
            elif "分钟前" in time_str:
                match = re.search(r"(\d+)\s*分钟前", time_str)
                if match:
                    return now - timedelta(minutes=int(match.group(1)))

            if time_str.strip() == '刚刚':
                return now
            raise ValueError('无法识别资讯发布时间')

        except Exception as e:
            logger.warning(f"时间解析失败: {time_str}, error={e}")
            raise ValueError('无效资讯发布时间') from e

    async def _create_fetch_log(
        self,
        source_id: str,
        status: str
    ) -> str:
        """创建采集日志"""
        try:
            log = db.create_datasource_log({
                "sourceId": source_id,
                "status": status,
                "message": "采集任务启动",
                "fetchedCount": 0,
                "processedCount": 0,
                "failedCount": 0
            })
            return log
        except Exception as e:
            logger.error(f"创建采集日志失败: {e}")
            return f"log_{int(datetime.now().timestamp() * 1000)}"

    async def _update_fetch_log(
        self,
        log_id: str,
        status: str,
        fetched_count: int = 0,
        processed_count: int = 0,
        failed_count: int = 0,
        duration: int = 0,
        message: str = "",
        error_detail: str = ""
    ):
        """更新采集日志"""
        try:
            # 修复：db.update_datasource_log 是同步函数，不需要 await
            db.update_datasource_log(log_id, {
                "status": status,
                "message": message,
                "fetchedCount": fetched_count,
                "processedCount": processed_count,
                "failedCount": failed_count,
                "duration": duration,
                "errorDetail": error_detail
            })
        except Exception as e:
            logger.error(f"更新采集日志失败: {e}")

    async def _update_source_status(
        self,
        source_id: str,
        status: str,
        last_fetch_at: datetime,
        error_message: str = ""
    ):
        """更新数据源状态"""
        try:
            # 修复：db.update_datasource_status 是同步函数，不需要 await
            db.update_datasource_status(
                source_id=source_id,
                status=status,
                last_fetch_at=last_fetch_at.isoformat(),
                error_message=error_message if error_message else None
            )
        except Exception as e:
            logger.error(f"更新数据源状态失败: {e}")


# 全局单例
fetch_service = FetchService()
