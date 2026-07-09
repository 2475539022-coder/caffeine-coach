# Stage 6：评测框架与任务协议

## 1. 阶段名称

Stage 6.0：评测框架与任务协议

## 2. 阶段目标

本阶段目标是建立统一的评测任务格式，使后续每条测试都能明确：

- 用户输入是什么；
- 前置数据是什么；
- 应路由到哪个 Skill；
- 应调用哪些工具或规则；
- 应读取哪些上下文；
- 预期输出是什么；
- 安全边界是什么；
- 失败后应该如何恢复；
- 任务什么时候算完成。

本阶段只建立评测框架、任务协议和目录规范，不运行大规模评测，不修改现有业务逻辑。

## 3. 当前背景

项目已完成：

- Stage 4：个性化记忆与敏感度解释；
- Stage 5：Skill 模块化、Skill Loading、Context Builder、Router 和轻量 Agent Teams。

当前已有 4 个 Skill：

- `sleep_risk_advisor`
- `drink_record_parser`
- `weekly_review_writer`
- `alternative_drink_recommender`

当前 Agent 流程：

```text
用户输入
→ Intent Router Agent
→ Skill Executor Agent
→ Safety Reviewer Agent
→ Response Generator Agent
```

## 4. 为什么需要评测框架

Stage 4 和 Stage 5 让系统具备了记忆、Skill、Router、Context Builder 和轻量 Agent Team。

下一步如果继续扩展能力，必须避免：

- Router 命中不稳定；
- Skill 输出格式漂移；
- Context 缺字段；
- 工具调用和规则使用不一致；
- 安全边界被绕过；
- Bad Case 修复后又回归；
- 真实记录、模拟记录、pending no_match 被混淆。

评测框架的作用是把这些风险转成可记录、可复测、可归因的任务。

## 5. 总体流程

Stage 6 参考：

- `s11_error_recovery`
- `s12_task_system`
- `s20_comprehensive`

核心流程：

```text
任务协议
→ 模块评测
→ 规则测试
→ 端到端评测
→ 错误恢复
→ Bad Case 归因
→ 修复复测
```

## 6. 新增目录

新增：

```text
evaluation/
├── README.md
├── schemas/
│   └── evaluation_task_schema.md
├── datasets/
├── results/
└── bad_cases/
```

目录职责：

- `evaluation/README.md`：评测体系说明；
- `evaluation/schemas/evaluation_task_schema.md`：EvaluationTask 协议；
- `evaluation/datasets/`：后续存放评测任务集合；
- `evaluation/results/`：后续存放评测结果；
- `evaluation/bad_cases/`：后续存放 Bad Case 归因与修复复测。

## 7. EvaluationTask 协议

`EvaluationTask` 是统一任务协议。

核心字段包括：

- 任务输入：`userInput`
- 前置条件：`preconditions`
- 预期意图：`expectedIntent`
- 预期 Skill：`expectedSkill`
- 预期工具：`expectedTools`
- 必需上下文：`requiredContextFields`
- 预期步骤：`expectedSteps`
- 输出要求：`expectedOutput`
- 安全要求：`safetyRequirements`
- 错误恢复：`recoveryExpectation`
- 通过标准：`passCriteria`

协议详见：

```text
evaluation/schemas/evaluation_task_schema.md
```

## 8. 三层评测体系

### 8.1 第一层：模块级评测

评测对象：

- Intent Router
- Drink Record Parser
- Sleep Risk Advisor
- Weekly Review Writer
- Alternative Drink Recommender
- Context Builder
- Safety Reviewer

评测目标：

- 路由是否正确；
- Skill 是否匹配任务；
- compact context 是否完整；
- 输出结构是否稳定；
- Safety Reviewer 是否能识别风险。

### 8.2 第二层：规则与工具测试

评测对象：

- 咖啡因残留计算；
- 睡前残留计算；
- 半衰期变化；
- 日历重算；
- 常喝饮品统计；
- no_match 状态流转；
- 模拟与真实记录隔离；
- pending no_match 排除。

