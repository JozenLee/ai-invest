#!/usr/bin/env python3
"""
数据源可用性检查脚本
检查所有数据源的状态
"""

import requests
import sys
from typing import Dict, List, Tuple
import time

# 数据源列表
DATASOURCES = [
    # 综合财经媒体
    ("ds_cls", "财联社", "综合财经媒体"),
    ("ds_eastmoney", "东方财富", "综合财经媒体"),
    ("ds_sina_finance", "新浪财经", "综合财经媒体"),
    ("ds_jiemian", "界面新闻", "综合财经媒体"),
    ("ds_caixin", "财新网", "综合财经媒体"),

    # 科技媒体
    ("ds_36kr", "36氪", "科技媒体"),
    ("ds_pingwest", "品玩", "科技媒体"),
    ("ds_geekpark", "极客公园", "科技媒体"),
    ("ds_leiphone", "雷锋网", "科技媒体"),

    # 社交媒体
    ("ds_weibo_tech", "微博-科技", "社交媒体"),
    ("ds_zhihu_finance", "知乎-财经", "社交媒体"),
    ("ds_xueqiu", "雪球", "社交媒体"),

    # 视频平台
    ("ds_bilibili_tech", "B站-科技区", "视频平台"),
    ("ds_youtube_tech", "YouTube-科技", "视频平台"),
    ("ds_douyin_finance", "抖音-财经", "视频平台"),
]

# API配置
NEXT_API = "http://localhost:3000"
DATA_SERVICE_API = "http://localhost:8000"

# 颜色代码
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    MAGENTA = '\033[0;35m'
    CYAN = '\033[0;36m'
    NC = '\033[0m'  # No Color
    BOLD = '\033[1m'

def check_service(name: str, url: str) -> bool:
    """检查服务是否运行"""
    try:
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            print(f"{Colors.GREEN}✓ {name} 运行正常{Colors.NC}")
            return True
        else:
            print(f"{Colors.RED}✗ {name} 返回状态码 {resp.status_code}{Colors.NC}")
            return False
    except Exception as e:
        print(f"{Colors.RED}✗ {name} 无法连接: {e}{Colors.NC}")
        return False

def check_datasource(ds_id: str, ds_name: str, category: str) -> Tuple[str, str, str, bool, str]:
    """检查单个数据源"""
    try:
        # 从Next.js API获取数据源详情
        url = f"{NEXT_API}/api/datasources"
        resp = requests.get(url, timeout=10)

        if resp.status_code == 200:
            data = resp.json()
            if data.get('success'):
                datasources = data.get('data', [])
                # 查找目标数据源
                ds = next((d for d in datasources if d['id'] == ds_id), None)

                if ds:
                    is_active = ds.get('isActive', False)
                    last_status = ds.get('lastFetchStatus', 'unknown')
                    status_label = ds.get('lastFetchStatusLabel', '未知')

                    # 判断是否可用
                    success = is_active and (last_status in ['success', None, ''] or last_status == 'unknown')
                    message = f"激活: {is_active}, 最后采集: {status_label}"

                    return (ds_id, ds_name, category, success, message)
                else:
                    return (ds_id, ds_name, category, False, "数据源不存在")
            else:
                return (ds_id, ds_name, category, False, data.get('message', '未知错误'))
        else:
            return (ds_id, ds_name, category, False, f"HTTP {resp.status_code}")

    except requests.Timeout:
        return (ds_id, ds_name, category, False, "请求超时")
    except Exception as e:
        return (ds_id, ds_name, category, False, f"错误: {str(e)[:100]}")

def main():
    """主函数"""
    print("=" * 60)
    print(f"{Colors.BOLD}  AI投资分析系统 - 数据源可用性检查{Colors.NC}")
    print("=" * 60)
    print()

    # 1. 检查服务状态
    print(f"{Colors.BLUE}[1/3] 检查服务状态...{Colors.NC}")
    print()

    next_ok = check_service("Next.js应用", f"{NEXT_API}/api/datasources")
    data_service_ok = check_service("Python数据服务", f"{DATA_SERVICE_API}/health")

    if not next_ok:
        print()
        print(f"{Colors.RED}错误: Next.js应用未启动{Colors.NC}")
        print(f"  请运行: npm run dev")
        sys.exit(1)

    if not data_service_ok:
        print()
        print(f"{Colors.YELLOW}警告: Python数据服务未启动（可选）{Colors.NC}")
        print(f"  部分功能可能受限")

    print()
    print(f"{Colors.BLUE}[2/3] 检查所有数据源...{Colors.NC}")
    print()

    # 2. 检查所有数据源
    results = []
    total = len(DATASOURCES)

    for i, (ds_id, ds_name, category) in enumerate(DATASOURCES, 1):
        print(f"[{i}/{total}] 检查 {ds_name}...", end=" ", flush=True)
        result = check_datasource(ds_id, ds_name, category)
        results.append(result)

        _, _, _, success, _ = result
        if success:
            print(f"{Colors.GREEN}✓{Colors.NC}")
        else:
            print(f"{Colors.RED}✗{Colors.NC}")

    # 3. 汇总结果
    print()
    print(f"{Colors.BLUE}[3/3] 检查结果汇总{Colors.NC}")
    print("=" * 60)

    # 按类别分组
    by_category: Dict[str, List] = {}
    for result in results:
        ds_id, ds_name, category, success, message = result
        if category not in by_category:
            by_category[category] = []
        by_category[category].append((ds_name, success, message))

    # 显示结果
    total_count = 0
    success_count = 0
    failed_count = 0

    for category, items in by_category.items():
        print()
        print(f"{Colors.CYAN}{Colors.BOLD}{category}:{Colors.NC}")
        print("-" * 60)

        for ds_name, success, message in items:
            total_count += 1
            if success:
                success_count += 1
                icon = f"{Colors.GREEN}✓{Colors.NC}"
                status = f"{Colors.GREEN}可用{Colors.NC}"
            else:
                failed_count += 1
                icon = f"{Colors.RED}✗{Colors.NC}"
                status = f"{Colors.RED}不可用{Colors.NC}"

            print(f"  {icon} {ds_name:<20} {status}")
            if not success or "failed" in message.lower():
                print(f"     {Colors.YELLOW}↳ {message}{Colors.NC}")

    # 总结
    print()
    print("=" * 60)
    print(f"{Colors.BOLD}检查完成{Colors.NC}")
    print("=" * 60)
    print(f"总数: {total_count}")
    print(f"{Colors.GREEN}成功: {success_count}{Colors.NC}")
    print(f"{Colors.RED}失败: {failed_count}{Colors.NC}")

    if failed_count == 0:
        print()
        print(f"{Colors.GREEN}{Colors.BOLD}🎉 所有数据源都可用！{Colors.NC}")
        return 0
    else:
        success_rate = (success_count / total_count * 100)
        print()
        print(f"{Colors.YELLOW}成功率: {success_rate:.1f}%{Colors.NC}")

        if success_rate >= 80:
            print(f"{Colors.YELLOW}大部分数据源可用{Colors.NC}")
            return 0
        else:
            print(f"{Colors.RED}多个数据源不可用，需要检查配置{Colors.NC}")
            return 1

if __name__ == "__main__":
    try:
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}检查被用户中断{Colors.NC}")
        sys.exit(130)
    except Exception as e:
        print(f"{Colors.RED}发生错误: {e}{Colors.NC}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
