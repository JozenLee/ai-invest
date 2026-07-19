"""
微博 Provider（模拟版）
当前使用模拟数据，预留实际爬虫接口
"""
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import random


class WeiboProvider:
    """微博数据提供者"""
    
    def __init__(self):
        """初始化微博 Provider"""
        pass
    
    async def fetch_user_posts(self, uid: str, limit: int = 20) -> List[Dict]:
        """
        获取用户的微博列表
        
        Args:
            uid: 微博用户 UID
            limit: 获取数量限制
            
        Returns:
            微博列表
        """
        # TODO: 实现真实的微博爬虫
        # 当前返回模拟数据
        return self._generate_mock_posts(uid, limit)
    
    async def get_user_info(self, uid: str) -> Optional[Dict]:
        """
        获取用户基本信息
        
        Args:
            uid: 微博用户 UID
            
        Returns:
            用户信息字典
        """
        # TODO: 实现真实的用户信息获取
        # 当前返回模拟数据
        return self._generate_mock_user_info(uid)
    
    def _generate_mock_posts(self, uid: str, limit: int) -> List[Dict]:
        """生成模拟微博数据"""
        posts = []
        topics = [
            '科技行业观察',
            'AI技术发展',
            '芯片产业动态',
            '新能源汽车',
            '投资理财心得'
        ]
        
        for i in range(min(limit, 10)):
            publish_time = datetime.now() - timedelta(days=i, hours=random.randint(0, 23))
            
            posts.append({
                'id': f'{uid}_{i}',
                'content': f'[模拟] {random.choice(topics)}：这是一条模拟的微博内容 {i+1}。'
                          f'分享一些行业洞察和个人观点。#科技# #投资#',
                'url': f'https://weibo.com/{uid}/{uid}_{i}',
                'publish_time': publish_time.isoformat(),
                'like_count': random.randint(100, 5000),
                'comment_count': random.randint(10, 500),
                'repost_count': random.randint(5, 200),
                'images': [f'https://placeholder.com/weibo_img_{i}_{j}.jpg' for j in range(random.randint(0, 3))],
            })
        
        return posts
    
    def _generate_mock_user_info(self, uid: str) -> Dict:
        """生成模拟用户信息"""
        return {
            'uid': uid,
            'name': f'微博用户{uid}',
            'avatar': f'https://placeholder.com/weibo_avatar_{uid}.jpg',
            'signature': '专注科技与投资 | 分享行业洞察',
            'followers': random.randint(50000, 500000),
            'verified': True,
            'verified_type': '科技博主',
        }


# 测试代码
if __name__ == '__main__':
    import asyncio
    
    async def test():
        provider = WeiboProvider()
        
        # 测试用户信息
        user_info = await provider.get_user_info('test_uid')
        print("User Info:", user_info)
        
        # 测试微博列表
        posts = await provider.fetch_user_posts('test_uid', limit=5)
        print(f"Posts: {len(posts)} items")
        for post in posts[:2]:
            print(f"  - {post['content'][:50]}...")
    
    asyncio.run(test())
