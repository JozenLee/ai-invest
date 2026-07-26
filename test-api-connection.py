"""
测试Claude API连接和配置
"""

import os
import sys
import asyncio
from pathlib import Path
from dotenv import load_dotenv

# 加载.env文件
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path)

print("=" * 80)
print("Claude API 连接诊断")
print("=" * 80)

# 1. 检查环境变量
print("\n1. 环境变量检查:")
api_key = os.getenv('ANTHROPIC_API_KEY')
base_url = os.getenv('ANTHROPIC_BASE_URL')
model = os.getenv('CLAUDE_MODEL')

print(f"   ANTHROPIC_API_KEY: {'✅ 已配置' if api_key else '❌ 未配置'}")
if api_key:
    print(f"     值: {api_key[:15]}...{api_key[-10:]}")

print(f"   ANTHROPIC_BASE_URL: {'✅ 已配置' if base_url else '❌ 未配置'}")
if base_url:
    print(f"     值: {base_url}")

print(f"   CLAUDE_MODEL: {'✅ 已配置' if model else '❌ 未配置'}")
if model:
    print(f"     值: {model}")

if not api_key:
    print("\n❌ 错误: ANTHROPIC_API_KEY 未配置")
    sys.exit(1)

# 2. 测试API连接
print("\n2. API连接测试:")

from anthropic import AsyncAnthropic

try:
    # 初始化客户端
    client_kwargs = {'api_key': api_key}
    if base_url:
        client_kwargs['base_url'] = base_url

    client = AsyncAnthropic(**client_kwargs)
    print(f"   ✅ 客户端初始化成功")
    print(f"   端点: {base_url or 'https://api.anthropic.com'}")

    # 3. 测试简单请求
    print("\n3. 发送测试请求:")
    print("   提示词: '你好，请回复OK'")

    async def test_request():
        try:
            # 使用配置的模型或回退到默认模型
            test_model = model or "claude-3-5-sonnet-20241022"
            print(f"   模型: {test_model}")

            message = await client.messages.create(
                model=test_model,
                max_tokens=100,
                messages=[
                    {"role": "user", "content": "你好，请回复OK"}
                ]
            )

            response = message.content[0].text
            print(f"   ✅ API调用成功")
            print(f"   响应: {response}")
            print(f"   Token使用: input={message.usage.input_tokens}, output={message.usage.output_tokens}")
            return True

        except Exception as e:
            print(f"   ❌ API调用失败")
            print(f"   错误类型: {type(e).__name__}")
            print(f"   错误信息: {str(e)}")

            # 解析错误详情
            if hasattr(e, 'status_code'):
                print(f"   HTTP状态码: {e.status_code}")

            if hasattr(e, 'response'):
                print(f"   响应体: {e.response}")

            return False

    success = asyncio.run(test_request())

    # 4. 总结和建议
    print("\n" + "=" * 80)
    print("诊断结果:")
    print("=" * 80)

    if success:
        print("\n✅ API连接正常，可以正常使用")
    else:
        print("\n❌ API连接失败")
        print("\n可能的原因:")
        print("  1. API代理服务账号余额不足")
        print("  2. API密钥已失效或无效")
        print("  3. 代理服务不稳定或维护中")
        print("  4. 模型名称错误或不支持")
        print("\n建议解决方案:")
        print("  方案1: 检查API代理服务状态")
        print(f"    访问: {base_url}")
        print("    检查账号余额和有效期")
        print("\n  方案2: 更换API密钥")
        print("    获取新的API密钥")
        print("    更新.env文件中的ANTHROPIC_API_KEY")
        print("\n  方案3: 切换到官方API")
        print("    在.env中设置:")
        print("    ANTHROPIC_API_KEY=<官方密钥>")
        print("    ANTHROPIC_BASE_URL=https://api.anthropic.com")
        print("    CLAUDE_MODEL=claude-3-5-sonnet-20241022")
        print("\n  方案4: 使用备用API服务")
        print("    寻找其他可用的Claude API代理服务")

        sys.exit(1)

except Exception as e:
    print(f"\n❌ 初始化失败: {e}")
    sys.exit(1)
