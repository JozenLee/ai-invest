#!/bin/bash
# 迁移现有influencer数据到新schema

echo "=== Influencer Data Migration Script ==="
echo ""

# 1. 运行Prisma迁移
echo "Step 1: Running database migration..."
npx prisma migrate deploy

if [ $? -ne 0 ]; then
  echo "Error: Prisma migration failed"
  exit 1
fi

echo "Migration completed successfully"
echo ""

# 2. 为现有记录设置默认值
echo "Step 2: Setting default values for existing records..."

# 检查数据库文件是否存在
if [ ! -f "prisma/dev.db" ]; then
  echo "Warning: Database file not found at prisma/dev.db"
  echo "Skipping default value updates"
else
  sqlite3 prisma/dev.db << 'EOF'
UPDATE Influencer
SET scheduleType = 'polling',
    dailyFetchTimes = NULL,
    dataRetentionDays = 30
WHERE scheduleType IS NULL;
EOF

  if [ $? -eq 0 ]; then
    echo "Default values set successfully"
  else
    echo "Warning: Could not update default values"
  fi
fi

echo ""
echo "=== Migration completed! ==="
echo ""
echo "Next steps:"
echo "1. Review influencer configurations in the admin panel"
echo "2. Adjust schedule strategies as needed"
echo "3. Monitor the data cleanup task logs"
echo ""
