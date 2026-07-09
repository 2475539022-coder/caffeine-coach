# Stage 5.5：Skill Loading / Router 集成

## 1. 阶段名称

Stage 5.5：Skill Loading / Router 集成

## 2. 阶段目标

本阶段目标是建立轻量的 Skill Loading 与 Intent Router 机制，让系统能够根据用户意图选择对应 Skill，并为该 Skill 准备 compact context。

本阶段实现的是基础设施，不接入真实 LLM，不执行 Markdown Skill，不新增复杂 UI。

核心链路：

```text
用户输入
↓
识别意图
↓
选择 Skill
↓
构建 compact context
↓
返回 Skill 执行计划
```

## 3. Skill Registry 设计

新增 `src/agent/skillRegistry.ts`。

它定义 4 个 Skill：

- `sleep_risk_advisor`
- `drink_record_parser`
- `weekly_review_writer`
- `alternative_drink_recommender`

每个 Skill 包含：

- `id`：Skill 标识；
- `name`：展示名称；
- `description`：能力描述；
- `triggers`：典型触发语；
- `requiredContext`：所需上下文字段；
- `outputType`：输出类型；
- `safetyNotes`：安全边界。

Registry 的作用不是执行 Skill，而是告诉 Router 和后续 Agent 当前有哪些能力可以被选择。

## 4. Intent Router 设计

复用并扩展 `src/agent/intentRouter.ts`。

保留原有 `routeIntent()`，避免破坏已有 Agent Loop。

新增 `routeSkill()`，用于 Stage 5 Skill 路由。

当前映射规则：

| 用户输入类型 | Skill |
|---|---|
| 今晚还能不能喝 / 会不会影响睡眠 | `sleep_risk_advisor` |
| 我喝了一杯 / 记录饮品 | `drink_record_parser` |
| 总结这周 / 本周复盘 | `weekly_review_writer` |
| 推荐替代饮品 / 不喝咖啡喝什么 | `alternative_drink_recommender` |
| 无法判断 | `unknown` |

当前使用简单关键词规则，不做复杂 NLP。

## 5. Context Builder 设计

新增 `src/agent/contextBuilder.ts`。

它为不同 Skill 构建 compact context：

- `buildSleepRiskAdvisorContext()`
- `buildDrinkRecordParserContext()`
- `buildWeeklyReviewWriterContext()`
- `buildAlternativeDrinkRecommenderContext()`
- `buildSkillContext()`

设计原则：

- 只传 Skill 真正需要的数据；
- 优先复用现有 Tool / utils；
- 不重写咖啡因计算；
- 不修改日历、反馈、饮品记忆和 no_match；
- 对暂时无法完整接入的字段保留 TODO 或结构化空值，不编造数据。

## 6. Skill Loading 流程

新增 `src/agent/skillLoader.ts`。

核心函数：

```ts
createSkillExecutionPlan(userMessage, input)
```

返回：

- `skillId`
- Skill definition；
- route result；
- compact context；
- ready 状态；
- notes。

当前版本不执行 Markdown Skill，也不调用真实 LLM，只返回可解释的执行计划。

## 7. 与 s07_skill_loading 的关系

本阶段对应后续 s07_skill_loading 的最小实现前置：

- 已有 Skill Registry；
- 已有 Skill Router；
- 已有 Context Builder；
- 已有 Execution Plan；
- 已保留 Markdown Skill 文件路径与文档契约。

后续 s07 可以在此基础上增加：

- Skill 文件加载器；
- Skill 元数据校验；
- Skill 输出 schema 校验；
- Skill 版本管理。

## 8. 与 s10_system_prompt 的关系

Stage 5.5 让系统提示词不需要塞入所有业务规则。

后续 s10_system_prompt 可以只规定：

- 如何识别意图；
- 如何选择 Skill；
- 如何读取 compact context；
- 如何遵守 Skill 禁止事项；
- 如何把 Skill 输出转成用户可读卡片。

具体任务规则则沉淀在各 Skill 文档中。

## 9. 当前边界

本阶段不做：

- 不接入真实 LLM；
- 不执行 Markdown Skill；
- 不做复杂多 Agent；
- 不改咖啡因计算公式；
- 不改日历写入；
- 不改饮品记忆；
- 不改 no_match；
- 不新增复杂 UI；
- 不做后端数据库。

本阶段只做：

- Skill Registry；
- Skill Router；
- Context Builder；
- Skill Execution Plan；
- 阶段文档。

## 10. 验收结果

路由自测：

| 输入 | 预期 Skill | 实际结果 |
|---|---|---|
| 今晚还能喝咖啡吗？ | `sleep_risk_advisor` | 通过 |
| 我刚喝了一杯拿铁 | `drink_record_parser` | 通过 |
| 帮我总结这周咖啡因摄入 | `weekly_review_writer` | 通过 |
| 晚上不喝咖啡可以喝什么？ | `alternative_drink_recommender` | 通过 |
| 你好 | `unknown` | 通过 |

代码验收：

- TypeScript 类型检查通过；
- `npm run build` 通过；
- `git diff --check` 通过；
- 未修改 Stage 4.1 / 4.2 / 4.3 业务逻辑；
- 未破坏已有 Agent / Tool 文件。

## 11. 阶段结论

Stage 5.5 已完成 Skill Loading / Router 的轻量基础设施。

当前系统已经具备：

- 4 个可注册 Skill；
- 基于关键词的 Skill 路由；
- 按 Skill 构建 compact context；
- 返回可解释执行计划。

下一步可以进入 Stage 5.6：Skill 验收与评估体系，为每个 Skill 建立固定测试集、Bad Case 模板和回归标准。
