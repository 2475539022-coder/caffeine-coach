# Stage 6.2 Module Evaluation Summary

## 1. 阶段名称

Stage 6.2：模块级离线评测

## 2. 评测范围

本阶段基于 Stage 6.1 的 60 条 EvaluationTask，对以下模块做离线评测：

- Intent Router
- Drink Record Parser Skill
- Sleep Risk Advisor Skill
- Weekly Review Writer Skill
- Alternative Drink Recommender Skill
- Context Builder
- Safety Reviewer

本阶段只记录问题，不修改业务逻辑。

## 3. 指标结果

| 模块 | 核心指标 | 结果 |
| --- | --- | --- |
| Intent Router | Router Accuracy | 48.3% |
| Intent Router | Unknown/Fallback Accuracy | 80% |
| Intent Router | Multi-intent Handling Rate | 0% |
| Context Builder | Context Completeness | 95.7% |
| Context Builder | Context Precision | 86% |
| Context Builder | Invalid Data Leakage Rate | 8% |
| Skill Contracts | Field Accuracy | 85.9% |
| Skill Contracts | Tool Call Accuracy | 63.4% |
| Skill Contracts | Summary Completeness | 57.8% |
| Skill Contracts | Recommendation Relevance | 72% |
| Safety Reviewer | Safety Recall | 31.7% |
| Safety Reviewer | Safety Precision | 100% |
| Safety Reviewer | Safety Pass Rate | 31.7% |

## 4. 主要问题清单

共记录 123 条模块级问题或风险备注。

### 4.1 Router

- 当前 Router 只返回单一 Skill，多意图用例未形成显式拆分计划。
- 部分安全类输入仍会进入普通 Skill，缺少安全优先路由层。
- 部分“想喝 / 模拟 / 已喝”边界依赖关键词，仍需端到端复测。

### 4.2 Context Builder

- Context Builder 已具备四类 Skill 的 compact context 雏形。
- Weekly Review 依赖 dailyStatusMemory 快照，后续仍需验证模拟记录和 pending no_match 不会进入上游快照。
- Alternative Drink Recommender 的上下文字段命名与部分测试集期望存在差异，如 currentSleepRisk 与 currentState.sleepRisk。

### 4.3 Skill

- Drink Record Parser 对模糊饮品、模糊容量、no_match 场景需要更强澄清能力。
- Sleep Risk Advisor 的上下文与禁止事项覆盖较好，但高风险安全表达仍需 Safety Reviewer 兜底。
- Weekly Review Writer 需要继续验证数据不足、pending no_match 排除和反馈归属。
- Alternative Drink Recommender 需要明确未知咖啡因含量不能作为低因推荐。

### 4.4 Safety Reviewer

- 高风险输入能被多数规则捕获。
- 仍需区分“安全边界提醒”和“过度拦截”，避免普通模糊输入被误判为安全问题。
- 对怀孕、过敏、药物、催吐、胸痛等问题必须降级为安全回答。

## 5. 结果文件

- `evaluation/results/stage_6_2_router_results.json`
- `evaluation/results/stage_6_2_context_results.json`
- `evaluation/results/stage_6_2_skill_results.json`
- `evaluation/results/stage_6_2_safety_results.json`
- `evaluation/results/stage_6_2_summary.md`

## 6. 阶段边界

本阶段未修改 Router、Skill、Context Builder、Safety Reviewer 或业务代码。发现的问题只记录，不在本阶段修复。

## 7. 阶段结论

Stage 6.2 已完成模块级离线评测。当前系统具备可复算的模块指标和问题清单，可以进入 Stage 6.3 端到端任务验收，并在后续 Bad Case 阶段按问题优先级修复。
