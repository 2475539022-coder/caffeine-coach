# Weekly Review Writer Skill

用于生成“一周咖啡因摄入复盘”，帮助用户理解过去一周的摄入习惯、风险时段、反馈情况和下周调整方向。它服务 Caffeine Coach 核心链路中的“趋势复盘”和“建议”环节。

本 Skill 只负责基于已有记录与记忆生成复盘，不新增记录、不修改设置、不改变趋势或风险计算。

## 适用场景

- 用户问：“帮我总结这周咖啡因摄入”
- 用户问：“这周我喝咖啡情况怎么样？”
- 用户问：“这周有没有影响睡眠？”
- 用户问：“帮我写一份本周咖啡因复盘”
- 用户问：“我最近是不是喝太多了？”
- 用户问：“下周应该怎么调整？”
- 产品内部需要为洞察页生成本周结论、建议解读或周复盘摘要。

Router 应在问题核心是“最近 7 天趋势、周总结、摄入习惯复盘、反馈影响和下周调整”时选择本 Skill。

## 不适用场景

- 用户只想记录一杯饮品，应交给 Drink Record Parser。
- 用户只问今晚还能不能喝，应交给 Sleep Risk Advisor。
- 用户只想找替代饮品，应交给 Alternative Drink Recommender。
- 用户询问医学诊断、治疗或疾病相关内容。
- 用户数据不足但要求绝对判断。
- 用户询问饮品库匹配、OCR、no_match 或自定义饮品沉淀。

## 输入上下文

必须使用 compact context，不读取完整 App 状态。

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

字段说明：

- `weekRange`：本次复盘覆盖的日期范围。
- `intakeSummary`：近 7 天摄入统计摘要。
- `dailyStatusSummary`：每日状态快照，用于识别高风险日期和摄入波动。
- `frequentDrinks`：常喝饮品记忆，用于观察习惯，不等于健康判断。
- `feedbackSummary`：睡眠反馈与即时不适反馈摘要。
- `sensitivityExplanation`：当前敏感度解释摘要。

## 必须使用的工具或数据

必须使用：

- 近 7 天真实摄入记录或 daily status summary；
- 每日总摄入量；
- 晚间摄入次数；
- 睡眠风险等级；
- 睡眠反馈；
- 即时不适反馈；
- 常喝饮品记忆；
- 敏感度解释。

如果由 Tool Use 层执行，可复用：

- 状态日历 / dailyStatusMemory 读取能力；
- feedbackMemory 读取能力；
- frequent drink memory 读取能力；
- sensitivity explanation 读取能力；
- 现有睡眠风险判断结果。

## 可选工具或数据

- 近 7 天睡前残留趋势：用于解释睡眠影响。
- 自定义饮品记录：仅在已经真实记录后参与复盘。
- 最晚摄入时间：用于解释晚间摄入习惯。

## 分析规则

1. 优先基于近 7 天真实记录。
2. 不将模拟记录作为真实摄入。
3. 不将 pending no_match 作为真实摄入。
4. custom drink 只有真实记录后才计入。
5. 睡眠反馈和即时不适反馈要分开分析。
6. 常喝饮品用于观察习惯，不等于健康判断。
7. 数据不足时必须说明“不足以判断趋势”。
8. 不把缺失反馈解释为“没有影响”。
9. 不把单日异常直接上升为长期结论。

## 输出结构

Skill 输出必须按以下结构组织。

```md
## 本周总结

用 2-3 句话概括整体情况。

## 关键发现

- 总摄入量
- 高风险日期
- 晚间摄入
- 常喝饮品
- 反馈情况

## 可能影响

结合睡眠反馈、不适反馈、睡前残留情况说明。

## 下周建议

- 建议 1
- 建议 2
- 建议 3

## 风险提示

该复盘仅基于你的记录和反馈，不是医学诊断。
```

## 输出风格

- 像生活管理复盘，不像医疗报告。
- 先总结，再分析，再建议。
- 不夸大风险。
- 不制造焦虑。
- 不承诺确定因果。
- 使用“可能”“倾向”“建议尝试”“根据你的记录”。
- 对数据不足保持诚实。

示例语气：

```text
本周整体摄入比较稳定，但有 2 天出现晚间摄入，睡前残留可能偏高。你也记录过睡眠受影响反馈，因此下周可以尝试把最后一杯提前到下午。
```

## 禁止事项

- 不得做医学诊断。
- 不得说咖啡因一定导致失眠。
- 不得把缺失数据当成真实数据。
- 不得编造没有记录的饮品。
- 不得把模拟数据算入真实周报。
- 不得把 pending no_match 算入真实周报。
- 不得忽略用户反馈。
- 不得只输出“少喝点”“注意休息”这类空泛建议。
- 不得把常喝饮品直接解释为不健康。
- 不得在普通用户输出中出现 Skill / Agent / Tool 等技术词。

## 失败兜底

当数据不足时：

- 少于 2 天记录：提示数据不足，只做轻量回顾；
- 没有反馈：说明无法判断主观影响；
- 没有睡眠时间：无法准确评估睡前风险；
- 无常喝饮品：不输出常喝饮品分析；
- 无摄入记录：建议先记录几天再复盘。

兜底模板：

```text
目前近 7 天记录还不够完整，只能做轻量回顾。继续记录几天后，我可以更准确地帮你看摄入趋势、睡前残留和反馈变化。
```

## 验收用例

| 用例 | 用户问题 | 输入上下文 | 预期输出要点 | 风险边界 |
|---|---|---|---|---|
| 1 | 帮我总结这周咖啡因摄入 | 一周记录完整；有晚间摄入；有睡眠受影响反馈 | 输出本周总结、晚间摄入次数、高风险日期、睡眠反馈影响和下周提前摄入建议 | 不说一定导致失眠 |
| 2 | 这周我喝咖啡情况怎么样？ | 一周记录完整；没有不适反馈 | 输出摄入稳定性、总量和常喝饮品；说明没有记录到明显不适反馈 | 不把没有反馈解释为没有影响 |
| 3 | 我最近是不是喝太多了？ | 只有 1 天记录 | 说明数据不足以判断趋势，只能回顾这一天；建议继续记录 | 不给长期结论 |
| 4 | 帮我写一份本周咖啡因复盘 | 有 custom drink 真实记录 | custom drink 计入总摄入和常喝观察；如含量来自用户确认，可说明为已记录饮品 | 不质疑已确认 custom drink |
| 5 | 这周有没有影响睡眠？ | 有 pending no_match，但未真实记录 | pending no_match 不计入；只基于真实记录和反馈分析 | 不把 pending no_match 当摄入 |
| 6 | 判断我是不是咖啡因成瘾 | 有多日高摄入 | 拒绝诊断式判断；改为生活管理复盘，说明摄入频率和反馈趋势 | 不使用成瘾诊断 |

## 当前边界

当前不做：

- 不新增复杂图表；
- 不新增完整周报页面；
- 不接入真实 LLM；
- 不做医学诊断；
- 不修改记录逻辑；
- 不修改日历逻辑；
- 不修改饮品记忆逻辑；
- 不修改 no_match 逻辑。

当前依赖：

- 近 7 天真实记录；
- dailyStatusMemory；
- feedbackMemory；
- frequent drink memory；
- sensitivity explanation。

后续可优化：

- 与洞察页本周结论卡连接；
- 与 Context Builder 连接，生成周复盘 compact context；
- 增加 Bad Case 测试集；
- 将输出拆分为前台卡片、折叠依据和建议行动。
