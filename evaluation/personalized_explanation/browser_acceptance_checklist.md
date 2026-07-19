# AI 个性化喝前解释：浏览器验收清单

## 0. 验收范围

本清单覆盖 `evaluation/personalized_explanation/dataset.json` 中 5 条 `browser_manual_check` Case：

- `pe_eval_007`
- `pe_eval_015`
- `pe_eval_023`
- `pe_eval_032`
- `pe_eval_038`

验收对象是喝前模拟弹窗中的「为什么这样建议？」折叠区，重点检查 L5b：前端映射、缓存、展示层级和 fallback 展示。

本清单不验证真实模型质量，不声称真实用户效果。

## 1. 当前项目是否支持快速构造测试数据

当前项目没有用户可见的“测试数据按钮”“调试面板”或“浏览器验收模式”。

可以通过 UI 逐条新增记录、补录反馈、修改设置来构造状态，但要稳定复现 14 天历史证据、不同 ruleDecision、不同 fallbackType，成本较高且容易受当前时间、已有 localStorage、饮品选择影响。

因此，建议采用最小测试数据准备方式：

1. 使用无痕窗口或单独浏览器 Profile。
2. 通过 DevTools Console 临时写入 `localStorage`。
3. 只修改与 Caffeine Coach 当前状态相关的 key。
4. 验收完成后清理该无痕窗口，或恢复备份。

实际使用的核心 key：

```text
caffeine-coach-demo-v1
```

该 key 保存：

```ts
{
  drinks: Drink[];
  settings: SettingsState;
  feedback: FeedbackState;
  dailyStatusMemory: DailyStatusMemoryEntry[];
  feedbackMemory: FeedbackMemoryEntry[];
}
```

注意：`dailyStatusMemory` 会由页面根据 `drinks / settings / feedbackMemory / feedback` 重新计算，测试时应优先准备原始 `drinks`、`settings`、`feedback`、`feedbackMemory`，不要把 `dailyStatusMemory` 当唯一事实来源。

## 2. 通用验收步骤

所有 Case 的通用流程：

1. 打开最新 Preview 页面。
2. 打开 DevTools Console 和 Network 面板。
3. 按本 Case 的前置数据要求准备状态。
4. 刷新页面。
5. 点击首页核心卡片中的「喝前模拟」。
6. 在喝前模拟中选择或输入目标饮品。
7. 确认模拟结论、睡前预计残留、风险等级和底部按钮。
8. 不展开「为什么这样建议？」前，Network 中不应出现新的 `POST /api/personalized-explanation`。
9. 点击「为什么这样建议？」。
10. 在同一个折叠容器中查看：
    - 规则说明
    - 规则依据
    - AI 个性化解释或 fallback 说明
    - 数据限制与安全说明
11. 截图并按对应 Case 判定 Pass / Fail。

## 3. 最小测试数据准备原则

如需要用 Console 准备数据，建议只准备以下字段：

- `settings.bedTime = "23:30"`
- `settings.metabolism = "normal"`
- `settings.safeSleepResidualMg = 30`
- `settings.dailyBaseLimitMg = 280`
- `settings.strictnessMode = "balanced"`
- `feedback.sideEffect = "none"`
- `feedback.sleepQuality = "normal"` 或按 Case 调整
- `feedback.sleepLatency = "fast"` 或按 Case 调整
- 最近 14 天内的 `drinks`
- 最近 14 天内的 `feedbackMemory`

饮品记录最小字段：

```ts
{
  id: string;
  name: string;
  type: string;
  mg: number;
  time: string;
  note?: string;
  category?: string;
  displayName?: string;
}
```

反馈记忆最小字段：

```ts
{
  date: "YYYY-MM-DD";
  feedbackType: "daily_checkin" | "calendar_backfill";
  sleepQuality: "good" | "normal" | "bad";
  fallAsleepSpeed: "fast" | "normal" | "slow";
  palpitation: boolean;
  anxiety: boolean;
  stomachDiscomfort: boolean;
  handTremor: boolean;
  focusEffect: number;
  note: "";
  createdAt: string;
  updatedAt: string;
}
```

## 4. Case 清单

### pe_eval_007：full_cup 中文映射与枚举隐藏

**测试目的**
验证 `full_cup` 成功态前端显示中文行动建议，用户可见位置不暴露结构化枚举。

**对应决策类型**
`full_cup`

**前置用户数据和设置**
建议构造 `full_cup_support` 类状态：

