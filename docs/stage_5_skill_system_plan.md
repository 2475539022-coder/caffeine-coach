# Stage 5：Skill 系统规划

## 1. 阶段名称

Stage 5.0：Skill 规范与 Context Contract

## 2. 阶段目标

本阶段目标不是新增业务功能，而是为后续 Skill 模块化建立统一规范、目录结构、上下文压缩契约和验收标准。

本阶段完成：

- 新增 `skills/` 目录；
- 新增 Skill 总说明；
- 新增 Skill 模板；
- 定义 Stage 5 Skill 系统规划；
- 定义 4 个核心 Skill 的 compact context；
- 明确 Skill / Workflow / Tool / Agent 的关系；
- 明确当前不做的内容和验收标准。

## 3. 为什么要引入 Skill

Caffeine Coach 已完成 Stage 4 的个性化记忆闭环：

- 摄入记录；
- 状态日历；
- 睡眠反馈与即时不适反馈；
- 常喝饮品记忆；
- no_match / custom drink 记忆；
- 敏感度解释；
- Agent / Tool 初步结构。

随着能力增多，如果所有逻辑都由一个 Agent 直接读取完整上下文，会出现：

- 上下文过长；
- 任务边界不清；
- 输出风格不稳定；
- 工具调用规则分散；
- 用户侧容易暴露技术机制；
- 后续验收困难。

Skill 的作用是把某类任务沉淀为稳定能力模块，让 Router 可以按意图选择对应 Skill，并由 Context Builder 提供精简上下文。

## 4. Skill / Workflow / Tool / Agent 的区别

### Skill

Skill 是能力模块，定义某类任务的专用说明书。

它包含：

- 适用场景；
- 输入上下文；
- 工具使用规则；
- 输出结构；
- 禁止事项；
- 失败兜底；
- 验收用例。

### Workflow

Workflow 是完整任务流程。

例如：

```text
用户点击喝前模拟 → 选择饮品 → 计算睡前残留 → 生成风险建议 → 展示替代方案
```

Workflow 可以调用多个 Skill。

### Tool

Tool 是可执行函数或数据能力。

例如：

- 读取今日记录；
- 查询饮品库；
- 计算当前残留；
- 模拟喝下一杯后的风险。

Tool 负责做事，Skill 负责说明如何使用 Tool。

### Agent

Agent 是调度、判断和执行主体。

Agent 负责：

- 接收用户问题或产品内部问题；
- 识别意图；
- 选择 Skill；
- 调用工具；
- 组织最终输出。

## 5. Stage 5 的 7 个子阶段

### Stage 5.0：Skill 规范与 Context Contract

建立目录、模板、规划文档和输入上下文契约。

### Stage 5.1：Sleep Risk Advisor Skill

沉淀睡眠风险、睡前残留和今日饮用建议的 Skill。

### Stage 5.2：Drink Record Parser Skill

沉淀饮品搜索、常喝饮品、custom drink 和 no_match 兜底的 Skill。

### Stage 5.3：Weekly Review Writer Skill

沉淀洞察页周复盘、趋势总结和建议解读的 Skill。

### Stage 5.4：Alternative Drink Recommender Skill

沉淀高风险情况下的半杯、低因和替代饮品建议 Skill。

### Stage 5.5：Skill Router 与 Context Builder

实现轻量 Router，根据意图选择 Skill，并为 Skill 生成 compact context。

### Stage 5.6：Skill 验收与评估体系

为每个 Skill 建立固定测试用例、Bad Case 模板和验收记录。

## 6. 计划设计的 4 个 Skill

### 6.1 Sleep Risk Advisor

适用场景：

- 首页今日饮用建议；
- 喝前模拟；
- 为什么不建议继续喝；
- 睡前残留解释。

输出：

- 结论；
- 风险原因；
- 数据依据；
- 建议行动；
- 必要时给出低风险替代建议。

### 6.2 Drink Record Parser

适用场景：

- 记录一杯；
- 饮品库搜索；
- 常喝饮品复用；
- no_match 和自定义饮品确认。

输出：

- 匹配候选；
- 咖啡因估算；
- 置信说明；
- 是否需要用户确认；
- no_match 兜底动作。

### 6.3 Weekly Review Writer

适用场景：

- 洞察页；
- 近 7 天摄入趋势；
- 睡前残留趋势；
- 反馈与敏感度变化解释。

输出：

- 本周结论；
- 趋势摘要；
- 风险天数；
- 主要证据；
- 下周建议。

### 6.4 Alternative Drink Recommender

适用场景：

- 当前睡眠风险中高；
- 今日已接近推荐量；
- 模拟饮品不建议完整摄入；
- 用户仍想喝点什么。

