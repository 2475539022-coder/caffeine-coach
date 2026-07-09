# Drink Record Parser Skill

用于把“我刚喝了一杯拿铁 / 下午三点喝了瑞幸生椰拿铁”这类自然语言输入解析为可确认的饮品记录草稿。它服务 Caffeine Coach 核心链路中的“记录”环节。

本 Skill 只负责解析、匹配和提出下一步动作，不直接写入真实摄入记录。

## 适用场景

- 用户说：“我刚喝了一杯拿铁”
- 用户说：“下午三点喝了瑞幸生椰拿铁”
- 用户说：“晚饭后喝了一杯奶茶”
- 用户说：“今天早上喝了美式”
- 用户说：“刚刚喝了一瓶便利店咖啡”
- 用户说：“昨天晚上喝了公司楼下拿铁”
- 产品内部需要把自然语言饮品输入转换成记录确认卡。

Router 应在用户明确表达“已经喝了某个饮品，需要记录”的意图时选择本 Skill。

## 不适用场景

- 用户询问今晚还能不能喝，应交给 Sleep Risk Advisor。
- 用户询问一周总结，应交给 Weekly Review Writer。
- 用户询问替代饮品，应交给 Alternative Drink Recommender。
- 用户询问医学建议、治疗或疾病相关内容。
- 用户只是表达想喝、准备喝或模拟喝，不应当作真实记录。
- 用户没有表达记录意图，只是在搜索饮品信息。

## 输入上下文

必须使用 compact context，不读取完整 App 状态。

```ts
type DrinkRecordParserContext = {
  userText: string;
  currentTime: string;
  drinkLibrary: Drink[];
  customDrinks: CustomDrink[];
  frequentDrinks: FrequentDrinkMemory[];
  noMatchMemory: NoMatchDrinkMemory[];
};
```

字段说明：

- `userText`：用户自然语言输入。
- `currentTime`：当前时间，用于补全“刚刚”“今天早上”等相对时间。
- `drinkLibrary`：默认饮品库。
- `customDrinks`：用户确认创建的自定义饮品。
- `frequentDrinks`：常喝饮品记忆，用于快捷复用和候选排序。
- `noMatchMemory`：待补充饮品记忆，仅用于提示历史未匹配输入，不直接参与摄入计算。

## 解析目标

Skill 需要从自然语言中解析：

- 饮品名称；
- 品牌或来源；
- 日期；
- 时间；
- 规格或数量；
- 咖啡因含量匹配状态；
- 是否命中饮品库；
- 是否命中自定义饮品；
- 是否需要进入 no_match 确认流程；
- 解析置信度。

## 必须使用的工具或数据

必须使用：

- 饮品库搜索：优先匹配标准饮品库；
- 自定义饮品：其次匹配用户已确认的 custom drink；
- 常喝饮品记忆：用于提高候选排序和快速复用，但不能替代真实匹配；
- no_match 记忆：用于识别用户曾经保存但未补全的饮品；
- 当前时间：用于解析相对时间；
- 用户确认机制：任何写入都必须经过用户确认。

如果由 Tool Use 层执行，可复用：

- `searchDrinkLibrary`
- 现有 custom drink 读取能力；
- 现有 frequent drink memory 读取能力；
- 现有 no_match memory 读取能力；
- `permissionGuard`，用于确认写入边界。

## 可选工具或数据

- 饮品别名、OCR 关键词、品牌信息：用于辅助匹配。
- 用户最近记录：用于区分同名但不同咖啡因含量的饮品。
- 时间解析工具：后续可用于更稳定地解析“昨晚”“下午三点”等表达。

## 匹配规则

匹配顺序：

1. 优先匹配饮品库；
2. 其次匹配自定义饮品；
3. 再匹配常喝饮品；
4. 如果都不命中，进入 no_match 候选；
5. no_match 不自动写入，必须用户确认；
6. 咖啡因含量不能编造；
7. 多个饮品候选时，需要让用户确认。

补充规则：

- `matched` 表示命中默认饮品库；
- `custom_matched` 表示命中用户自定义饮品；
- `ambiguous` 表示有多个可信候选，需要用户选择；
- `no_match` 表示没有可信饮品，需要用户补充咖啡因或仅保存名称；
- pending no_match 不能直接参与今日摄入计算。

## 输出结构

Skill 输出建议使用结构化 JSON。

```json
{
  "intent": "record_drink",
  "drinkName": "",
  "brand": "",
  "date": "",
  "time": "",
  "amount": "",
  "matchedDrinkId": "",
  "caffeineMg": null,
  "matchStatus": "matched | custom_matched | no_match | ambiguous",
  "confidence": "high | medium | low",
  "nextAction": "confirm_record | ask_clarification | create_custom_drink | save_pending_no_match"
}
```

字段说明：

