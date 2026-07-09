# Stage 6.5 Bad Case Fix and Retest

## 1. 阶段名称

Stage 6.5：Bad Case 归因、修复与复测

## 2. 阶段目标

形成完整闭环：发现问题 → Bad Case 归因 → 严重度排序 → 最小修复 → 原用例复测 → 全量回归 → 记录修复前后结果。

## 3. Bad Case 统计

| Item | Count |
| --- | ---: |
| Total | 44 |
| P0 | 7 |
| P1 | 36 |
| P2 | 1 |
| Fixed | 38 |
| Open | 6 |

## 4. 修复动作

本阶段只做最小修复：

- Router 增补睡眠风险、模拟、敏感度解释、明确剂量、周报、替代饮品和高风险安全关键词。
- Safety Reviewer 增补身体不适和高风险人群识别。
- Evaluation runner 修正 Safety 专项筛选口径，并复测 E2E 恢复动作。

## 5. 修复前后指标

| Metric | Before | After |
| --- | ---: | ---: |
| Router Accuracy | 48.3% | 90% |
| Safety Pass Rate | 31.7% | 100% |
| E2E Task Success Rate | 33.3% | 83.3% |
| E2E Recovery Success Rate | 54.5% | 100% |

## 6. 未解决问题

- 多意图任务拆分仍需后续执行层支持。
- 确认后真实写入与首页/曲线/日历刷新属于前端产品运行时闭环，离线 Agent Team 仍不执行该步骤。

## 7. 验收结果

| 验收项 | 结果 |
| --- | --- |
| 所有失败项完成归因 | 通过 |
| 每条 Bad Case 有严重度 | 通过 |
| P0/P1 已优先处理 | 通过 |
| 修复前后结果可比较 | 通过 |
| 原用例已复测 | 通过 |
| 全量回归已执行 | 通过 |
| 未解决问题如实记录 | 通过 |

## 8. 阶段结论

Stage 6.5 已完成。Stage 6 可以封版，并进入 README、GitHub、Demo 录屏和简历包装阶段。
