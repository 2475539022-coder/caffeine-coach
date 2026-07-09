# Stage 5.2：Drink Record Parser Skill

## 1. 阶段名称

Stage 5.2：Drink Record Parser Skill

## 2. 阶段目标

本阶段目标是把“自然语言记录饮品”沉淀为一个可复用 Skill。

用户输入一句自然语言后，系统可以解析出：

- 饮品名称；
- 品牌或来源；
- 日期和时间；
- 规格或数量；
- 咖啡因匹配状态；
- 是否命中饮品库；
- 是否命中自定义饮品；
- 是否需要进入 no_match 确认流程；
- 下一步动作。

本阶段不新增真实记录写入能力，不修改 no_match 现有逻辑，只把自然语言饮品记录解析能力设计为 Skill。

## 3. Skill 适用场景

Drink Record Parser 适用于用户已经喝了某个饮品，并希望记录的场景。

典型输入包括：

- “我刚喝了一杯拿铁”
- “下午三点喝了瑞幸生椰拿铁”
- “晚饭后喝了一杯奶茶”
- “今天早上喝了美式”
- “刚刚喝了一瓶便利店咖啡”
- “昨天晚上喝了公司楼下拿铁”

不适用于：

- 用户询问今晚还能不能喝；
- 用户询问一周总结；
- 用户询问替代饮品；
- 用户询问医学建议；
- 用户只是表达“想喝”；
- 用户在做喝前模拟。

## 4. 输入上下文

Skill 使用 compact context，不读取完整 App 状态。

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

- `userText`：用户自然语言输入；
- `currentTime`：当前时间，用于解析“刚刚”“今天早上”等表达；
- `drinkLibrary`：默认饮品库；
- `customDrinks`：用户确认创建过的自定义饮品；
- `frequentDrinks`：常喝饮品记忆；
- `noMatchMemory`：待补充饮品记忆。

## 5. 解析字段

Skill 需要从用户输入中解析：

- `drinkName`：饮品名称；
- `brand`：品牌或来源；
- `date`：日期；
- `time`：时间；
- `amount`：杯数、瓶数、规格或数量；
- `matchedDrinkId`：匹配到的饮品 id；
- `caffeineMg`：可信匹配后的咖啡因含量；
- `matchStatus`：匹配状态；
- `confidence`：解析置信度；
- `nextAction`：下一步动作。

## 6. 匹配规则

匹配顺序：

1. 优先匹配饮品库；
2. 其次匹配自定义饮品；
3. 再匹配常喝饮品；
4. 如果都不命中，进入 no_match 候选；
5. no_match 不自动写入，必须用户确认；
6. 咖啡因含量不能编造；
7. 多个饮品候选时，需要让用户确认。

匹配状态：

- `matched`：命中默认饮品库；
- `custom_matched`：命中自定义饮品；
- `no_match`：没有可信候选，需要用户补充；
- `ambiguous`：存在多个候选，需要用户选择。

## 7. 输出结构

Skill 输出采用结构化 JSON。

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

下一步动作说明：

- `confirm_record`：已获得可信饮品和咖啡因含量，展示确认卡；
- `ask_clarification`：饮品、时间或杯型不明确，需要用户选择；
- `create_custom_drink`：用户可补充咖啡因含量并转为自定义饮品；
- `save_pending_no_match`：用户明确选择“先保存名称，稍后补充”后才写入 no_match。

## 8. 禁止事项

Drink Record Parser 必须遵守：

- 不得编造咖啡因含量；
- 不得把搜索失败自动写入 no_match；
- 不得把用户未确认的饮品直接记录；
- 不得把模拟饮品当成真实摄入；
- 不得忽略日期和时间；
- 不得把 pending no_match 直接参与摄入计算；
- 不得把常喝饮品记忆当作唯一事实来源；
- 不得因为用户说“想喝”就创建真实记录；
- 不得绕过用户确认或权限边界写入 localStorage。

## 9. 失败兜底

当解析不清时：

- 缺少饮品名：询问用户喝了什么；
- 缺少时间：默认当前时间，但需要说明；
- 饮品含量未知：进入 no_match / 自定义饮品补充流程；
- 多个候选：列出候选让用户选择；
- 咖啡因含量未知：不能编造。

用户可见兜底表达示例：

```text
我还不能确定这杯饮品的咖啡因含量。你可以选择一个相近饮品，或输入咖啡因含量后保存为自定义饮品。
```

## 10. 验收用例

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

## 11. 当前边界

本阶段不做：

- 不接入真实语音；
- 不做 OCR；
- 不做复杂 NLP 模型；
- 不修改 no_match 逻辑；
- 不修改常喝饮品逻辑；
- 不自动新增真实记录；
- 不新增复杂 UI。

本阶段只完成：

- 新增 Drink Record Parser Skill 文档；
- 明确自然语言饮品记录的解析字段；
- 明确匹配顺序和 no_match 确认原则；
- 明确输出 JSON 结构；
- 明确失败兜底和禁止事项；
- 明确验收用例。

## 12. 验收结果

- `skills/drink_record_parser.md` 已新增；
- 输出结构明确；
- no_match 用户确认原则明确；
- 不编造咖啡因含量的边界已写入；
- 模拟和真实记录区分清楚；
- 8 条验收用例已覆盖；
- 未修改业务代码；
- `npm run build` 通过；
- `git diff --check` 通过。

## 13. 阶段结论

Stage 5.2 已将自然语言饮品记录解析沉淀为可复用 Skill。

后续进入 Stage 5.3 时，可以继续沉淀 Weekly Review Writer Skill，用于洞察页周复盘、趋势总结和建议解读。
