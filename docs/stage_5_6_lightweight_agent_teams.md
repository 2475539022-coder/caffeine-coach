# Stage 5.6：轻量 Agent Teams 验证

## 1. 阶段名称

Stage 5.6：轻量 Agent Teams 验证

## 2. 阶段目标

本阶段目标不是构建复杂多智能体系统，而是用轻量角色分工验证 `s15_agent_teams` 的思想：

```text
Intent Router Agent
↓
Skill Executor Agent
↓
Safety Reviewer Agent
↓
Response Generator Agent
```

当前实现使用函数模拟角色分工，不做真实多 Agent 并发，不接入真实 LLM。

## 3. 为什么不做复杂多 Agent

Caffeine Coach 是轻量咖啡因记录与饮用建议工具，核心目标是让用户快速知道：

- 今天还能不能喝；
- 如何记录饮品；
- 近期趋势如何；
- 如果不适合喝，能换什么。

复杂多 Agent 会增加系统不可控性，也容易让前台产品变成聊天工具。当前阶段只需要验证角色边界，让输出更稳定、更安全。

## 4. 四个角色定义

### 4.1 Intent Router Agent

职责：

- 识别用户意图；
- 选择 Skill；
- 判断是否需要澄清；
- 不负责生成最终建议。

对应实现：

- `routeSkill()`
- `createSkillExecutionPlan()`

### 4.2 Skill Executor Agent

职责：

- 根据 `skillId` 读取对应 Skill 定义；
- 获取 compact context；
- 生成结构化中间结果；
- 不做安全边界最终判断。

对应实现：

- `createSkillExecutionPlan()`
- `buildSkillContext()`
- `buildDraft()`

### 4.3 Safety Reviewer Agent

职责：

- 检查输出是否违反边界；
- 检查是否有医学诊断；
- 检查是否编造咖啡因含量；
- 检查是否承诺一定不会失眠；
- 检查是否把模拟记录当真实记录；
- 必要时降级为保守回答。

对应实现：

- `reviewSafety()`

### 4.4 Response Generator Agent

职责：

- 把结构化结果转成用户可读回答；
- 保持温和、明确、非医学化；
- 保留必要风险提示；
- 给出下一步建议。

对应实现：

- `generateFinalResponse()`

## 5. 角色边界

| 角色 | 能做 | 不能做 |
|---|---|---|
| Intent Router Agent | 识别意图、选择 Skill | 生成建议、写入数据 |
| Skill Executor Agent | 构建上下文、生成中间稿 | 最终安全裁决、自动写入记录 |
| Safety Reviewer Agent | 检查边界、降级风险表达 | 重新计算咖啡因、修改用户数据 |
| Response Generator Agent | 组织最终回答 | 违反安全审查结果、引入新事实 |

## 6. 执行流程

新增 `src/agent/agentTeam.ts`。

核心函数：

```ts
runAgentTeam(userInput, appContext)
```

返回结构：

```ts
{
  intentResult,
  selectedSkill,
  compactContext,
  draftResponse,
  safetyReview,
  finalResponse
}
```

当前流程：

1. Router 选择 Skill；
2. Skill Loader 构建执行计划；
3. Skill Executor 生成中间稿；
4. Safety Reviewer 检查边界；
5. Response Generator 输出最终回答。

## 7. 与 s15_agent_teams 的关系

本阶段是 `s15_agent_teams` 的轻量验证版。

保留的思想：

- 不同角色承担不同职责；
- 安全审查独立于任务执行；
- 最终回答由专门角色统一风格；
- 中间过程可追踪。

刻意不做：

- 不做多 Agent 并发；
- 不做 Agent 互相辩论；
- 不做后台自治任务；
- 不做自动执行写操作。

## 8. 安全检查规则

Safety Reviewer 至少检查：

- 是否出现医学诊断；
- 是否承诺“一定不会失眠”；
- 是否编造咖啡因含量；
- 是否忽略用户敏感度；
- 是否把 no_match pending 当真实记录；
- 是否把模拟记录当真实摄入；
- 是否推荐药物、保健品或治疗方案；
- 是否缺少风险提示。

当命中高风险表达时，最终回答会降级为更保守的生活方式建议。

## 9. 验收用例

| 用例 | 输入 | 预期结果 | 验收结果 |
|---|---|---|---|
| 1 | 今晚还能喝咖啡吗？ | Router 选择 `sleep_risk_advisor`；Safety 不允许承诺一定不失眠；Final Response 给出建议、原因、风险提示 | 通过 |
| 2 | 我刚喝了一杯公司楼下拿铁 | Router 选择 `drink_record_parser`；如果饮品库未命中，提示用户确认是否创建；不自动写入 no_match | 通过 |
| 3 | 帮我总结这周咖啡因摄入 | Router 选择 `weekly_review_writer`；不把模拟数据和 pending no_match 算入真实记录 | 通过 |
| 4 | 有没有保证不失眠的饮品？ | Router 可选择 `alternative_drink_recommender`；Safety 拦截“保证不失眠”表达；Final Response 明确不能保证，只能给低风险建议 | 通过 |
| 5 | 我是不是对咖啡因过敏？ | Safety Reviewer 识别医学诊断风险；Final Response 不做诊断；建议必要时咨询专业人士；仅基于记录做生活辅助说明 | 通过 |

## 10. 当前边界

本阶段不做：

- 不做真实多 Agent 并发；
- 不接入外部 LLM；
- 不新增复杂 UI；
- 不修改核心业务逻辑；
- 不修改咖啡因计算；
- 不修改饮品记忆；
- 不修改 no_match；
- 不做医疗诊断；
- 不推荐药品或保健品。

## 11. 验收结果

- 4 个 Agent 角色边界清楚；
- Agent Team 流程清楚；
- Safety Reviewer 规则清楚；
- 5 个验收用例完整；
- 不破坏 Stage 4 能力；
- 不破坏 Stage 5.5 Router；
- `npm run build` 通过；
- `git diff --check` 通过；
- 阶段文档已新增。

## 12. 阶段结论

Stage 5.6 完成了轻量 Agent Teams 验证。

当前 Caffeine Coach 已具备：

- Skill Registry；
- Skill Router；
- Context Builder；
- Skill Execution Plan；
- 轻量 Agent Team 流程；
- 独立 Safety Reviewer；
- 可解释的最终回答生成链路。

Stage 5 可以封版。后续如继续推进，可进入系统提示词整理、评估体系强化或真实 LLM tool calling 接入。
