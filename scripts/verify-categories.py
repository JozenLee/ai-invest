#!/usr/bin/env python3
"""
分类配置验证脚本（Python版本）
验证 data-service/config/categories.py 配置的正确性
"""

import sys
sys.path.insert(0, 'data-service')

from config.categories import (
    CATEGORIES,
    CATEGORY_GROUPS,
    get_all_category_codes,
    get_all_category_ids,
    get_categories_by_group,
    get_category_by_code,
    generate_ai_category_prompt
)

def main():
    print("=" * 60)
    print("分类配置验证（Python）")
    print("=" * 60)

    # 1. 基本统计
    print(f"\n✅ 总分类数: {len(CATEGORIES)}")
    print(f"✅ 分组数: {len(CATEGORY_GROUPS)}")

    # 2. 检查重复
    codes = get_all_category_codes()
    ids = get_all_category_ids()

    unique_codes = set(codes)
    unique_ids = set(ids)

    if len(codes) != len(unique_codes):
        print("❌ 发现重复的分类代码!")
        duplicates = [code for code in codes if codes.count(code) > 1]
        print(f"   重复: {set(duplicates)}")
        return False
    else:
        print("✅ 分类代码无重复")

    if len(ids) != len(unique_ids):
        print("❌ 发现重复的分类ID!")
        duplicates = [id for id in ids if ids.count(id) > 1]
        print(f"   重复: {set(duplicates)}")
        return False
    else:
        print("✅ 分类ID无重复")

    # 3. 按分组统计
    grouped = get_categories_by_group()
    print(f"\n📊 分组统计:")
    for group_key, group_info in CATEGORY_GROUPS.items():
        count = len(grouped.get(group_key, []))
        print(f"   {group_info.name}: {count}个")

    # 4. 验证分类代码列表
    print(f"\n📝 所有分类代码 ({len(codes)}个):")
    print(f"   {', '.join(codes)}")

    # 5. 测试查找函数
    print(f"\n🔍 测试查找功能:")
    test_cat = get_category_by_code('ai')
    if test_cat:
        print(f"   ✅ 找到 'ai': {test_cat.name} ({test_cat.id})")
    else:
        print(f"   ❌ 无法找到 'ai'")
        return False

    # 6. 验证AI Prompt生成
    prompt = generate_ai_category_prompt()
    if len(prompt) > 100 and "22个类别" in prompt:
        print(f"   ✅ AI Prompt生成成功 ({len(prompt)}字符)")
    else:
        print(f"   ❌ AI Prompt生成失败")
        return False

    # 7. 验证关键词
    print(f"\n🔑 关键词验证:")
    total_keywords = sum(len(cat.keywords) for cat in CATEGORIES)
    print(f"   ✅ 总关键词数: {total_keywords}")

    # 检查是否有空关键词
    empty_keywords = [cat.name for cat in CATEGORIES if not cat.keywords]
    if empty_keywords:
        print(f"   ⚠️  缺少关键词的分类: {', '.join(empty_keywords)}")

    print("\n" + "=" * 60)
    print("✅ 所有验证通过!")
    print("=" * 60)
    return True

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
