# data-service/services/claude_search_service.py
import os
import time
import hashlib
import logging
from typing import List, Dict, Optional, Any
from anthropic import AsyncAnthropic
from anthropic.types import Message, ContentBlock, ToolUseBlock, TextBlock

# Optional: Tavily fallback
try:
    from tavily import TavilyClient
    TAVILY_AVAILABLE = True
except ImportError:
    TAVILY_AVAILABLE = False

logger = logging.getLogger(__name__)


class ClaudeSearchService:
    """Claude原生搜索服务（使用工具调用）"""

    def __init__(self):
        self.anthropic = AsyncAnthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY"),
            base_url=os.getenv("ANTHROPIC_BASE_URL")
        )
        self.model = os.getenv("CLAUDE_MODEL", "claude-sonnet-5")

        # 初始化Tavily作为降级方案
        self.tavily = None
        if TAVILY_AVAILABLE and os.getenv("TAVILY_API_KEY"):
            try:
                self.tavily = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
            except Exception as e:
                logger.warning(f"Tavily初始化失败: {e}")

    async def search_with_tools(
        self,
        prompt: str,
        max_iterations: int = 5
    ) -> str:
        """
        使用Claude的工具调用进行联网搜索

        Args:
            prompt: 搜索提示词
            max_iterations: 最大迭代次数

        Returns:
            搜索结果文本
        """

        tools = [{
            "name": "web_search",
            "description": "搜索互联网获取最新信息",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜索查询"
                    }
                },
                "required": ["query"]
            }
        }]

        messages = [{"role": "user", "content": prompt}]

        for iteration in range(max_iterations):
            try:
                response = await self.anthropic.messages.create(
                    model=self.model,
                    max_tokens=4096,
                    tools=tools,
                    messages=messages
                )

                if response.stop_reason == "tool_use":
                    # 执行搜索工具
                    tool_results = await self._execute_tools(response.content)
                    messages.append({
                        "role": "assistant",
                        "content": response.content
                    })
                    messages.append({
                        "role": "user",
                        "content": tool_results
                    })
                else:
                    # 完成，返回最终响应
                    return self._extract_text(response.content)

            except Exception as e:
                logger.error(f"Claude搜索迭代 {iteration + 1} 失败: {e}")
                if iteration == max_iterations - 1:
                    raise

        # 达到最大迭代次数，返回最后的响应
        return self._extract_text(response.content)

    async def _execute_tools(self, content: List[ContentBlock]) -> List[Dict[str, Any]]:
        """
        执行工具调用

        Args:
            content: Claude响应的content块列表

        Returns:
            工具结果列表
        """
        results = []
        for block in content:
            if isinstance(block, ToolUseBlock) and block.name == "web_search":
                query = block.input["query"]
                logger.info(f"执行搜索: {query}")
                search_result = await self._perform_search(query)
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": search_result
                })
        return results

    async def _perform_search(self, query: str) -> str:
        """
        执行实际搜索

        目前使用Tavily实现，后续可以替换为其他搜索API
        如：Google Custom Search, Bing, SerpAPI等

        Args:
            query: 搜索查询

        Returns:
            格式化的搜索结果
        """
        if self.tavily:
            try:
                result = self.tavily.search(
                    query=query,
                    search_depth="basic",
                    max_results=5,
                    include_answer=True
                )

                # 格式化搜索结果
                formatted_parts = []

                if result.get("answer"):
                    formatted_parts.append(f"综述: {result['answer']}")

                for idx, item in enumerate(result.get("results", []), 1):
                    formatted_parts.append(
                        f"\n[{idx}] {item.get('title', '无标题')}\n"
                        f"来源: {item.get('url', '')}\n"
                        f"内容: {item.get('content', '')[:500]}"
                    )

                return "\n".join(formatted_parts)

            except Exception as e:
                logger.error(f"Tavily搜索失败: {e}")
                return f"搜索失败: {query} (错误: {str(e)})"
        else:
            # 无搜索后端，返回模拟结果
            logger.warning("无可用搜索后端，返回模拟结果")
            return f"模拟搜索结果: {query}\n(注意: 搜索功能未配置)"

    def _extract_text(self, content: List[ContentBlock]) -> str:
        """
        从content块列表中提取文本

        Args:
            content: Claude响应的content块列表

        Returns:
            提取的文本
        """
        text_parts = []
        for block in content:
            if isinstance(block, TextBlock):
                text_parts.append(block.text)
        return "\n".join(text_parts)

    async def search_with_fallback(self, query: str) -> str:
        """
        带降级的搜索

        优先使用Claude原生搜索，失败时降级到Tavily直接搜索

        Args:
            query: 搜索查询

        Returns:
            搜索结果
        """
        try:
            # 优先使用Claude原生搜索
            prompt = f"""请搜索以下内容并总结关键信息：

{query}

请执行搜索并提供结构化的总结。"""

            return await self.search_with_tools(prompt, max_iterations=3)

        except Exception as e:
            logger.warning(f"Claude搜索失败: {e}, 降级到Tavily")

            # 降级到Tavily直接搜索
            if self.tavily:
                try:
                    result = self.tavily.search(
                        query=query,
                        search_depth="advanced",
                        max_results=8,
                        include_answer=True
                    )
                    return self._format_tavily_result(result)
                except Exception as e2:
                    logger.error(f"Tavily搜索也失败: {e2}")

            # 最终降级：返回空结果并记录
            logger.error(f"所有搜索方式都失败，查询: {query}")
            return ""

    def _format_tavily_result(self, result: Dict[str, Any]) -> str:
        """
        格式化Tavily搜索结果

        Args:
            result: Tavily API返回结果

        Returns:
            格式化的文本
        """
        parts = []

        if result.get("answer"):
            parts.append(f"综述：{result['answer']}")

        for item in result.get("results", [])[:5]:
            parts.append(
                f"来源：{item.get('title', '')}\n"
                f"内容：{item.get('content', '')[:500]}"
            )

        return "\n\n".join(parts)


