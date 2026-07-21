#!/bin/bash

echo "=========================================="
echo "实时监控 - 等待其他电脑访问"
echo "=========================================="
echo ""
echo "请在其他电脑上访问: http://100.80.210.104:3000/dashboard"
echo "按 Ctrl+C 停止监控"
echo ""
echo "--- 开始监控 ---"
echo ""

# 清空之前的日志
> /tmp/access-monitor.log

# 同时监控多个日志源
tail -f \
  .next/dev/logs/next-development.log \
  /tmp/python-service.log \
  2>/dev/null | while read line; do
    # 过滤掉DevTools提示
    if [[ ! "$line" =~ "React DevTools" ]] && [[ ! "$line" =~ "httpx" ]] && [[ ! "$line" =~ "anthropic" ]]; then
        echo "$line" | tee -a /tmp/access-monitor.log
    fi
done