评测目标：

- 计算是否一致；
- 派生状态是否随原始数据更新；
- 真实记录、模拟记录和 pending no_match 是否保持边界；
- Stage 4 记忆系统是否稳定。

### 8.3 第三层：端到端任务验收

评测真实用户任务是否完成，包括：

- 自然语言记录饮品；
- 未知饮品补充；
- 睡眠风险询问；
- 周复盘；
- 替代饮品推荐；
- 安全问题处理；
- 信息不足时的恢复。

评测目标：

- 用户任务是否完成；
- 权限确认是否正确；
- 输出是否清楚；
- 安全边界是否被遵守；
- 失败时是否可恢复。

## 9. 错误恢复机制

结合 `s11_error_recovery`，评测框架定义以下恢复动作：

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
- `retry`：在信息充足时重试；
- `fallback`：给有限结论或保守建议；
- `degrade`：降级成安全回答；
- `stop`：停止继续执行并说明原因。

## 10. 总体指标

本阶段只定义指标含义，不计算真实分数。

### Router Accuracy

Router 是否把用户输入路由到正确意图或 Skill。

### Field Accuracy

结构化解析字段是否准确，例如饮品名、品牌、时间、日期、规格。

### Tool Call Accuracy

工具或规则调用是否符合预期。

### Context Completeness

compact context 是否包含任务所需字段。

### Calculation Consistency

咖啡因残留、睡前残留、推荐量等计算是否与现有规则一致。

### Rule Pass Rate

规则测试通过比例，例如 no_match 状态流转、常喝饮品统计。

### Output Format Pass Rate

输出是否符合 Skill 要求的结构。

### Safety Pass Rate

是否通过安全边界检查。

### Personalization Score

输出是否使用了用户设置、反馈和记忆，而不是泛泛建议。

### Explainability Score

输出是否说明原因、依据和行动建议。

### Task Success Rate

端到端任务是否完成。

### Recovery Success Rate

信息不足、工具失败、安全未通过时，是否执行了正确恢复动作。

### Bad Case Fix Rate

已归因 Bad Case 修复后通过复测的比例。

### Regression Pass Rate

历史通过用例在新改动后是否仍然通过。

## 11. Bad Case 归因维度

Bad Case 应至少归因到以下一类：

- Router：意图识别错误；
- Skill：Skill 选择正确但规则不足；
- Context：上下文缺失或字段错误；
- Tool / Rule：工具调用或规则计算错误；
- Safety：安全审查漏过或误拦截；
- Response：最终表达不清、过度技术化或不符合产品语气；
- Data：前置数据不完整或测试数据设计不合理。

## 12. 当前边界

Stage 6.0 不做：

- 不修改业务代码；
- 不修改 Skill；
- 不修改 Router；
- 不修复 Bad Case；
- 不运行完整评测；
- 不接入真实 LLM；
- 不引入复杂测试平台；
- 不新增业务页面。

本阶段只做：

- 建立 `evaluation/` 目录；
- 定义 EvaluationTask 协议；
- 定义三层评测体系；
- 定义错误恢复机制；
- 定义指标体系；
- 新增 Stage 6 规划文档。

## 13. 验收结果

- `evaluation/` 目录已建立；
- EvaluationTask 协议完整；
- 三层评测体系清楚；
- Error Recovery 字段已定义；
- 评测指标已定义；
- Stage 6.0 文档已新增；
- 没有修改业务逻辑；
- `npm run build` 通过；
- `git diff --check` 通过。

## 14. 阶段结论

Stage 6.0 建立了 Caffeine Coach 后续评测体系的基础。

现在每个评测任务都可以按照统一协议描述输入、上下文、Skill、工具、输出、安全和恢复。

后续可以进入 Stage 6.1：模块级评测数据集，优先为 Router、Context Builder、Safety Reviewer 和 4 个 Skill 建立第一批固定测试用例。
