# 测试目录

## 结构说明

```
tests/
├── unit/           # 单元测试
├── integration/    # 集成测试
└── README.md       # 本文件
```

## 运行测试

```bash
# 运行所有测试
pytest tests/

# 运行单元测试
pytest tests/unit/

# 运行集成测试
pytest tests/integration/

# 运行特定测试文件
pytest tests/unit/test_example.py
```

## 测试规范

- 单元测试：测试单个函数或类的功能
- 集成测试：测试多个组件的协同工作
- 测试文件命名：`test_*.py` 或 `*_test.py`
- 测试函数命名：`test_*`
