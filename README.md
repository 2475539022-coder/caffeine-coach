# Caffeine Coach

一个轻量咖啡因饮用决策助手：帮助用户快速记录咖啡因摄入，并在准备喝下一杯前判断“现在还能不能喝、喝多少更合适、为什么这样建议”。

> Online Demo: `TODO: add Vercel production URL`

## 用户痛点与产品价值

很多咖啡因工具只告诉用户“摄入了多少 mg”，但真实决策发生在喝前：

- 用户不知道一杯咖啡、奶茶或茶饮大概有多少咖啡因。
- 用户看不懂代谢曲线和睡眠风险之间的关系。
- 同样一杯饮品，不同用户因为作息、敏感度和近期反馈不同，适合的建议不同。
- 用户需要知道“为什么今天建议半杯、低因或不喝”，但又不希望看到复杂公式或技术机制。

Caffeine Coach 的价值是把“饮品选择 + 规则计算 + 个人历史证据 + 可解释建议”收敛到一个小闭环，让用户在当前这一杯上做出更清楚的选择。

## 核心功能

- 记录一杯：搜索/选择饮品，确认咖啡因含量与时间后保存。
- 喝前模拟：选择一杯准备喝的饮品，模拟喝完后的今日累计、睡前预计残留和睡眠风险。
- 今日饮用建议：首页展示今日已摄入、睡前预计残留、睡眠风险和下一步行动。
- 饮品库与自定义饮品：默认饮品库、常喝饮品、自定义饮品和 no_match 用户确认兜底。
- 状态日历：按天查看近 14 天摄入、残留、风险和反馈。
- 洞察复盘：查看近 7 天摄入趋势、睡前残留趋势和敏感度解释。
- AI 个性化喝前解释：用户展开“为什么这样建议？”时，基于规则结果和脱敏历史证据生成短解释。

## 产品主链路

```text
准备喝一杯
-> 选择 / 搜索 / 确认饮品
-> 规则计算本次摄入后的残留与风险
-> 输出整杯 / 半杯 / 低因 / 不喝建议
-> 用户展开“为什么这样建议？”
-> AI 基于历史证据生成个性化解释
-> 用户确认行动
-> 状态、反馈和记忆沉淀
-> 下一次建议更贴近用户
```

## AI 与规则的职责边界

Caffeine Coach 不是聊天机器人。当前 AI 节点只服务“喝前模拟解释”，不替代规则判断。

规则层负责：

- 本次饮品咖啡因含量
- 今日累计摄入
- 当前体内剩余
- 睡前预计残留
- 睡眠风险等级
- 整杯 / 半杯 / 低因 / 不喝建议
- 历史有效记录天数、晚间摄入天数、反馈次数和证据门槛

LLM 只负责：

- 从规则层提供的脱敏结构化证据中选择相关观察
- 解释为什么当前规则建议适合这次场景
- 表达数据限制和不确定性
- 生成一条与规则结论一致的行动表达

LLM 不得：

- 重新计算数字
- 改变或放宽规则结论
- 编造饮品、记录、反馈或咖啡因含量
- 把历史共现写成因果
- 做医学诊断
- 生成聊天式长回答

## 技术架构

```text
React + TypeScript + Vite
        |
        | localStorage
        v
记录 / 设置 / 反馈 / 饮品记忆
        |
        v
RuleDecisionSnapshot
        |
        v
Evidence Builder
        |
        v
Vercel Serverless API
        |
        v
OpenAI-compatible LLM
        |
        v
Schema / Safety / Fallback
        |
        v
喝前模拟解释折叠区
```

关键模块：

- `src/decision/caffeineDecisionEngine.ts`：统一规则决策事实源。
- `src/decision/aiExplanationEvidenceBuilder.ts`：构建脱敏 compact evidence context。
- `src/ai/personalizedPreDrinkExplanation.ts`：AI 输出 Schema、Validator、Safety 和 fallback。
- `api/personalized-explanation.ts`：服务端 LLM 调用入口，API Key 只在服务端读取。
- `src/services/personalizedExplanationClient.ts`：前端请求 AI 个性化解释。
- `src/App.tsx`：主产品页面、记录、喝前模拟、洞察和设置入口。

## 评测体系

当前项目建立了专项评测集和发布前验证口径：

