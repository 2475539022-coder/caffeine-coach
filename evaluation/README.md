# Caffeine Coach Evaluation

本目录用于沉淀 Caffeine Coach 的评测框架、任务协议、数据集、结果和 Bad Case。

Stage 6.0 只建立规范，不运行大规模评测，不引入复杂测试平台。

## 1. 评测目标

评测框架用于确认：

- 用户输入是否被正确路由到 Skill；
- compact context 是否完整；
- 工具或规则是否被正确使用；
- 输出是否符合格式；
- 安全边界是否被遵守；
- 信息不足、工具失败或多意图输入时是否能正确恢复；
- Bad Case 修复后是否能通过回归。

## 2. 目录结构

```text
evaluation/
├── README.md
├── schemas/
│   └── evaluation_task_schema.md
├── datasets/
├── results/
└── bad_cases/
```

目录说明：

- `schemas/`：评测任务协议和字段说明；
- `datasets/`：后续存放评测任务集合；
- `results/`：后续存放评测执行结果；
- `bad_cases/`：后续存放 Bad Case 归因、修复和复测记录。

## 3. 三层评测体系

### 第一层：模块级评测

评测对象：

- Intent Router
- Drink Record Parser
- Sleep Risk Advisor
- Weekly Review Writer
- Alternative Drink Recommender
- Context Builder
- Safety Reviewer

关注问题：

- 输入是否路由到正确 Skill；
- 解析字段是否准确；
- compact context 是否包含必要字段；
- Safety Reviewer 是否能识别边界风险；
- 输出结构是否稳定。

### 第二层：规则与工具测试

评测对象：

- 咖啡因残留计算；
- 睡前残留计算；
- 半衰期变化；
- 日历重算；
- 常喝饮品统计；
- no_match 状态流转；
- 模拟与真实记录隔离；
- pending no_match 排除。

关注问题：

- 规则计算是否一致；
- 真实记录与模拟记录是否隔离；
- pending no_match 是否被排除在真实摄入统计之外；
- 新增、删除记录后派生状态是否更新。

### 第三层：端到端任务验收

评测真实用户任务是否完成，包括：

- 自然语言记录饮品；
- 未知饮品补充；
- 睡眠风险询问；
- 周复盘；
- 替代饮品推荐；
- 安全问题处理；
- 信息不足时的恢复。

关注问题：

- 用户任务是否被完成；
- 过程是否遵守权限和确认边界；
- 输出是否对普通用户可理解；
- 是否避免暴露 Agent / Tool / Skill 等技术词。

## 4. 错误恢复机制

结合 `s11_error_recovery`，评测任务需要声明错误场景和恢复动作。

| 错误场景 | 恢复动作 |
|---|---|
| 饮品名称不明确 | `clarify` |
| 容量不明确 | `clarify` 或确认默认值 |
| 咖啡因含量未知 | 不编造，进入补充流程 |
| 睡眠时间缺失 | `fallback`，给保守建议 |
| Router 不确定 | `fallback`，不强行路由 |
| 工具执行失败 | `stop` 或 `degrade`，不直接猜 |
| Safety 未通过 | `degrade` 为安全回答 |
| 数据不足 | 输出有限结论 |
| 多意图输入 | 拆分子任务或要求确认 |

恢复动作定义：

- `clarify`：追问用户补充关键信息；
- `retry`：在信息充足时重试同一工具或步骤；
- `fallback`：给出保守、有限的回答；
- `degrade`：降级为安全回答，避免高风险表达；
- `stop`：停止继续执行，说明原因。

## 5. Bad Case 处理流程

```text
发现 Bad Case
↓
记录输入、前置数据和实际输出
↓
归因到 Router / Context / Tool / Skill / Safety / Response
↓
提出修复方案
↓
修复后复测
↓
加入回归集
```

Bad Case 不应只记录“错了”，必须记录：

- 期望行为；
- 实际行为；
- 失败原因；
- 影响范围；
- 修复方式；
- 复测结果。

## 6. 当前边界

Stage 6.0 不做：

- 不修改业务代码；
- 不修改 Skill；
- 不修改 Router；
- 不修复 Bad Case；
- 不运行完整评测；
- 不接入真实 LLM；
- 不引入复杂测试平台；
- 不新增业务页面。

当前只定义：

- 评测目录；
- EvaluationTask 协议；
- 三层评测体系；
- 错误恢复动作；
- 指标体系；
- Stage 6 规划。