- 睡觉时间：23:30
- 睡前参考目标：30mg
- 今日摄入较低
- 模拟饮品咖啡因不高，喝完后睡前预计残留低于当前默认参考目标
- 最近 14 天至少 4 个有效记录日
- 至少 2 天为较早或轻量摄入，且反馈正常或无不适

**如何通过当前产品 UI 构造该状态**
纯 UI 可通过以下方式近似构造：

1. 在「我的」中确认作息为 23:30，敏感度保持普通。
2. 在「记录」中保留今日低摄入或无摄入。
3. 在「喝前模拟」中选择低咖啡因饮品，例如绿茶或低因咖啡。

但“最近 14 天稳定低风险历史”很难通过 UI 快速稳定构造，建议使用临时 localStorage 测试数据。

**完整操作步骤**

1. 准备 `full_cup_support` 状态。
2. 刷新页面。
3. 点击首页「喝前模拟」。
4. 选择低因或轻量饮品，使模拟结论为“可以饮用”。
5. 确认折叠区标题为「为什么这样建议？」。
6. 点击展开。
7. 查看「喝前建议依据」内容。

**页面预期展示内容**

- 标题：`为什么这样建议？`
- 规则说明显示中文结论，例如“可以饮用，建议慢慢喝并留意身体反馈。”
- AI 成功时可出现：
  - 本次建议
  - 近期记录参考
  - 建议行动
  - 底部说明

**必须检查的数字、结论和行动建议**

- 模拟结论为低风险或可饮用。
- 睡前预计残留低于 30mg 左右的当前默认参考目标。
- 建议行动映射为中文，不显示 `full_cup`。

**不允许出现的内容**

- `full_cup`
- `half_cup`
- `low_caf`
- `no_more_today`
- “本次决策为 full_cup”
- “用户设置的参考目标”

**需要截图**

- 喝前模拟结论卡，包含模拟结论、睡前残留、风险等级。
- 展开「为什么这样建议？」后的完整解释区域。

**Pass / Fail 判定标准**

Pass：

- 用户可见文案全部为中文自然语言。
- `actionSuggestion` 被映射为中文。
- 页面任何普通用户可见区域不出现 `full_cup`。

Fail：

- 任一用户可见区域出现内部枚举。
- 折叠标题不是「为什么这样建议？」。
- LLM 文案覆盖或改变了规则结论。

### pe_eval_015：half_cup 缓存与重复请求

**测试目的**
验证同一喝前模拟结果首次展开才请求解释；收起再展开复用缓存，不重复请求；修改饮品后清除旧解释。

**对应决策类型**
`half_cup`

**前置用户数据和设置**
建议构造 `half_cup_support` 类状态：

- 今日已有一定摄入，例如 120-180mg。
- 模拟饮品为拿铁或类似中等咖啡因饮品。
- 睡前预计残留为中风险。
- 最近 14 天至少 4 个有效记录日。
- 最近 14 天至少 2 天出现晚间摄入。

**如何通过当前产品 UI 构造该状态**
可通过 UI 近似：

1. 今日先记录一杯咖啡。
2. 喝前模拟选择拿铁或奶茶。
3. 如未触发半杯，可在高级调整中把本杯咖啡因调到 100-150mg。

若要稳定触发历史证据和缓存验证，建议使用临时 localStorage 测试数据。

**完整操作步骤**

1. 打开 Network 面板，过滤 `personalized-explanation`。
2. 进入「喝前模拟」。
3. 选择拿铁或中等咖啡因饮品，使结论为“建议半杯”。
4. 确认未展开前没有请求。
5. 第一次点击「为什么这样建议？」。
6. 等待请求完成。
7. 收起折叠区。
8. 再次展开同一折叠区。
9. 修改模拟饮品或咖啡因含量，再次展开。

**页面预期展示内容**

- 第一次展开时显示 loading 或“补充中”。
- 请求完成后在同一折叠容器内展示规则依据和个性化说明。
- 收起再展开同一结果时内容仍在，不新增相同请求。
- 修改饮品后旧解释被清除，重新进入 idle/loading/fallback/success 状态。

**必须检查的数字、结论和行动建议**

- 模拟结论为“建议半杯”或等价中文。
- 建议行动为“建议改成半杯，或选择低因饮品。”
- 当前规则数值不被 LLM 改写。

**不允许出现的内容**

- 第二次展开同一结果时重复请求同一个 `dataVersionHash`。
- 修改饮品后仍展示旧解释。
- `half_cup` 原始枚举出现在用户可见区域。

**需要截图**

- 首次展开前 Network 无请求状态。
- 首次展开后的请求记录和解释区域。
- 收起再展开后 Network 未新增相同请求。
- 修改饮品后的解释区重置状态。

