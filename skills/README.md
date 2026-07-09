# Caffeine Coach Skills

## Skill 是什么

在 Caffeine Coach 中，Skill 是某类任务的专用能力模块。

它不是一个完整页面，也不是一个独立 Agent，而是一份可被 Router / Agent 调用的说明书，定义：

- 适用场景；
- 输入上下文要求；
- 可用工具和数据；
- 输出结构；
- 输出风格；
- 禁止事项；
- 失败兜底；
- 验收用例。

Skill 的目标是让后续能力可以模块化沉淀，避免每次都把完整项目上下文塞给 Agent。

## Skill 和 Workflow 的区别

Skill 是能力模块，回答“这类任务应该怎么做”。

Workflow 是完整任务流程，回答“从开始到结束要按什么步骤执行”。

例如：

- `Sleep Risk Advisor Skill` 负责解释睡眠风险和饮用建议。
- “用户打开首页 → 系统读取今日记录 → 计算残留 → 生成建议 → 展示依据”是 Workflow。

Skill 可以被多个 Workflow 复用；Workflow 可以调用多个 Skill。

## Skill 和 Tool 的区别

Tool 是可执行函数或数据能力，负责读取、计算或写入。

Skill 是使用工具的规则说明，负责决定：

- 什么时候用工具；
- 用哪些数据；
- 如何组织输出；
- 哪些话不能说；
- 工具失败时如何兜底。

例如：

- `calculateCurrentCaffeineStatus` 是 Tool；
- “根据当前残留、睡眠时间和反馈生成克制建议”是 Skill 的职责。

## Skill 和 Agent 的关系

Agent 是调度、判断和执行主体。

Agent 可以：

1. 接收用户问题或产品内部问题；
2. 通过 Router 判断意图；
3. 选择合适 Skill；
4. 由 Context Builder 提供精简上下文；
5. 按 Skill 规则调用 Tool；
6. 将结果组织为用户可读回答。

Skill 不直接执行任务，它约束 Agent 如何执行任务。

## Router 与 Context Builder

Router 负责识别用户意图并选择 Skill。

Context Builder 负责为不同 Skill 提供 compact context，只提供该 Skill 必要的数据。

这样可以避免每个 Skill 都读取完整应用状态，减少上下文污染。

## 本项目计划包含的 Skill

### 1. Sleep Risk Advisor

适用场景：

- 首页今日饮用建议；
- 喝前模拟；
- “为什么今天不建议继续喝？”；
- 睡前残留和睡眠风险解释。

核心问题：

```text
今天还能不能喝？
如果现在喝，会不会影响睡眠？
```

### 2. Drink Record Parser

适用场景：

- 记录一杯；
- 饮品库搜索；
- 自定义饮品确认；
- no_match 兜底。

核心问题：

```text
用户喝的是什么？
能否从饮品库、常喝饮品或自定义饮品中找到可信候选？
```

### 3. Weekly Review Writer

适用场景：

- 洞察页周复盘；
- 近 7 天摄入趋势总结；
- 睡前残留趋势说明；
- 反馈和敏感度变化解释。

核心问题：

```text
最近一周整体趋势如何？
哪些天需要注意？
```

### 4. Alternative Drink Recommender

适用场景：

- 喝前模拟高风险；
- 今日已接近推荐量；
- 用户想喝但不适合完整一杯；
- 推荐低因或替代饮品。

核心问题：

```text
如果不建议喝这杯，可以换成什么？
```

## Skill 如何被加载

后续可采用轻量加载机制：

1. Router 识别意图；
2. 根据意图选择 Skill 名称；
3. Context Builder 生成该 Skill 的 compact context；
4. Agent 读取 Skill 说明；
5. Agent 按 Skill 约束调用 Tool 或生成回答。

当前阶段只定义规范，不实现真实 Skill Loader。

## Skill 如何使用 compact context

每个 Skill 只应接收必要上下文。

例如 Sleep Risk Advisor 不需要完整饮品库，只需要：

- 用户睡觉时间；
- 敏感度；
- 半衰期；
- 今日摄入；
- 当前残留；
- 睡眠风险；
- 近期反馈摘要。

compact context 的作用：

- 降低上下文噪音；
- 保护业务边界；
- 避免 Skill 错用无关数据；
- 让输出更稳定、更容易验收。

## Skill 输出如何被最终回答使用

Skill 输出不是直接等于最终 UI。

通常会被产品层进一步组织为：

- 首页建议卡；
- 喝前模拟结果；
- 洞察页解读；
- 状态日历说明；
- 折叠依据区；
- 开发调试信息。

用户侧默认看到的是建议、原因、依据和行动，不展示 Skill、Tool、Agent 等技术词。

## Skill 安全边界

所有 Skill 必须遵守：

- 不做医疗判断；
- 不使用“确定会失眠”等绝对表达；
- 不编造饮品咖啡因含量；
- 不把搜索失败写成真实摄入；
- 不绕过 Permission 执行写入；
- 不修改用户设置，除非用户明确确认；
- 不把 Agent / Tool / Skill 技术词暴露到普通用户主界面；
- 输出必须能说明数据来源或不确定性。

Skill 应服务核心链路：

```text
记录 → 判断 → 建议 → 反馈 → 趋势复盘
```

如果一个 Skill 不能服务上述任一环节，不应放进用户主界面。
