#!/usr/bin/env python3
"""
数据源深度测试工具
测试实际采集功能并验证数据写入
"""

import requests
import sqlite3
import sys
import time
from typing import Dict, List, Tuple
from datetime import datetime

# 颜色代码
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    CYAN = '\033[0;36m'
    NC = '\033[0m'
    BOLD = '\033[1m'

# 测试配置
DATA_SERVICE_API = "http://localhost:8000"
DB_PATH = "prisma/dev.db"

# 选择关键数据源进行深度测试（覆盖各种类型）
TEST_DATASOURCES = [
    ("ds_cls", "财联社", "api/akshare"),
    ("ds_36kr", "36氪", "api/custom"),
    ("ds_sina_finance", "新浪财经", "rss"),
    ("ds_pingwest", "品玩", "crawler"),
]

def get_article_count(source_id: str = None) -> int:
    """获取数据库中的文章数量"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        if source_id:
            cursor.execute(
                "SELECT COUNT(*) FROM NewsArticle WHERE sourceId = ?",
                (source_id,)
            )
        else:
            cursor.execute("SELECT COUNT(*) FROM NewsArticle")

        count = cursor.fetchone()[0]
        conn.close()
        return count
    except Exception as e:
        print(f"{Colors.RED}数据库查询失败: {e}{Colors.NC}")
        return 0

def get_latest_articles(source_id: str, limit: int = 3) -> List[Dict]:
    """获取最新文章"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, title, source, publishTime, aiProcessed, createdAt
            FROM NewsArticle
            WHERE sourceId = ?
            ORDER BY createdAt DESC
            LIMIT ?
        """, (source_id, limit))

        articles = []
        for row in cursor.fetchall():
            articles.append({
                'id': row[0],
                'title': row[1],
                'source': row[2],
                'publishTime': row[3],
                'aiProcessed': row[4],
                'createdAt': row[5]
            })

        conn.close()
        return articles
    except Exception as e:
        print(f"{Colors.RED}查询文章失败: {e}{Colors.NC}")
        return []

def trigger_fetch(ds_id: str) -> Tuple[bool, str]:
    """触发数据源采集"""
    try:
        url = f"{DATA_SERVICE_API}/api/datasources/{ds_id}/fetch"
        resp = requests.post(url, timeout=30)

        if resp.status_code == 200:
            data = resp.json()
            if data.get('success'):
                return True, "采集任务已启动"
            else:
                return False, data.get('message', '未知错误')
        else:
            return False, f"HTTP {resp.status_code}"
    except Exception as e:
        return False, str(e)

def wait_for_fetch(ds_id: str, initial_count: int, timeout: int = 60) -> Tuple[bool, int]:
    """等待采集完成"""
    start_time = time.time()

    while time.time() - start_time < timeout:
        current_count = get_article_count(ds_id)

        if current_count > initial_count:
            new_articles = current_count - initial_count
            return True, new_articles

        time.sleep(2)

    return False, 0

def test_datasource(ds_id: str, ds_name: str, ds_type: str, index: int, total: int) -> Dict:
    """测试单个数据源"""
    print()
    print("=" * 70)
    print(f"{Colors.CYAN}{Colors.BOLD}[{index}/{total}] 测试数据源: {ds_name} ({ds_type}){Colors.NC}")
    print("=" * 70)

    result = {
        'id': ds_id,
        'name': ds_name,
        'type': ds_type,
        'success': False,
        'messages': []
    }

    # 1. 检查初始状态
    print(f"\n{Colors.BLUE}步骤 1/4: 检查初始状态{Colors.NC}")
    initial_count = get_article_count(ds_id)
    print(f"  当前文章数: {initial_count}")
    result['messages'].append(f"初始文章数: {initial_count}")

    # 2. 触发采集
    print(f"\n{Colors.BLUE}步骤 2/4: 触发采集任务{Colors.NC}")
    success, message = trigger_fetch(ds_id)

    if not success:
        print(f"  {Colors.RED}✗ 采集触发失败: {message}{Colors.NC}")
        result['messages'].append(f"触发失败: {message}")
        return result

    print(f"  {Colors.GREEN}✓ {message}{Colors.NC}")
    result['messages'].append(message)

    # 3. 等待采集完成
    print(f"\n{Colors.BLUE}步骤 3/4: 等待采集完成 (最多60秒){Colors.NC}")
    print("  ", end="", flush=True)

    for i in range(30):
        print(".", end="", flush=True)
        time.sleep(2)

        current_count = get_article_count(ds_id)
        if current_count > initial_count:
            new_articles = current_count - initial_count
            print()
            print(f"  {Colors.GREEN}✓ 采集完成！新增文章: {new_articles}篇{Colors.NC}")
            result['success'] = True
            result['new_articles'] = new_articles
            result['messages'].append(f"新增文章: {new_articles}篇")
            break
    else:
        print()
        print(f"  {Colors.YELLOW}⚠ 等待超时，未检测到新文章{Colors.NC}")
        result['messages'].append("等待超时")
        return result

    # 4. 查看最新文章
    print(f"\n{Colors.BLUE}步骤 4/4: 查看最新文章{Colors.NC}")
    latest_articles = get_latest_articles(ds_id, 3)

    if latest_articles:
        for i, article in enumerate(latest_articles, 1):
            print(f"\n  文章 {i}:")
            print(f"    标题: {article['title'][:50]}...")
            print(f"    来源: {article['source']}")
            print(f"    发布: {article['publishTime']}")
            print(f"    AI处理: {'是' if article['aiProcessed'] else '否'}")
    else:
        print(f"  {Colors.YELLOW}未找到最新文章{Colors.NC}")

    return result

def main():
    """主函数"""
    print("=" * 70)
    print(f"{Colors.BOLD}  数据源深度测试工具{Colors.NC}")
    print("=" * 70)
    print()
    print(f"测试范围: {len(TEST_DATASOURCES)}个关键数据源")
    print(f"测试内容: 触发采集 → 验证数据写入 → 检查文章质量")
    print()

    # 检查数据库
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.close()
        print(f"{Colors.GREEN}✓ 数据库连接正常{Colors.NC}")
    except Exception as e:
        print(f"{Colors.RED}✗ 数据库连接失败: {e}{Colors.NC}")
        sys.exit(1)

    # 检查服务
    try:
        resp = requests.get(f"{DATA_SERVICE_API}/health", timeout=5)
        if resp.status_code == 200:
            print(f"{Colors.GREEN}✓ 数据服务运行正常{Colors.NC}")
        else:
            print(f"{Colors.RED}✗ 数据服务异常{Colors.NC}")
            sys.exit(1)
    except Exception as e:
        print(f"{Colors.RED}✗ 数据服务无法连接: {e}{Colors.NC}")
        sys.exit(1)

    print()
    input(f"{Colors.YELLOW}按回车开始测试...{Colors.NC}")

    # 执行测试
    results = []
    total = len(TEST_DATASOURCES)

    for i, (ds_id, ds_name, ds_type) in enumerate(TEST_DATASOURCES, 1):
        result = test_datasource(ds_id, ds_name, ds_type, i, total)
        results.append(result)

        if i < total:
            print()
            print(f"{Colors.YELLOW}等待5秒后测试下一个数据源...{Colors.NC}")
            time.sleep(5)

    # 汇总结果
    print()
    print()
    print("=" * 70)
    print(f"{Colors.BOLD}测试结果汇总{Colors.NC}")
    print("=" * 70)

    success_count = sum(1 for r in results if r['success'])
    failed_count = total - success_count

    for result in results:
        status = f"{Colors.GREEN}✓ 成功{Colors.NC}" if result['success'] else f"{Colors.RED}✗ 失败{Colors.NC}"
        new_articles = result.get('new_articles', 0)

        print()
        print(f"{status} - {result['name']} ({result['type']})")
        if result['success']:
            print(f"  新增文章: {new_articles}篇")
        else:
            print(f"  失败原因: {result['messages'][-1]}")

    print()
    print("=" * 70)
    print(f"总数: {total} | {Colors.GREEN}成功: {success_count}{Colors.NC} | {Colors.RED}失败: {failed_count}{Colors.NC}")

    # 数据库统计
    total_articles = get_article_count()
    print()
    print(f"数据库总文章数: {total_articles}")

    if failed_count == 0:
        print()
        print(f"{Colors.GREEN}{Colors.BOLD}🎉 所有数据源测试通过！{Colors.NC}")
        return 0
    else:
        print()
        print(f"{Colors.YELLOW}部分数据源测试失败，需要检查配置{Colors.NC}")
        return 1

if __name__ == "__main__":
    try:
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}测试被用户中断{Colors.NC}")
        sys.exit(130)
    except Exception as e:
        print(f"{Colors.RED}发生错误: {e}{Colors.NC}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
