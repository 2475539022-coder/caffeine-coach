# AI 个性化喝前解释评测阶段报告

## 1. 本轮范围

本轮只为 Caffeine Coach 当前「AI 个性化喝前解释」建立并执行一套实用评测系统。

已完成：

- 生成 Dataset 初稿；
- 建立 Dataset / Run Results / Human Review 三层结构；
- 编写本地与 Preview 共用的评测脚本；
- 执行 local 模式确定性 Hard Gate；
- 保留人工评分与浏览器验收入口。

未做：

- 未修改 Prompt；
- 未修改规则引擎；
- 未修改 Evidence Builder；
- 未修改 Validator；
- 未修改 API；
- 未修改 UI；
- 未修改模型或 Vercel 配置；
- 未执行 Preview 真实模型评测；
- 未填写人工评分；
- 未声称真实用户效果。

## 2. 文件结构

```text
evaluation/personalized_explanation/
├── dataset.json
├── run_results/
│   ├── latest.json
│   ├── pe_eval_local_*.json
└── human_review/
    ├── latest.json
    └── pe_eval_local_*.json

scripts/
└── run-personalized-explanation-eval.mjs
```

## 3. Dataset 数量与分布

总 Case 数：38 条。

### Decision 分布

| decision | 数量 |
|---|---:|
| full_cup | 8 |
| half_cup | 12 |
| low_caf | 8 |
| no_more_today | 10 |

### primary_case_type 分布

| primary_case_type | 数量 |
|---|---:|
| normal | 5 |
| confusing | 2 |
| boundary | 18 |
| fallback | 5 |
| frontend | 5 |
| preview | 3 |

### 主要 risk_tags 覆盖

- `supports_decision`
- `contrasts_with_decision`
- `no_relevant_history`
- `insufficient_evidence`
- `internal_enum`
- `number_faithfulness`
- `invalid_evidence_id`
- `decision_mismatch`
- `action_more_permissive`
- `medical_claim`
- `causal_claim`
- `absolute_claim`
- `schema`
- `safety_range`
- `evidence_strength_mismatch`
- `fallback_wording`
- `service_unavailable`
- `frontend_mapping`
- `bottom_note`
- `cache`
- `browser_manual`
- `preview_required`

## 4. 三层数据结构

### Dataset

路径：

```text
evaluation/personalized_explanation/dataset.json
```

只包含：

- `case_id`
- `primary_case_type`
- `risk_tags`
- `stage_id`
- `scenario_summary`
- `decision`
- `input`
- `expected`

不包含：

- 真实模型输出；
- 实际 fallback；
- 延迟；
- 人工评分；
- 复测结果。

### Run Results

路径：

```text
evaluation/personalized_explanation/run_results/
```

每次运行都会生成一个带 `run_id` 的结果文件，不覆盖历史结果。`latest.json` 只作为最近一次运行的快捷入口。

记录：

- `source`
- `fallbackType`
- `validationFailureCode`
- `validationFailureField`
- `safetyTriggerCode`
- 脱敏 `system_output`
- `elapsedMs`
- `version`
- `hard_gate`
- `expected_checks`

脱敏 `system_output` 只保留：

- `explanation`
- `historicalObservation`
- `evidenceSummary`
- `evidenceIds`
- `actionSuggestion`
- `confidence`
- `dataLimitation`
- `safetyNote`

### Human Review

路径：

```text
evaluation/personalized_explanation/human_review/
```

当前所有质量评分字段均为：

```text
pending_human_review
```

等待人工补充：

- 证据相关性；
- 解释清晰度；
- 简洁性；
- 行动性；
- 前端信息层级；
- 失败维度；
- 根因；
- 复测结果。

## 5. Hard Gate

当前自动 Hard Gate 覆盖：

- Schema；
- Decision 一致性；
- 数字忠实；
- Evidence ID 合法性；
- Action 一致性；
- 医学化表达；
- 因果化表达；
- 绝对化表达；
- 内部枚举；
- Fallback 类型与文案。

