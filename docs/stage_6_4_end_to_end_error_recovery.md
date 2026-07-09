# Stage 6.4 End-to-End and Error Recovery

## 1. 阶段名称

Stage 6.4：端到端任务评测与 Error Recovery

## 2. 阶段目标

验证 Caffeine Coach 从用户输入到最终回答的完整链路，并评测失败后的澄清、重试、fallback、降级、终止和任务拆分机制。

本阶段先评测，不直接修复问题。

## 3. 新增评测内容

新增数据集：

- `evaluation/datasets/end_to_end_cases.json`

新增 runner：

- `evaluation/runners/evaluate_end_to_end.ts`

新增结果：

- `evaluation/results/stage_6_4_e2e_results.json`
- `evaluation/results/stage_6_4_recovery_results.json`
- `evaluation/results/stage_6_4_summary.md`

## 4. 覆盖的 12 类任务

1. 标准饮品记录
2. 模糊容量记录
3. 未知饮品记录
4. 喝前模拟
5. 睡眠风险咨询
6. 明确剂量风险咨询
7. 周复盘
8. 替代饮品推荐
9. 多意图任务
10. 安全问题
11. 数据不足
12. 工具失败

## 5. 指标结果

| 指标 | 结果 |
| --- | --- |
| Task Success Rate | 33.3% |
| Recovery Trigger Accuracy | 54.5% |
| Recovery Success Rate | 54.5% |
| Clarification Effectiveness | 100% |
| Multi-intent Completion Rate | 0% |
| Safety Escalation Pass Rate | 0% |

## 6. 发现的问题

失败任务数量：8

主要问题：

- 当前离线 Agent Team 不执行真实写入，因此“确认后写入并刷新首页 / 曲线 / 日历”的完整闭环未通过。
- 多意图任务没有显式拆分。
- 工具失败没有真实 retry / degrade 执行层。
- 数据不足场景没有专门的信息缺失检测层。
- 安全问题需要更明确地停止普通推荐流程。

## 7. 当前边界

本阶段不做：

- 不直接修复 Router；
- 不修改 Skill；
- 不修改工具；
- 不修改 Context Builder；
- 不修改 Safety Reviewer；
- 不为了通过测试修改标准答案；
- 不新增无关功能。

## 8. 验收结果

| 验收项 | 结果 |
| --- | --- |
| 至少覆盖 12 类端到端任务 | 通过 |
| 多意图任务已评测 | 通过 |
| 工具失败已模拟 | 通过 |
| 数据不足已评测 | 通过 |
| Safety 升级已评测 | 通过 |
| 恢复类型有明确记录 | 通过 |
| 指标可以复算 | 通过 |
| 失败项全部进入待归因清单 | 通过 |

## 9. 阶段结论

Stage 6.4 已完成端到端任务评测与 Error Recovery 评测，可以进入 Stage 6.5。