**Pass / Fail 判定标准**

Pass：

- 首次展开才请求。
- 同一模拟结果二次展开不重复请求。
- 修改模拟条件后旧解释清除。

Fail：

- 页面加载或未展开时提前请求。
- 同一结果重复请求。
- 修改饮品后仍展示旧解释。

### pe_eval_023：low_caf 底部说明合并

**测试目的**
验证 `low_caf` 场景下底部说明只合并展示一次，不重复展示 `dataLimitation`、`safetyNote` 和 AI 说明。

**对应决策类型**
`low_caf`

**前置用户数据和设置**
建议构造 `low_caf_support` 类状态：

- 当前饮品咖啡因接近或超过用户紧张/不适相关阈值。
- 当前睡眠风险中等。
- 最近 14 天至少 4 个有效记录日。
- 至少 2 次当前饮品类别与即时不适反馈同日出现。

**如何通过当前产品 UI 构造该状态**
纯 UI 可近似：

1. 在「我的」中把“喝咖啡后容易心慌或紧张吗？”设置为“偶尔”或“经常”。
2. 在喝前模拟中选择咖啡因较高的饮品。
3. 如未触发低因，使用高级调整把咖啡因调到接近紧张阈值。

但即时不适历史共现较难通过 UI 快速构造，建议用临时 localStorage 测试数据。

**完整操作步骤**

1. 准备 `low_caf_support` 状态。
2. 刷新页面。
3. 打开「喝前模拟」。
4. 选择较高咖啡因饮品，使结论为“建议低因”。
5. 展开「为什么这样建议？」。
6. 查看底部说明。

**页面预期展示内容**

- 规则说明显示低因建议。
- 个性化解释显示在同一折叠容器中。
- 底部说明合并为一条弱提示。

**必须检查的数字、结论和行动建议**

- 结论为建议低因或避免完整摄入。
- 建议行动为“建议优先选择低因饮品。”
- 底部说明只出现一次。

**不允许出现的内容**

- 分别重复展示 `dataLimitation` 和 `safetyNote`。
- 重复出现多次“AI 个性化解释”或“AI 仅负责解释”。
- `low_caf` 原始枚举。
- 医学诊断、保证性表达。

**需要截图**

- 低因模拟结论卡。
- 展开后的完整解释区域，尤其底部说明。

**Pass / Fail 判定标准**

Pass：

- 底部说明只出现一次。
- 说明语气克制，表达为生活方式参考。
- 没有重复模块。

Fail：

- 同一含义的安全说明重复出现。
- 出现内部字段名或枚举。
- LLM 文案覆盖规则建议。

### pe_eval_032：no_more_today 中文映射与规则结论保护

**测试目的**
验证 `no_more_today` 场景下前端必须显示中文，不得出现内部枚举；LLM 不能覆盖按钮或当前规则结论。

**对应决策类型**
`no_more_today`

**前置用户数据和设置**
建议构造 `no_more_today_support` 类状态：

- 今日已摄入较高，例如超过或接近推荐量。
- 模拟饮品会让睡前预计残留偏高。
- 风险等级为高。
- 最近 14 天至少 4 个有效记录日。
- 至少 2 次高残留和睡眠受影响反馈同日出现。

**如何通过当前产品 UI 构造该状态**
可通过 UI 近似：

1. 今日记录多杯咖啡或高咖啡因饮品。
2. 在喝前模拟中选择咖啡因较高饮品。
3. 如未触发“不建议继续摄入”，使用高级调整提高本杯咖啡因。

若要稳定触发历史睡眠反馈证据，建议使用临时 localStorage 测试数据。

**完整操作步骤**

1. 准备 `no_more_today_support` 状态。
2. 刷新页面。
3. 打开「喝前模拟」。
4. 选择高咖啡因饮品，使模拟结论为“今天建议先不继续摄入咖啡因”或等价文案。
5. 展开「为什么这样建议？」。
6. 检查底部按钮仍为原有操作按钮。

**页面预期展示内容**

- 规则说明显示“今天建议先不继续摄入咖啡因。”
- 风险等级为高风险或不建议继续摄入。
- 建议行动为中文。
- 仍保留原有底部按钮：记录这杯 / 改成半杯 / 今天不喝了。

**必须检查的数字、结论和行动建议**

- 今日累计较高。
- 睡前预计残留高于 30mg 当前默认参考目标。
- 风险等级为高。
- 建议行动不比规则结论更宽松。

**不允许出现的内容**