同时区分：

- 模型是否生成违规内容；
- Validator 是否成功拦截；
- 用户最终结果是否安全。

本轮补充了 Dataset / Context 一致性检查：

- Dataset `decision` 必须与 Context `ruleDecision` 一致；
- `afterTodayTotalMg` 必须等于 `todayTotalMg + simulatedDrink.caffeineMg`；
- `reasons` 中的睡前残留数值必须与当前 `estimatedSleepResidualMg` 一致；
- `historicalEvidence` 与 `allowedFacts` 必须从同一份场景统计生成；
- 没有历史模式的场景不得保留默认历史事实。

本轮也补充了 expected 字段执行检查：

- `expected.mode`
- `expected_validation_failure_code`
- `expected_validation_failure_field`
- `required_text_signals`
- `expected_historical_observation`
- `acceptable_sources`
- `expected_user_final_safe`

## 6. 本地执行结果

执行命令：

```bash
node scripts/run-personalized-explanation-eval.mjs --mode=local
```

最近一次结果：

```text
run_id: pe_eval_local_2026-07-19T02-40-49-139Z
total_cases: 38
run_cases: 33
skipped_cases: 5
hard_gate_pass_cases: 33
hard_gate_fail_cases: 0
expected_check_pass_cases: 33
expected_check_fail_cases: 0
```

说明：

- 33 条确定性样本已执行；
- 5 条浏览器人工样本未在 local 模式执行；
- Preview 真实模型样本尚未运行；
- Human Review 尚未填写。

本轮评测材料修复：

- 修正各 Context 中 `afterTodayTotalMg` 与模拟饮品咖啡因的数值一致性；
- 按场景重构历史统计，不再给所有 Context 默认注入全部历史事实；
- `full_cup_no_history` 已清除历史模式事实，并按证据不足 fallback 验收；
- `half_cup_insufficient_evidence` 的历史统计与 `allowedFacts` 已同步为 2 天有效记录、1 天晚间摄入；
- 将参考目标文案统一为“当前默认参考目标”；
- 删除 `pe_eval_033`、`pe_eval_034` 中没有真实重试断言支撑的风险标签。

## 7. 待 Preview 运行的 Case

以下 Case 需要在有 Preview URL 时执行：

- `pe_eval_035`
- `pe_eval_036`
- `pe_eval_037`

运行方式：

```bash
TEST_API_BASE_URL="https://your-preview-url" node scripts/run-personalized-explanation-eval.mjs --mode=preview
```

如果 Preview Deployment Protection 开启，可额外通过环境变量传入绕过密钥；脚本不会打印该值：

```bash
VERCEL_AUTOMATION_BYPASS_SECRET="***" TEST_API_BASE_URL="https://your-preview-url" node scripts/run-personalized-explanation-eval.mjs --mode=preview
```

## 8. 待浏览器验收的 Case

以下 Case 需要在真实页面中人工检查：

- `pe_eval_007`：full_cup 前端中文映射；
- `pe_eval_015`：同一结果缓存复用；
- `pe_eval_023`：底部说明合并；
- `pe_eval_032`：no_more_today 不暴露内部枚举；
- `pe_eval_038`：insufficient_evidence 不重复展示说明模块。

## 9. 待人工评分的 Case

全部 38 条 Case 均待人工评分。

人工评分只用于质量维度：

- 证据相关性；
- 解释清晰度；
- 简洁性；
- 行动性；
- 前端信息层级。

Hard Gate 不用 1-3 分替代，必须单独判定 pass / fail。

## 10. 当前边界

当前评测系统只能证明：

- 离线确定性 Validator 与 Fallback 规则可执行；
- Dataset 已覆盖核心 decision 与风险标签；
- Run Results 与 Human Review 可追溯；
- 本地 Hard Gate 初跑无失败。

当前不能证明：

- 真实 LLM 输出一定稳定；
- 真实用户能理解或满意；
- 饮用行为或睡眠结果改善；
- 线上指标提升；
- 医学有效性。
