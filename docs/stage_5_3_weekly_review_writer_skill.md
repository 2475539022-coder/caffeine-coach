# Stage 5.3：Weekly Review Writer Skill

## 1. 阶段名称

Stage 5.3：Weekly Review Writer Skill

## 2. 阶段目标

本阶段目标是把“一周咖啡因摄入复盘”沉淀为一个可复用 Skill。

它用于帮助用户理解过去一周的摄入习惯、风险时段、反馈情况和下周建议。

本阶段优先文档化 Skill，不做复杂 UI，不接入真实 LLM，不修改现有业务逻辑。

## 3. Skill 适用场景

Weekly Review Writer 适用于用户询问：

- “帮我总结这周咖啡因摄入”
- “这周我喝咖啡情况怎么样？”
- “这周有没有影响睡眠？”
- “帮我写一份本周咖啡因复盘”
- “我最近是不是喝太多了？”
- “下周应该怎么调整？”

它也可用于洞察页的本周结论、建议解读和趋势复盘摘要。

不适用于：

- 用户只想记录一杯饮品；
- 用户只问今晚还能不能喝；
- 用户只想找替代饮品；
- 用户询问医学诊断；
- 用户数据不足但要求绝对判断。

## 4. 输入上下文

Skill 使用 compact context，不读取完整 App 状态。

```ts
type WeeklyReviewWriterContext = {
  weekRange: {
    start: string;
    end: string;
  };
  intakeSummary: {
    totalCaffeineMg: number;
    averageDailyCaffeineMg: number;
    maxDayCaffeineMg: number;
    lateIntakeCount: number;
  };
  dailyStatusSummary: {
    date: string;
    status: string;
    totalCaffeineMg: number;
    riskLevel: string;
  }[];
  frequentDrinks: FrequentDrinkMemory[];
  feedbackSummary: {
    sleepAffectedDays: number;
    discomfortCount: number;
    feedbackExamples: string[];
  };
  sensitivityExplanation: {
    label: string;
    reasons: string[];
  };
};
```

## 5. 工具 / 数据依赖

必须使用：

- 近 7 天真实摄入记录或 daily status summary；
- 每日总摄入量；
- 晚间摄入次数；
- 睡眠风险等级；
- 睡眠反馈；
- 即时不适反馈；
- 常喝饮品记忆；
- 敏感度解释。

可复用现有数据层：

- `dailyStatusMemory`；
- `feedbackMemory`；
- `FrequentDrinkMemory`；
- 敏感度解释结果；
- 洞察页已有趋势统计。

## 6. 分析规则

本 Skill 必须遵守：

1. 优先基于近 7 天真实记录；
2. 不将模拟记录作为真实摄入；
3. 不将 pending no_match 作为真实摄入；
4. custom drink 只有真实记录后才计入；
5. 睡眠反馈和即时不适反馈要分开分析；
6. 常喝饮品用于观察习惯，不等于健康判断；
7. 数据不足时必须说明“不足以判断趋势”。

## 7. 输出格式

Skill 输出必须包含：

```md
## 本周总结

用 2-3 句话概括整体情况。

## 关键发现

列出 3-5 个观察点，例如：
- 总摄入量；
- 高风险日期；
- 晚间摄入；
- 常喝饮品；
- 反馈情况。

## 可能影响

结合睡眠反馈、不适反馈、睡前残留情况说明。

## 下周建议

给出 3 条可执行建议。

## 风险提示

说明该复盘仅基于用户记录，不是医学诊断。
```

## 8. 输出风格

- 像生活管理复盘，不像医疗报告；
- 先总结，再分析，再建议；
- 不夸大风险；
- 不制造焦虑；
- 不承诺确定因果；
- 使用“可能”“倾向”“建议尝试”；
- 数据不足时坦诚说明。

## 9. 禁止事项

- 不得做医学诊断；
- 不得说咖啡因一定导致失眠；
- 不得把缺失数据当成真实数据；
- 不得编造没有记录的饮品；
- 不得把模拟数据算入真实周报；
- 不得把 pending no_match 算入真实周报；
- 不得忽略用户反馈；
- 不得只输出空泛建议。

## 10. 失败兜底

当数据不足时：

- 少于 2 天记录：提示数据不足，只做轻量回顾；
- 没有反馈：说明无法判断主观影响；
- 没有睡眠时间：无法准确评估睡前风险；
- 无常喝饮品：不输出常喝饮品分析；
- 无摄入记录：建议先记录几天再复盘。

兜底示例：

```text
目前近 7 天记录还不够完整，只能做轻量回顾。继续记录几天后，我可以更准确地帮你看摄入趋势、睡前残留和反馈变化。
```

## 11. 验收用例

| 用例 | 用户问题 | 输入上下文 | 预期输出要点 | 风险边界 |
|---|---|---|---|---|
| 1 | 帮我总结这周咖啡因摄入 | 一周记录完整；有晚间摄入；有睡眠受影响反馈 | 输出本周总结、晚间摄入次数、高风险日期、睡眠反馈影响和下周提前摄入建议 | 不说一定导致失眠 |
| 2 | 这周我喝咖啡情况怎么样？ | 一周记录完整；没有不适反馈 | 输出摄入稳定性、总量和常喝饮品；说明没有记录到明显不适反馈 | 不把没有反馈解释为没有影响 |
| 3 | 我最近是不是喝太多了？ | 只有 1 天记录 | 说明数据不足以判断趋势，只能回顾这一天；建议继续记录 | 不给长期结论 |
| 4 | 帮我写一份本周咖啡因复盘 | 有 custom drink 真实记录 | custom drink 计入总摄入和常喝观察 | 不质疑已确认 custom drink |
| 5 | 这周有没有影响睡眠？ | 有 pending no_match，但未真实记录 | pending no_match 不计入；只基于真实记录和反馈分析 | 不把 pending no_match 当摄入 |
| 6 | 判断我是不是咖啡因成瘾 | 有多日高摄入 | 拒绝诊断式判断；改为生活管理复盘，说明摄入频率和反馈趋势 | 不使用成瘾诊断 |

## 12. 当前边界

本阶段不做：

- 不新增复杂图表；
- 不新增完整周报页面；
- 不接入真实 LLM；
- 不做医学诊断；
- 不修改记录逻辑；
- 不修改日历逻辑；
- 不修改饮品记忆逻辑；
- 不修改 no_match 逻辑。

本阶段只完成：

- 新增 Weekly Review Writer Skill 文档；
- 明确输入上下文；
- 明确输出结构；
- 明确数据不足兜底；
- 明确 pending no_match 和模拟记录不计入真实周报；
- 明确验收用例。

## 13. 验收结果

- `skills/weekly_review_writer.md` 已新增；
- 输出结构清楚；
- 数据不足兜底清楚；
- pending no_match 不计入真实周报；
- 模拟记录不计入真实周报；
- 风险边界清楚；
- 6 条验收用例已覆盖；
- 未修改业务代码；
- `npm run build` 通过；
- `git diff --check` 通过。

## 14. 阶段结论

Stage 5.3 已将周复盘能力沉淀为可复用 Skill。

后续可以进入 Stage 5.4：Alternative Drink Recommender Skill，用于在不适合继续摄入高咖啡因时，给出低咖啡因、无咖啡因或非饮品替代建议。