class CachedSearchService(ClaudeSearchService):
    """带缓存的搜索服务"""

    def __init__(self, cache_ttl: int = 3600):
        """
        初始化缓存搜索服务

        Args:
            cache_ttl: 缓存TTL（秒），默认1小时
        """
        super().__init__()
        self._cache: Dict[str, tuple[str, float]] = {}
        self._cache_ttl = cache_ttl

        # 从环境变量读取配置
        env_ttl = os.getenv("SEARCH_CACHE_TTL")
        if env_ttl:
            try:
                self._cache_ttl = int(env_ttl)
            except ValueError:
                logger.warning(f"无效的SEARCH_CACHE_TTL值: {env_ttl}")

    async def search_with_cache(self, query: str) -> str:
        """
        带缓存的搜索

        Args:
            query: 搜索查询

        Returns:
            搜索结果
        """
        cache_key = self._generate_cache_key(query)

        # 检查缓存
        if cache_key in self._cache:
            cached_data, timestamp = self._cache[cache_key]
            if time.time() - timestamp < self._cache_ttl:
                logger.info(f"使用缓存结果: {query[:50]}...")
                return cached_data
            else:
                # 缓存过期，删除
                del self._cache[cache_key]

        # 执行搜索
        result = await self.search_with_fallback(query)

        # 写入缓存
        self._cache[cache_key] = (result, time.time())

        return result

    def _generate_cache_key(self, query: str) -> str:
        """
        生成缓存键

        Args:
            query: 搜索查询

        Returns:
            缓存键（MD5哈希）
        """
        return hashlib.md5(query.encode('utf-8')).hexdigest()

    def clear_cache(self):
        """清空缓存"""
        self._cache.clear()
        logger.info("搜索缓存已清空")

    def get_cache_stats(self) -> Dict[str, Any]:
        """
        获取缓存统计信息

        Returns:
            缓存统计
        """
        current_time = time.time()
        valid_entries = sum(
            1 for _, timestamp in self._cache.values()
            if current_time - timestamp < self._cache_ttl
        )

        return {
            "total_entries": len(self._cache),
            "valid_entries": valid_entries,
            "expired_entries": len(self._cache) - valid_entries,
            "cache_ttl": self._cache_ttl
        }


# 全局实例
_search_service: Optional[CachedSearchService] = None


def get_search_service() -> CachedSearchService:
    """获取搜索服务单例"""
    global _search_service
    if _search_service is None:
        _search_service = CachedSearchService()
    return _search_service
