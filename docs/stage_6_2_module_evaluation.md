# Stage 6.2 Module Evaluation

## 1. 阶段名称

Stage 6.2：模块级离线评测

## 2. 阶段目标

本阶段基于 Stage 6.1 的测试集，分别评测 Router、Skill、Context Builder 和 Safety Reviewer，形成模块级指标和问题清单。

本阶段不修复问题，不修改业务逻辑。

## 3. 评测模块

本阶段实际评测以下模块：

- Intent Router
- Drink Record Parser
- Sleep Risk Advisor
- Weekly Review Writer
- Alternative Drink Recommender
- Context Builder
- Safety Reviewer

## 4. 评测方法

### 4.1 Router

检查用户输入是否路由到预期 Skill，是否能识别 unknown/fallback，是否能处理多意图。

输出字段包括：输入、期望 Skill、实际 Skill、是否通过、备注。

### 4.2 Skill

以 Stage 6.1 的标准答案为依据，按模块检查字段解析、工具/规则要求、上下文要求、输出结构、安全边界和恢复动作。

### 4.3 Context Builder

检查每个 Skill 的 compact context 是否覆盖必需字段，是否存在命名差异或潜在无效数据混入风险。

### 4.4 Safety Reviewer

专项检查医学诊断、绝对承诺、未知咖啡因含量、药物或治疗建议、模拟与真实记录混淆、pending no_match 误用等风险。

## 5. 指标结果

| 模块 | 指标 | 结果 |
| --- | --- | --- |
| Router | Router Accuracy | 48.3% |
| Router | Unknown/Fallback Accuracy | 80% |
| Router | Multi-intent Handling Rate | 0% |
| Context Builder | Context Completeness | 95.7% |
| Context Builder | Context Precision | 86% |
| Context Builder | Invalid Data Leakage Rate | 8% |
| Skill | Field Accuracy | 85.9% |
| Skill | Record Intent Accuracy | 85.9% |
| Skill | Tool Call Accuracy | 63.4% |
| Skill | Rule Compliance | 63.4% |
| Skill | Explainability Score | 63.4% |
| Skill | Summary Completeness | 57.8% |
| Skill | Recommendation Relevance | 72% |
| Safety Reviewer | Safety Recall | 31.7% |
| Safety Reviewer | Safety Precision | 100% |
| Safety Reviewer | Safety Pass Rate | 31.7% |
| Safety Reviewer | False Positive Rate | 0% |

## 6. 发现的问题

本阶段共记录 123 条问题或风险备注，详见 `evaluation/results/stage_6_2_summary.md` 和四个 JSON 结果文件。

关键问题包括：

- Router 目前不支持显式多意图拆分。
- 安全优先级尚未成为独立路由层。
- Context Builder 与部分评测字段存在命名差异。
- Weekly Review 仍需端到端验证 pending no_match 和模拟记录排除。
- Safety Reviewer 需要继续平衡召回与过度拦截。

## 7. 当前边界

本阶段没有修改业务代码，也没有修复发现的问题。所有问题进入后续 Bad Case 修复或 Stage 6.3 端到端验收。

## 8. 验收结果

| 验收项 | 结果 |
| --- | --- |
| 所有模块均有评测结果 | 通过 |
| 每条用例保留期望和实际结果 | 通过 |
| 指标可以复算 | 通过 |
| Safety 有单独结果 | 通过 |
| Context Builder 有单独结果 | 通过 |
| 已形成问题清单 | 通过 |
| 没有直接修复问题 | 通过 |

## 9. 阶段结论

Stage 6.2 模块级离线评测已完成。当前可以进入 Stage 6.3：端到端任务验收。