- 专项评测集：38 条。
- 本地自动执行：33 条，Hard Gate 和 Expected Check 均通过。
- 真实模型冒烟测试：3 条。
- 其中 2 条由 LLM 直接生成，1 条触发规则 Fallback。
- 最终用户结果：3/3 安全。

这些数据只代表当前设计型评测集和冒烟测试结果，不代表真实用户效果，也不应解读为模型准确率。

评测重点：

- Schema 是否稳定。
- 规则结论是否一致。
- 数字是否只来自 allowedFacts。
- evidenceId 是否合法。
- actionSuggestion 是否在白名单内。
- 是否拦截医学化、因果化、绝对化和内部枚举暴露。
- fallback 后用户最终看到的结果是否安全。

## 已发现并修复的 Bad Case

项目迭代中重点处理过以下类型问题：

- 未知饮品被错误返回候选，已改为 no_match 用户确认兜底。
- 系统预测风险和用户主动不适反馈混用，已区分 predictedRisk 与 userReportedSymptom。
- 首页重复展示豆豆状态、结论和风险标签，已收敛为单一核心建议卡。
- 删除记录直接生效，已增加二次确认。
- 搜索失败自动污染 no_match 记忆，已改为用户确认后才写入。
- LLM 输出输入外数字，已通过 allowedFacts 数字忠实校验拦截。
- LLM 输出 safetyNote / dataLimitation 不稳定，已改为服务端固定注入。
- LLM 使用因果化表达或内部枚举，已通过 Prompt 约束和 Validator 拦截。

## 本地运行方法

安装依赖：

```bash
npm install
```

启动本地开发：

```bash
npm run dev
```

构建：

```bash
npm run build
```

运行个性化解释本地校验：

```bash
node scripts/test-personalized-validation.mjs
```

运行个性化解释离线评测：

```bash
node scripts/run-personalized-explanation-eval.mjs --mode=local
```

## 环境变量说明

复制 `.env.example` 并在本地或部署平台配置对应值。不要把真实 `.env` 文件提交到 Git。

服务端 LLM：

- `LLM_PROVIDER`：模型供应商标识，当前默认 `qwen`。
- `LLM_MODEL`：OpenAI-compatible Chat Completions 模型名。
- `LLM_BASE_URL`：OpenAI-compatible API base URL。
- `LLM_API_KEY`：服务端 API Key，只能在 Serverless Function 中读取。

Preview 测试：

- `TEST_API_BASE_URL`：Preview API 基础地址。
- `VERCEL_AUTOMATION_BYPASS_SECRET`：可选，用于自动化绕过 Vercel Preview Deployment Protection。

## 项目边界

当前版本不做：

- 聊天机器人。
- 医疗诊断。
- 真实 OCR。
- 自然语言记录主入口。
- 复杂多 Agent。
- 向量数据库。
- 自动模型训练。
- 自动调整用户敏感度、推荐量或真实记录。
- 声称改善睡眠、提升健康或服务真实用户。

产品只提供生活方式建议。遇到明显身体不适或高风险健康问题，应停止继续摄入并咨询专业人士。

## 后续迭代计划

- 完成公开 Demo 地址和截图素材。
- 补充 README 图片与演示动图。
- 将浏览器人工验收清单转为更稳定的 Preview 测试流程。
- 增加用户对 AI 解释“有帮助 / 不符合”的本地 Bad Case 记录。
- 根据真实试用反馈调整评测集和解释展示层级。
- 在不改变规则事实源的前提下，继续优化个性化解释质量。

## 项目目录结构

```text
.
├── api/
│   └── personalized-explanation.ts
├── docs/
│   ├── caffeine_coach_prd_ai_decision_system.md
│   ├── caffeine_coach_product_rules.md
│   ├── memory_system_design.md
│   └── stage_*.md
├── evaluation/
│   ├── datasets/
│   ├── personalized_explanation/
│   ├── results/
│   └── runners/
├── scripts/
│   ├── run-personalized-explanation-eval.mjs
│   ├── test-personalized-explanation.mjs
│   └── test-personalized-validation.mjs
├── src/
│   ├── agent/
│   ├── ai/
│   ├── components/
│   ├── data/
│   ├── decision/
│   ├── hooks/
│   ├── services/
│   ├── types/
│   ├── utils/
│   └── App.tsx
├── .env.example
├── package.json
└── README.md
```

## 说明

本项目是个人 AI 产品作品集 Demo。评测集为设计型离线评测集和 Preview 冒烟测试，不包含真实用户日志，不承诺线上业务指标。
