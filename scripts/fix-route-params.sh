#!/bin/bash
# 批量修复 Next.js 动态路由参数类型

echo "修复 Next.js 动态路由参数类型..."

# 需要修复的文件列表
files=(
  "src/app/api/datasources/[id]/route.ts"
  "src/app/api/datasources/[id]/test/route.ts"
  "src/app/api/influencers/[id]/route.ts"
  "src/app/api/influencers/[id]/fetch/route.ts"
  "src/app/api/influencers/[id]/posts/route.ts"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "处理: $file"
    # 替换 { params }: { params: { id: string } } 为 { params }: { params: Promise<{ id: string }> }
    sed -i.bak 's/{ params }: { params: { id: string } }/{ params }: { params: Promise<{ id: string }> }/g' "$file"
    # 添加 await params 如果还没有
    sed -i.bak 's/const { id } = params;/const { id } = await params;/g' "$file"
    rm -f "${file}.bak"
  fi
done

echo "完成！"
