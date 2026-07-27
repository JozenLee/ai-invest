"""
UserAgentPool - User-Agent string pool for request rotation.
"""
import random
from typing import List


class UserAgentPool:
    """
    User-Agent 池，提供常见的桌面和移动端 UA

    支持随机选择以模拟不同客户端
    """

    # 桌面端 User-Agent 列表
    DESKTOP_USER_AGENTS: List[str] = [
        # Chrome on macOS
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",

        # Chrome on Windows
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",

        # Firefox on macOS
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0",

        # Firefox on Windows
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",

        # Safari on macOS
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",

        # Edge on Windows
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
    ]

    # 移动端 User-Agent 列表
    MOBILE_USER_AGENTS: List[str] = [
        # iPhone - Safari
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",

        # iPhone - Chrome
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) CriOS/119.0.0.0 Mobile/15E148 Safari/604.1",

        # iPad
        "Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",

        # Android - Chrome
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",

        # Android - Samsung Browser
        "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
    ]

    def __init__(self):
        """初始化 User-Agent 池"""
        self.desktop_agents = self.DESKTOP_USER_AGENTS.copy()
        self.mobile_agents = self.MOBILE_USER_AGENTS.copy()

    def get_random_desktop(self) -> str:
        """
        获取随机桌面端 User-Agent

        Returns:
            User-Agent 字符串
        """
        return random.choice(self.desktop_agents)

    def get_random_mobile(self) -> str:
        """
        获取随机移动端 User-Agent

        Returns:
            User-Agent 字符串
        """
        return random.choice(self.mobile_agents)

    def get_random(self, prefer_desktop: bool = True) -> str:
        """
        获取随机 User-Agent（桌面或移动）

        Args:
            prefer_desktop: 是否优先桌面端（70% 桌面，30% 移动）

        Returns:
            User-Agent 字符串
        """
        if prefer_desktop:
            # 70% 桌面，30% 移动
            return self.get_random_desktop() if random.random() < 0.7 else self.get_random_mobile()
        else:
            # 50% 桌面，50% 移动
            return self.get_random_desktop() if random.random() < 0.5 else self.get_random_mobile()

    def add_custom_agent(self, agent: str, is_mobile: bool = False):
        """
        添加自定义 User-Agent

        Args:
            agent: User-Agent 字符串
            is_mobile: 是否为移动端
        """
        if is_mobile:
            self.mobile_agents.append(agent)
        else:
            self.desktop_agents.append(agent)

    def get_chrome_desktop(self) -> str:
        """获取 Chrome 桌面端 UA（常用于 API 请求）"""
        chrome_agents = [ua for ua in self.desktop_agents if 'Chrome' in ua and 'Edg' not in ua]
        return random.choice(chrome_agents) if chrome_agents else self.get_random_desktop()

    def get_safari_mobile(self) -> str:
        """获取 Safari 移动端 UA（常用于模拟 iOS）"""
        safari_agents = [ua for ua in self.mobile_agents if 'Safari' in ua and 'CriOS' not in ua]
        return random.choice(safari_agents) if safari_agents else self.get_random_mobile()


# 全局 User-Agent 池实例
_pool = UserAgentPool()


def get_random_user_agent(prefer_desktop: bool = True) -> str:
    """
    获取随机 User-Agent（全局函数）

    Args:
        prefer_desktop: 是否优先桌面端

    Returns:
        User-Agent 字符串
    """
    return _pool.get_random(prefer_desktop)


def get_desktop_user_agent() -> str:
    """获取桌面端 User-Agent"""
    return _pool.get_random_desktop()


def get_mobile_user_agent() -> str:
    """获取移动端 User-Agent"""
    return _pool.get_random_mobile()


def get_chrome_user_agent() -> str:
    """获取 Chrome 桌面端 User-Agent"""
    return _pool.get_chrome_desktop()