输出：

- 半杯建议；
- 低因建议；
- 无咖啡因替代；
- 推荐原因；
- 需要用户确认的动作。

## 7. Context Compact 在 Skill 中的作用

Context Compact 是 Skill 的输入契约。

它确保每个 Skill 只拿到必要数据：

- 避免完整 App 状态进入上下文；
- 避免 Tool、Agent、UI 概念混杂；
- 避免 Skill 误用不相关数据；
- 降低后续真实 LLM 接入成本；
- 让验收用例可控。

## 8. Context Contract

### 8.1 Sleep Risk Advisor Context

```ts
type SleepRiskAdvisorContext = {
  userProfile: {
    sleepTime: string;
    sensitivity: string;
    halfLife: number;
    reminderStrictness: string;
  };
  todayIntakeRecords: [];
  remainingCaffeine: number;
  sleepRisk: string;
  recentFeedbackSummary: {
    sleepAffectedDays: number;
    discomfortCount: number;
  };
};
```

用途：

- 判断今天还能不能喝；
- 解释睡前残留和睡眠风险；
- 给出谨慎、克制的行动建议。

### 8.2 Drink Record Parser Context

```ts
type DrinkRecordParserContext = {
  drinkLibrary: [];
  customDrinks: [];
  frequentDrinks: [];
  noMatchMemory: [];
  currentTime: string;
};
```

用途：

- 匹配饮品候选；
- 复用常喝饮品；
- 处理自定义饮品；
- 处理 no_match 兜底。

### 8.3 Weekly Review Writer Context

```ts
type WeeklyReviewWriterContext = {
  weekRange: string;
  totalCaffeine: number;
  dailyStatusSummary: [];
  frequentDrinks: [];
  feedbackSummary: {};
  sensitivityExplanation: {};
};
```

用途：

- 生成近 7 天总结；
- 解释睡前残留趋势；
- 结合反馈生成复盘建议；
- 支持洞察页结论卡。

### 8.4 Alternative Drink Recommender Context

```ts
type AlternativeDrinkRecommenderContext = {
  userProfile: {};
  currentSleepRisk: string;
  remainingCaffeine: number;
  drinkLibrary: [];
  frequentDrinks: [];
  knownLowCaffeineOptions: [];
};
```

用途：

- 在不适合继续喝完整一杯时，推荐半杯、低因或无咖啡因替代；
- 避免空泛地说“别喝了”；
- 保持用户仍有可执行选择。

## 9. Skill Loading 的基本机制

后续可采用轻量机制：

1. Router 识别意图；
2. 选择 Skill 名称；
3. Context Builder 生成对应 compact context；
4. Agent 读取 Skill 规则；
5. Agent 按 Skill 约束调用 Tool；
6. Response Generator 将 Skill 输出转换为前台卡片、折叠依据或建议行动。

当前 Stage 5.0 只做文档化，不实现真实加载器。

## 10. Agent Teams 的轻量化边界

本项目暂不引入复杂 Agent Team。

后续如需拆分，可以保持轻量：

- 一个 Router；
- 一个 Context Builder；
- 若干 Skill；
- 一个 Response Generator；
- 必要时提供评估器用于离线验收。

不做多 Agent 争论、不做自治任务队列、不做后台自动执行写操作。

## 11. 当前不做什么

Stage 5.0 不做：

- 新增业务页面；
- 接入真实 LLM；
- 新增复杂 Agent Team；
- 修改咖啡因计算逻辑；
- 修改状态日历、反馈、饮品记忆逻辑；
- 修改 no_match 逻辑；
- 做推荐算法；
- 做医疗判断；
- 在用户主界面展示 Skill / Agent / Tool 等技术词。

## 12. 验收标准

本阶段验收标准：

- `skills/README.md` 已新增；
- `skills/skill_template.md` 已新增；
- `docs/stage_5_skill_system_plan.md` 已新增；
- Skill / Workflow / Tool / Agent 区分清楚；
- 4 个 Skill 的规划清楚；
- Context Contract 清楚；
- 没有修改业务代码；
- `npm run build` 通过；
- `git diff --check` 通过。

## 13. 阶段结论

Stage 5.0 建立了 Caffeine Coach 后续 Skill 模块化的基础规范。

从这个阶段开始，新增能力应优先回答：

```text
它属于哪个 Skill？
它需要什么 compact context？
它会调用哪些 Tool？
它如何输出给前台？
它的边界和验收用例是什么？
```

Stage 5.0 完成后，可以进入 Stage 5.1：Sleep Risk Advisor Skill。
