"""
BaseHTTPClient - Unified HTTP client with session management, retry logic, and logging.
"""
import aiohttp
import asyncio
import logging
from typing import Dict, Optional, Any
from datetime import datetime

logger = logging.getLogger(__name__)


class BaseHTTPClient:
    """
    统一的 HTTP 客户端，提供：
    - aiohttp Session 管理
    - Cookie/Header 自动注入
    - 超时控制和指数退避重试
    - 请求日志记录
    """

    def __init__(
        self,
        base_url: str = "",
        headers: Optional[Dict[str, str]] = None,
        cookies: Optional[Dict[str, str]] = None,
        timeout: int = 10,
        max_retries: int = 3,
        retry_delay: float = 1.0,
    ):
        """
        初始化 HTTP 客户端

        Args:
            base_url: 基础 URL
            headers: 默认请求头
            cookies: 默认 Cookie
            timeout: 请求超时时间（秒）
            max_retries: 最大重试次数
            retry_delay: 重试基础延迟（秒），使用指数退避
        """
        self.base_url = base_url.rstrip('/')
        self.default_headers = headers or {}
        self.default_cookies = cookies or {}
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self._session: Optional[aiohttp.ClientSession] = None

    async def _ensure_session(self) -> aiohttp.ClientSession:
        """确保 Session 已创建"""
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=self.timeout)
            self._session = aiohttp.ClientSession(
                timeout=timeout,
                cookies=self.default_cookies
            )
        return self._session

    async def close(self):
        """关闭 Session"""
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None

    async def __aenter__(self):
        """异步上下文管理器入口"""
        await self._ensure_session()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """异步上下文管理器退出"""
        await self.close()

    def _merge_headers(self, extra_headers: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        """合并默认和额外的请求头"""
        headers = self.default_headers.copy()
        if extra_headers:
            headers.update(extra_headers)
        return headers

    def _build_url(self, path: str) -> str:
        """构建完整 URL"""
        if path.startswith('http://') or path.startswith('https://'):
            return path
        return f"{self.base_url}/{path.lstrip('/')}" if self.base_url else path

    async def request(
        self,
        method: str,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        data: Optional[Any] = None,
        json: Optional[Any] = None,
        headers: Optional[Dict[str, str]] = None,
        cookies: Optional[Dict[str, str]] = None,
        retry_count: int = 0,
        **kwargs
    ) -> Optional[Dict[str, Any]]:
        """
        发送 HTTP 请求，带重试和错误处理

        Args:
            method: HTTP 方法 (GET, POST, etc.)
            url: 请求 URL（相对或绝对）
            params: URL 查询参数
            data: 请求体（表单数据）
            json: 请求体（JSON）
            headers: 额外的请求头
            cookies: 额外的 Cookie
            retry_count: 当前重试次数（内部使用）
            **kwargs: 其他 aiohttp 参数

        Returns:
            响应 JSON 数据，失败返回 None
        """
        session = await self._ensure_session()
        full_url = self._build_url(url)
        merged_headers = self._merge_headers(headers)

        # 合并 cookies
        request_cookies = self.default_cookies.copy()
        if cookies:
            request_cookies.update(cookies)

        start_time = datetime.now()

        try:
            # 添加渐进式延迟，避免频繁请求
            if retry_count > 0:
                delay = self.retry_delay * (2 ** (retry_count - 1))  # 指数退避
                logger.debug(f"Retry {retry_count}/{self.max_retries}, waiting {delay}s")
                await asyncio.sleep(delay)

            logger.debug(f"{method} {full_url} (params={params})")

            async with session.request(
                method,
                full_url,
                params=params,
                data=data,
                json=json,
                headers=merged_headers,
                cookies=request_cookies if cookies else None,
                **kwargs
            ) as response:
                duration = (datetime.now() - start_time).total_seconds()

                # 记录请求日志
                logger.info(
                    f"{method} {full_url} - {response.status} "
                    f"({duration:.2f}s, retry={retry_count})"
                )

                if response.status == 200:
                    try:
                        result = await response.json()
                        return result
                    except aiohttp.ContentTypeError:
                        # 不是 JSON 响应，返回文本
                        text = await response.text()
                        logger.warning(f"Non-JSON response: {text[:200]}")
                        return {"text": text}

                elif response.status == 429:  # Rate limit
                    if retry_count < self.max_retries:
                        retry_after = response.headers.get('Retry-After', self.retry_delay * 2)
                        try:
                            wait_time = float(retry_after)
                        except (ValueError, TypeError):
                            wait_time = self.retry_delay * (2 ** retry_count)

                        logger.warning(
                            f"Rate limited (429), retrying after {wait_time}s "
                            f"(attempt {retry_count + 1}/{self.max_retries})"
                        )
                        await asyncio.sleep(wait_time)
                        return await self.request(
                            method, url, params, data, json, headers, cookies,
                            retry_count + 1, **kwargs
                        )
                    else:
                        logger.error(f"Rate limit exceeded, max retries reached")
                        return None

                elif response.status >= 500:  # Server error
                    if retry_count < self.max_retries:
                        logger.warning(
                            f"Server error ({response.status}), retrying "
                            f"(attempt {retry_count + 1}/{self.max_retries})"
                        )
                        return await self.request(
                            method, url, params, data, json, headers, cookies,
                            retry_count + 1, **kwargs
                        )
                    else:
                        logger.error(f"Server error ({response.status}), max retries reached")
                        return None

                else:
                    logger.error(f"HTTP error {response.status}: {await response.text()}")
                    return None

        except asyncio.TimeoutError:
            logger.error(f"Request timeout ({self.timeout}s): {method} {full_url}")
            if retry_count < self.max_retries:
                return await self.request(
                    method, url, params, data, json, headers, cookies,
                    retry_count + 1, **kwargs
                )
            return None

        except aiohttp.ClientError as e:
            logger.error(f"Client error: {e}")
            if retry_count < self.max_retries:
                return await self.request(
                    method, url, params, data, json, headers, cookies,
                    retry_count + 1, **kwargs
                )
            return None

        except Exception as e:
            logger.error(f"Unexpected error: {e}", exc_info=True)
            return None

    async def get(self, url: str, **kwargs) -> Optional[Dict[str, Any]]:
        """GET 请求"""
        return await self.request("GET", url, **kwargs)

    async def post(self, url: str, **kwargs) -> Optional[Dict[str, Any]]:
        """POST 请求"""
        return await self.request("POST", url, **kwargs)

    async def put(self, url: str, **kwargs) -> Optional[Dict[str, Any]]:
        """PUT 请求"""
        return await self.request("PUT", url, **kwargs)

    async def delete(self, url: str, **kwargs) -> Optional[Dict[str, Any]]:
        """DELETE 请求"""
        return await self.request("DELETE", url, **kwargs)