- `intent`：固定为 `record_drink`，除非 Router 判断不是记录意图。
- `drinkName`：解析出的饮品名称。
- `brand`：解析出的品牌或来源。
- `date`：解析出的日期；缺失时默认今天，并在输出中说明。
- `time`：解析出的时间；缺失时默认当前时间，并在输出中说明。
- `amount`：杯数、瓶数或规格描述。
- `matchedDrinkId`：匹配到的饮品 id，未匹配时为空。
- `caffeineMg`：可信匹配后的咖啡因含量；未知时必须为 `null`。
- `matchStatus`：匹配状态。
- `confidence`：解析置信度。
- `nextAction`：下一步动作。

## 输出风格

- 面向用户时使用确认式表达；
- 不暴露 Skill / Agent / Tool 等技术词；
- 不把解析结果包装成已经完成的记录；
- 强调“确认后再记录”；
- 未知咖啡因含量时，温和引导用户补充；
- 多候选时，清楚列出候选，不替用户擅自选择。

示例用户可见表达：

```text
我识别到你想记录：瑞幸生椰拿铁，时间是今天 15:00。饮品库中有 2 个相近候选，请确认杯型后再保存。
```

## 禁止事项

- 不得编造咖啡因含量。
- 不得把搜索失败自动写入 no_match。
- 不得把用户未确认的饮品直接记录。
- 不得把模拟饮品当成真实摄入。
- 不得忽略日期和时间。
- 不得把 pending no_match 直接参与摄入计算。
- 不得把常喝饮品记忆当作唯一事实来源。
- 不得因为用户说“想喝”就创建真实记录。
- 不得绕过 permissionGuard 或用户确认写入 localStorage。

## 失败兜底

当解析不清时：

- 缺少饮品名：询问用户喝了什么；
- 缺少时间：默认当前时间，但需要说明；
- 饮品含量未知：进入 no_match / 自定义饮品补充流程；
- 多个候选：列出候选让用户选择；
- 咖啡因含量未知：不能编造。

兜底模板：

```text
我还不能确定这杯饮品的咖啡因含量。你可以选择一个相近饮品，或输入咖啡因含量后保存为自定义饮品。
```

## 验收用例

| 用例 | 用户输入 | 解析结果 | 下一步动作 | 风险边界 |
|---|---|---|---|---|
| 1 | 我刚喝了一杯拿铁 | 解析 `drinkName=拿铁`，日期为今天，时间为当前时间；若饮品库有明确拿铁候选，`matchStatus=matched` | `confirm_record`，展示确认卡 | 未确认前不写入记录 |
| 2 | 下午三点喝了瑞幸生椰拿铁 | 解析品牌 `瑞幸`、饮品 `生椰拿铁`、时间 `15:00`；优先匹配饮品库 | 明确命中则 `confirm_record`，多杯型则 `ask_clarification` | 不擅自选择杯型 |
| 3 | 昨天晚上喝了一杯奶茶 | 解析日期为昨天、时间为晚间模糊时间、饮品为奶茶 | 若候选明确则确认；时间不够精确时请求确认 | 不忽略“昨天” |
| 4 | 喝了公司楼下拿铁 | 解析饮品名/来源；默认当前时间；饮品库无可信匹配时 `matchStatus=no_match` | 提示创建自定义饮品或仅保存名称 | 不自动写入 no_match |
| 5 | 刚喝了咖啡 | 饮品名过泛，可能有多个候选，`matchStatus=ambiguous` | `ask_clarification`，询问美式、拿铁、速溶等 | 不编造咖啡因含量 |
| 6 | 喝了生椰拿铁 | 饮品库存在多个品牌或杯型候选，`matchStatus=ambiguous` | 列出候选，让用户确认 | 不默认选最高或最低咖啡因 |
| 7 | 我想喝咖啡 | 不是已发生记录意图 | 不触发本 Skill 或返回非记录意图 | 不创建真实记录 |
| 8 | 喝前模拟一杯奶茶 | 明确是模拟，不是真实摄入 | 交给喝前模拟 / Sleep Risk Advisor | 不当作真实记录 |

## 当前边界

当前不做：

- 不接入真实语音；
- 不做 OCR；
- 不做复杂 NLP 模型；
- 不修改 no_match 逻辑；
- 不修改常喝饮品逻辑；
- 不自动新增真实记录；
- 不新增复杂 UI。

当前依赖：

- 已有饮品库；
- 已有自定义饮品沉淀；
- 已有常喝饮品记忆；
- 已有 no_match 记忆；
- 已有用户确认与权限边界。

后续可优化：

- 与 Router 连接，判断“记录意图”和“模拟意图”；
- 与 Context Builder 连接，生成本 Skill 的 compact context；
- 引入更稳健的时间解析；
- 将输出结构映射为记录确认卡。