- `no_more_today`
- `full_cup`
- `half_cup`
- `low_caf`
- “本次决策为 no_more_today”
- LLM 把结论改成“可以喝”或“建议半杯”
- LLM 改变底部按钮含义

**需要截图**

- no_more_today 模拟结论卡。
- 展开后的解释区。
- 底部操作按钮区域。

**Pass / Fail 判定标准**

Pass：

- 所有用户可见行动为中文。
- 规则结论保持不变。
- 底部按钮不被 LLM 覆盖。

Fail：

- 出现内部枚举。
- LLM 文案比规则结论更宽松。
- 原有操作按钮被隐藏或改写。

### pe_eval_038：证据不足 fallback 不重复展示说明

**测试目的**
验证 `insufficient_evidence` fallback 时，只展示规则说明、规则依据和数据限制，不展示重复说明模块。

**对应决策类型**
`half_cup`

**前置用户数据和设置**
建议构造 `half_cup_insufficient_evidence` 类状态：

- 今日模拟结果仍为 half_cup。
- 最近 14 天只有 2 个有效记录日。
- 最近 14 天只有 1 天晚间摄入。
- 不满足个性化解释最低证据门槛。
- `minimumEvidenceMet = false`。

**如何通过当前产品 UI 构造该状态**
可通过 UI 近似：

1. 清空或减少历史记录。
2. 今日记录一杯咖啡。
3. 喝前模拟选择拿铁或奶茶，使规则结论为半杯。

但要稳定控制“2 天有效记录、1 天晚间摄入”，建议使用临时 localStorage 测试数据。

**完整操作步骤**

1. 准备 `half_cup_insufficient_evidence` 状态。
2. 刷新页面。
3. 打开 Network 面板。
4. 打开「喝前模拟」。
5. 选择中等咖啡因饮品，使规则结论为半杯。
6. 展开「为什么这样建议？」。
7. 观察是否走 fallback。

**页面预期展示内容**

- 展示规则说明。
- 展示规则依据。
- 展示数据限制：
  “已查看你最近14天的饮用与反馈记录，但目前还没有足够重复的现象支持个性化判断。本次建议主要依据规则计算结果。”
- 不展示额外重复的“说明 / explanation”模块。

**必须检查的数字、结论和行动建议**

- 结论仍为半杯或低因相关建议。
- 数据限制中提到最近 14 天和重复证据不足。
- 规则数值由页面模拟结果展示，不由 LLM 改写。

**不允许出现的内容**

- 重复的说明模块。
- “有效记录较少”旧文案。
- `source=llm` 成功态个性化历史观察。
- 内部枚举。

**需要截图**

- 半杯模拟结论卡。
- 展开后的 fallback 区域。
- Network 中 `/api/personalized-explanation` 响应，需能看到 `source=fallback` 或 `fallbackType=insufficient_evidence`。

**Pass / Fail 判定标准**

Pass：

- 不满足证据门槛时不展示 LLM 成功态内容。
- 只显示规则说明、规则依据和数据限制。
- 没有重复说明模块。

Fail：

- fallback 时仍展示重复 explanation。
- 展示“有效记录较少”旧文案。
- 把证据不足误展示成 LLM 个性化观察。

## 5. 截图命名建议

建议按以下格式保存截图：

```text
pe_eval_007_full_cup_result.png
pe_eval_007_full_cup_explanation.png
pe_eval_015_cache_network_first.png
pe_eval_015_cache_network_second.png
pe_eval_023_low_caf_bottom_note.png
pe_eval_032_no_more_today_actions.png
pe_eval_038_insufficient_fallback.png
```

## 6. 最小测试数据准备方式说明

如果不能仅通过 UI 稳定复现，允许在浏览器 Console 中写入临时 localStorage 测试数据。

最小原则：

- 先备份 `caffeine-coach-demo-v1`。
- 写入本 Case 需要的 `drinks / settings / feedback / feedbackMemory`。
- 不写入无关 key。
- 刷新页面后验收。
- 验收完成后恢复备份或关闭无痕窗口。

本清单不提供内置测试按钮，也不要求修改产品代码。

## 7. 最终通过标准

全部浏览器 Case 通过需要满足：

1. 「为什么这样建议？」是唯一解释入口。
2. 未展开时不展示解释内容。
3. 首次展开才触发解释请求或 fallback 生成。
4. 同一模拟结果不重复请求。
5. 修改饮品后旧解释清除。
6. 成功态显示中文自然语言，不暴露内部枚举。
7. fallback 态说明原因准确，不误报数据不足。
8. 底部说明合并展示一次。
9. LLM 或 fallback 不覆盖规则结论、数值、风险等级和底部按钮。
