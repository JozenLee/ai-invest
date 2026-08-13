# 数据准确性测试套件

## 快速开始

```bash
# 数据准确性集成测试（需要服务运行）
bash data-service/tests/test_data_accuracy_integration.sh
```

## 测试文件说明

### test_data_accuracy_integration.sh
集成测试，验证实际API行为：
- ✅ API返回数据准确性
- ✅ 日期不能是未来
- ✅ 前后端数据一致性
- ✅ 数据完整性

## 覆盖范围

集成脚本覆盖市场概览、资金流向、日期有效性、数据源标识和前后端代理一致性。

## CI集成

GitHub Actions会在以下情况自动运行测试：
- Push到 main/develop 分支
- 提交 Pull Request
- 修改 data-service/ 下的文件

查看CI状态：`.github/workflows/data-accuracy.yml`

## 详细文档

数据准确性测试的集成入口为：`data-service/tests/test_data_accuracy_integration.sh`。
