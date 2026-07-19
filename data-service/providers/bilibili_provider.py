"""
B站 Provider
使用 bilibili-api-python 库获取 UP 主的视频和动态
"""
import asyncio
from typing import List, Dict, Optional
from datetime import datetime

try:
    from bilibili_api import user, video, Credential
    BILIBILI_AVAILABLE = True
except ImportError:
    BILIBILI_AVAILABLE = False
    print("Warning: bilibili-api-python not installed, using mock data")


class BilibiliProvider:
    """B站数据提供者"""
    
    def __init__(self, credential: Optional[Credential] = None):
        """
        初始化 B站 Provider
        
        Args:
            credential: B站凭证（可选，用于访问需要登录的接口）
        """
        self.credential = credential
        self.available = BILIBILI_AVAILABLE
    
    async def fetch_user_videos(self, uid: int, limit: int = 20) -> List[Dict]:
        """
        获取用户的视频列表
        
        Args:
            uid: B站用户 UID
            limit: 获取数量限制
            
        Returns:
            视频列表
        """
        if not self.available:
            return self._generate_mock_videos(uid, limit)
        
        try:
            u = user.User(uid, credential=self.credential)
            videos_data = await u.get_videos(pn=1, ps=min(limit, 30))
            
            videos = []
            for v in videos_data['list']['vlist'][:limit]:
                videos.append({
                    'id': v['bvid'],
                    'title': v['title'],
                    'description': v['description'],
                    'url': f"https://www.bilibili.com/video/{v['bvid']}",
                    'publish_time': datetime.fromtimestamp(v['created']).isoformat(),
                    'view_count': v['play'],
                    'like_count': v.get('favorites', 0),
                    'comment_count': v.get('comment', 0),
                    'duration': v['length'],
                    'cover_url': v['pic'],
                })
            
            return videos
        except Exception as e:
            print(f"Error fetching Bilibili videos for UID {uid}: {e}")
            return self._generate_mock_videos(uid, limit)
    
    async def fetch_user_dynamics(self, uid: int, limit: int = 20) -> List[Dict]:
        """
        获取用户的动态列表
        
        Args:
            uid: B站用户 UID
            limit: 获取数量限制
            
        Returns:
            动态列表
        """
        if not self.available:
            return self._generate_mock_dynamics(uid, limit)
        
        try:
            u = user.User(uid, credential=self.credential)
            dynamics_data = await u.get_dynamics(offset=0)
            
            dynamics = []
            for d in dynamics_data.get('cards', [])[:limit]:
                card = d.get('card', {})
                desc = d.get('desc', {})
                
                dynamics.append({
                    'id': str(desc.get('dynamic_id', '')),
                    'content': card.get('item', {}).get('content', '') or card.get('dynamic', ''),
                    'url': f"https://t.bilibili.com/{desc.get('dynamic_id', '')}",
                    'publish_time': datetime.fromtimestamp(desc.get('timestamp', 0)).isoformat(),
                    'type': desc.get('type', 0),
                    'like_count': desc.get('like', 0),
                    'comment_count': desc.get('comment', 0),
                    'repost_count': desc.get('repost', 0),
                })
            
            return dynamics
        except Exception as e:
            print(f"Error fetching Bilibili dynamics for UID {uid}: {e}")
            return self._generate_mock_dynamics(uid, limit)
    
    async def get_user_info(self, uid: int) -> Optional[Dict]:
        """
        获取用户基本信息
        
        Args:
            uid: B站用户 UID
            
        Returns:
            用户信息字典
        """
        if not self.available:
            return self._generate_mock_user_info(uid)
        
        try:
            u = user.User(uid, credential=self.credential)
            info = await u.get_user_info()
            
            return {
                'uid': uid,
                'name': info['name'],
                'avatar': info['face'],
                'signature': info.get('sign', ''),
                'followers': info.get('follower', 0),
                'level': info.get('level', 0),
            }
        except Exception as e:
            print(f"Error fetching Bilibili user info for UID {uid}: {e}")
            return self._generate_mock_user_info(uid)
    
    def _generate_mock_videos(self, uid: int, limit: int) -> List[Dict]:
        """生成模拟视频数据"""
        videos = []
        for i in range(min(limit, 5)):
            videos.append({
                'id': f'BV1{uid}mock{i}',
                'title': f'[模拟] B站视频标题 {i+1}',
                'description': f'这是一个模拟的B站视频描述内容 {i+1}',
                'url': f'https://www.bilibili.com/video/BV1{uid}mock{i}',
                'publish_time': datetime.now().isoformat(),
                'view_count': 10000 + i * 1000,
                'like_count': 500 + i * 50,
                'comment_count': 100 + i * 10,
                'duration': '10:30',
                'cover_url': f'https://placeholder.com/cover_{i}.jpg',
            })
        return videos
    
    def _generate_mock_dynamics(self, uid: int, limit: int) -> List[Dict]:
        """生成模拟动态数据"""
        dynamics = []
        for i in range(min(limit, 5)):
            dynamics.append({
                'id': f'{uid}_{i}',
                'content': f'[模拟] 这是一条B站动态内容 {i+1}。包含一些有趣的观点和看法。',
                'url': f'https://t.bilibili.com/{uid}_{i}',
                'publish_time': datetime.now().isoformat(),
                'type': 4,
                'like_count': 200 + i * 20,
                'comment_count': 50 + i * 5,
                'repost_count': 10 + i,
            })
        return dynamics
    
    def _generate_mock_user_info(self, uid: int) -> Dict:
        """生成模拟用户信息"""
        return {
            'uid': uid,
            'name': f'B站用户{uid}',
            'avatar': f'https://placeholder.com/avatar_{uid}.jpg',
            'signature': '这是一个模拟的B站用户签名',
            'followers': 100000,
            'level': 6,
        }


# 测试代码
if __name__ == '__main__':
    async def test():
        provider = BilibiliProvider()
        
        # 测试用户信息
        user_info = await provider.get_user_info(123456)
        print("User Info:", user_info)
        
        # 测试视频列表
        videos = await provider.fetch_user_videos(123456, limit=5)
        print(f"Videos: {len(videos)} items")
        
        # 测试动态列表
        dynamics = await provider.fetch_user_dynamics(123456, limit=5)
        print(f"Dynamics: {len(dynamics)} items")
    
    asyncio.run(test())
