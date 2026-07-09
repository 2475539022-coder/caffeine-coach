# Stage 6.3 Calculation and Rule Evaluation

## 1. 阶段名称

Stage 6.3：计算与规则一致性测试

## 2. 阶段目标

验证 Caffeine Coach 的确定性计算和状态规则是否稳定。评测范围包括咖啡因残留、睡前残留、风险规则、记忆规则、日历规则和数据隔离规则。

本阶段只记录结果，不修改业务逻辑。

## 3. 新增规则用例

| 文件 | 覆盖内容 | 条数 |
| --- | --- | ---: |
| `evaluation/rules/caffeine_calculation_cases.json` | 残留计算、半衰期、睡前残留、风险阈值 | 14 |
| `evaluation/rules/memory_rule_cases.json` | 常喝饮品、no_match 状态流转 | 13 |
| `evaluation/rules/calendar_rule_cases.json` | 日历重算、日期详情、反馈归属 | 10 |
| `evaluation/rules/data_isolation_cases.json` | 模拟、pending no_match、custom drink 数据隔离 | 10 |

总计：47 条。

## 4. 评测指标

| 指标 | 结果 |
| --- | --- |
| Calculation Consistency | 100% |
| Rule Pass Rate | 100% |
| Boundary Case Pass Rate | 100% |
| Data Isolation Pass Rate | 100% |

## 5. 发现的问题

当前离线规则用例未发现失败项。

## 6. 当前边界

本阶段不做：

- 不评测文案好坏；
- 不修改计算公式；
- 不修改记忆规则；
- 不修复失败用例；
- 不接入 LLM；
- 不调整前端 UI。

## 7. 验收结果

| 验收项 | 结果 |
| --- | --- |
| 计算测试覆盖正常值和边界值 | 通过 |
| 记忆规则完整 | 通过 |
| 日历规则完整 | 通过 |
| 数据隔离测试完整 | 通过 |
| 每条测试有标准答案 | 通过 |
| 指标可复算 | 通过 |
| 失败项已记录但未修复 | 通过 |

## 8. 阶段结论

Stage 6.3 已完成计算与规则一致性测试。当前可以进入 Stage 6.4：错误恢复与 Bad Case 归因。
