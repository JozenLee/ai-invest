"""
小红书 Provider（模拟版）
当前使用模拟数据，预留实际爬虫接口
"""
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import random


class XiaohongshuProvider:
    """小红书数据提供者"""
    
    def __init__(self):
        """初始化小红书 Provider"""
        pass
    
    async def fetch_user_notes(self, user_id: str, limit: int = 20) -> List[Dict]:
        """
        获取用户的笔记列表
        
        Args:
            user_id: 小红书用户 ID
            limit: 获取数量限制
            
        Returns:
            笔记列表
        """
        # TODO: 实现真实的小红书爬虫
        # 当前返回模拟数据
        return self._generate_mock_notes(user_id, limit)
    
    async def get_user_info(self, user_id: str) -> Optional[Dict]:
        """
        获取用户基本信息
        
        Args:
            user_id: 小红书用户 ID
            
        Returns:
            用户信息字典
        """
        # TODO: 实现真实的用户信息获取
        # 当前返回模拟数据
        return self._generate_mock_user_info(user_id)
    
    def _generate_mock_notes(self, user_id: str, limit: int) -> List[Dict]:
        """生成模拟笔记数据"""
        notes = []
        titles = [
            '科技产品深度测评',
            'AI应用场景分享',
            '投资理财经验总结',
            '行业趋势分析',
            '数码好物推荐'
        ]
        
        for i in range(min(limit, 10)):
            publish_time = datetime.now() - timedelta(days=i * 2, hours=random.randint(0, 23))
            
            notes.append({
                'id': f'{user_id}_note_{i}',
                'title': f'[模拟] {random.choice(titles)} {i+1}',
                'content': f'这是一篇模拟的小红书笔记内容 {i+1}。'
                          f'详细介绍了相关的经验和心得体会。包含图片和详细说明。',
                'url': f'https://www.xiaohongshu.com/explore/{user_id}_note_{i}',
                'publish_time': publish_time.isoformat(),
                'like_count': random.randint(500, 10000),
                'comment_count': random.randint(20, 1000),
                'collect_count': random.randint(100, 5000),
                'images': [f'https://placeholder.com/xhs_img_{i}_{j}.jpg' for j in range(random.randint(1, 9))],
                'tags': ['科技', '投资', '干货分享'][:random.randint(1, 3)],
            })
        
        return notes
    
    def _generate_mock_user_info(self, user_id: str) -> Dict:
        """生成模拟用户信息"""
        return {
            'user_id': user_id,
            'name': f'小红书用户{user_id}',
            'avatar': f'https://placeholder.com/xhs_avatar_{user_id}.jpg',
            'signature': '科技爱好者 | 投资学习者 | 分享有价值的内容',
            'followers': random.randint(10000, 200000),
            'notes_count': random.randint(50, 500),
            'liked_count': random.randint(5000, 100000),
        }


# 测试代码
if __name__ == '__main__':
    import asyncio
    
    async def test():
        provider = XiaohongshuProvider()
        
        # 测试用户信息
        user_info = await provider.get_user_info('test_user')
        print("User Info:", user_info)
        
        # 测试笔记列表
        notes = await provider.fetch_user_notes('test_user', limit=5)
        print(f"Notes: {len(notes)} items")
        for note in notes[:2]:
            print(f"  - {note['title']}")
    
    asyncio.run(test())
