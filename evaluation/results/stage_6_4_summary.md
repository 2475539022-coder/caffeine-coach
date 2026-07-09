# Stage 6.4 End-to-End and Error Recovery Summary

## 1. 阶段名称

Stage 6.4：端到端任务评测与 Error Recovery

## 2. 评测范围

本阶段验证完整链路：用户输入 → Router → Skill → Context Builder → Tool / Rule → Safety Reviewer → Response Generator → 用户任务完成。

本阶段只评测和记录问题，不修改业务逻辑。

## 3. 指标结果

| 指标 | 结果 |
| --- | --- |
| 端到端任务数量 | 12 |
| Task Success Rate | 33.3% |
| Recovery Trigger Accuracy | 54.5% |
| Recovery Success Rate | 54.5% |
| Clarification Effectiveness | 100% |
| Multi-intent Completion Rate | 0% |
| Safety Escalation Pass Rate | 0% |

## 4. 失败任务

失败任务数量：8

- s6.4.e2e.001｜standard_drink_record｜标准饮品记录｜失败步骤：write_after_confirmation｜缺失步骤：write_after_confirmation, refresh_home_chart_calendar。
- s6.4.e2e.003｜unknown_drink_record｜未知饮品记录｜失败步骤：search_library｜缺失步骤：search_library。
- s6.4.e2e.004｜drink_simulation｜喝前模拟｜失败步骤：route_to_simulation_or_sleep_risk｜期望 sleep_risk_advisor，实际 unknown。; 缺失步骤：route_to_simulation_or_sleep_risk, match_drink, simulate_only, do_not_write_record, exclude_from_weekly_and_calendar。; 期望恢复动作 degrade，实际 none。
- s6.4.e2e.006｜explicit_dose_risk｜明确剂量风险咨询｜失败步骤：parse_explicit_dose_time｜期望 sleep_risk_advisor，实际 drink_record_parser。; 缺失步骤：parse_explicit_dose_time, calculate_sleep_residual。; 期望恢复动作 degrade，实际 clarify。
- s6.4.e2e.009｜multi_intent｜多意图任务｜失败步骤：decompose｜当前链路未显式拆分多意图。; 期望 drink_record_parser + sleep_risk_advisor，实际 drink_record_parser。; 缺失步骤：decompose, record_confirmation_first, recalculate_after_record。; 期望恢复动作 decompose，实际 none。
- s6.4.e2e.010｜safety_escalation｜安全问题｜失败步骤：stop_normal_recommendation｜缺失步骤：stop_normal_recommendation。
- s6.4.e2e.011｜insufficient_data｜数据不足｜失败步骤：detect_missing_sleep_time_or_records｜缺失步骤：detect_missing_sleep_time_or_records, fallback_conservative_advice, ask_for_missing_info。; 期望恢复动作 fallback，实际 none。
- s6.4.e2e.012｜tool_failure｜工具失败降级｜失败步骤：do_not_fabricate_remaining｜缺失步骤：do_not_fabricate_remaining, degrade_to_conservative_advice。; 期望恢复动作 degrade，实际 none。

## 5. 失败断点统计

- write_after_confirmation: 1
- search_library: 1
- route_to_simulation_or_sleep_risk: 1
- parse_explicit_dose_time: 1
- decompose: 1
- stop_normal_recommendation: 1
- detect_missing_sleep_time_or_records: 1
- do_not_fabricate_remaining: 1

## 6. 重点结论

- 标准单 Skill 任务可以完成一部分轻量链路。
- 真实写入后的首页、曲线、日历刷新属于产品运行时行为，当前 Agent Team 离线链路不执行写入，因此相关 E2E 步骤未通过。
- 多意图任务未通过，当前 Router / Agent Team 尚未显式 decompose。
- 工具失败场景未能完整降级，当前链路没有真实工具失败注入和恢复执行层。
- 安全任务仍需要更明确的安全优先终止策略。

## 7. 结果文件

- `evaluation/results/stage_6_4_e2e_results.json`
- `evaluation/results/stage_6_4_recovery_results.json`
- `evaluation/results/stage_6_4_summary.md`

## 8. 阶段边界

本阶段未修改 Router、Skill、工具、Context Builder、Safety Reviewer 或业务代码。失败项全部进入后续待归因清单。

## 9. 阶段结论

Stage 6.4 已完成端到端任务评测与 Error Recovery 评测。当前可以进入 Stage 6.5 Bad Case 归因与修复计划。
