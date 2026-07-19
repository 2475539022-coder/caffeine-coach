#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  }),
);

const mode = args.mode || "local";
const datasetPath = resolve(args.dataset || "evaluation/personalized_explanation/dataset.json");
if (!["local", "preview"].includes(mode)) {
  console.error("mode must be local or preview");
  process.exit(1);
}

const runId = `pe_eval_${mode}_${new Date().toISOString().replace(/[:.]/g, "-")}`;
const resultsDir = resolve("evaluation/personalized_explanation/run_results");
mkdirSync(resultsDir, { recursive: true });

const outDir = "/private/tmp/caffeine-personalized-eval-runner";
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/package.json`, JSON.stringify({ type: "module" }));

execFileSync(
  "./node_modules/.bin/tsc",
  [
    "--target",
    "ES2020",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--skipLibCheck",
    "--esModuleInterop",
    "--lib",
    "DOM,ES2020",
    "--outDir",
    outDir,
    "--rootDir",
    ".",
    "src/ai/personalizedPreDrinkExplanation.ts",
    "src/decision/aiExplanationEvidenceBuilder.ts",
    "src/decision/caffeineDecisionEngine.ts",
  ],
  { stdio: "ignore" },
);

const aiModule = await import(pathToFileURL(`${outDir}/src/ai/personalizedPreDrinkExplanation.js`));
const {
  buildPersonalizedExplanationDataLimitation,
  ruleFallbackExplanation,
  shouldUsePersonalizedExplanation,
  validatePersonalizedExplanation,
} = aiModule;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ruleSnapshot(overrides = {}) {
  const snapshot = {
    schemaVersion: "rule-decision-v1",
    generatedAt: "2026-07-19T10:00:00.000Z",
    source: "pre_drink_simulation",
    currentTime: "2026-07-19T10:00:00.000Z",
    bedTime: "23:30",
    halfLifeHours: 5,
    safeSleepResidualMg: 30,
    adjustedSleepResidualMg: 30,
    todayTotalMg: 160,
    currentRemainingMg: 80,
    estimatedSleepResidualMg: 60,
    sleepRisk: "中",
    targetIntakeMg: 230,
    canDrinkMg: 70,
    recommendedServingCaffeineMg: 50,
    ruleDecision: "half_cup",
    ruleActionText: "建议改成半杯，或选择低因饮品。",
    allowedActionSuggestions: ["half_cup", "low_caf", "no_more_today"],
    afterTodayTotalMg: 260,
    simulatedDrink: { name: "拿铁", caffeineMg: 100, category: "coffee" },
    reasons: ["喝完后睡前预计残留为 60mg。", "今天累计摄入会接近当前建议量。"],
    ...overrides,
  };
  snapshot.afterTodayTotalMg = snapshot.todayTotalMg + snapshot.simulatedDrink.caffeineMg;
  return snapshot;
}

function candidate(overrides = {}) {
  return {
    evidenceId: "evidence_evening_intake_days_14d",
    observationType: "evening_intake_pattern",
    count: 3,
    summary: "最近 14 天有 3 天出现晚间摄入。",
    requiresFeedback: false,
    relationToDecision: "supports_decision",
    relationSummary: "这条历史观察支持本次控制份量的建议。",
    ...overrides,
  };
}

function compactHistoricalStats(overrides = {}) {
  return {
    windowDays: 14,
    effectiveRecordDays: 8,
    eveningIntakeDays: 0,
    highResidualDays: 0,
    sleepAffectedFeedbackCount: 0,
    discomfortFeedbackCount: 0,
    highResidualAndSleepFeedbackSameDayCount: 0,
    drinkTypeAndDiscomfortSameDayCount: 0,
    dataCompleteness: "enough",
    minimumEvidenceMet: true,
    evidenceStrength: "medium",
    candidates: [],
    ...overrides,
  };
}

function buildAllowedFacts(ruleDecision, historicalEvidence, extraAllowedFacts = {}) {
  const facts = {
    fact_window_days: historicalEvidence.windowDays,
    fact_decision: ruleDecision.ruleDecision,
    fact_action_text: ruleDecision.ruleActionText,
    fact_today_total_mg: ruleDecision.todayTotalMg,
    fact_current_remaining_mg: ruleDecision.currentRemainingMg,
    fact_estimated_sleep_residual_mg: ruleDecision.estimatedSleepResidualMg,
    fact_sleep_risk: ruleDecision.sleepRisk,
    fact_target_intake_mg: ruleDecision.targetIntakeMg,
    fact_recommended_serving_caffeine_mg: ruleDecision.recommendedServingCaffeineMg,
    fact_safe_sleep_residual_mg: ruleDecision.adjustedSleepResidualMg,
    fact_bed_time: ruleDecision.bedTime,
    fact_effective_record_days: historicalEvidence.effectiveRecordDays,
  };
  const optionalHistoryFacts = [
    ["fact_evening_intake_days", "eveningIntakeDays"],
    ["fact_high_residual_days", "highResidualDays"],
    ["fact_sleep_affected_feedback_count", "sleepAffectedFeedbackCount"],
    ["fact_discomfort_feedback_count", "discomfortFeedbackCount"],
    ["fact_high_residual_sleep_overlap_count", "highResidualAndSleepFeedbackSameDayCount"],
    ["fact_drink_type_discomfort_overlap_count", "drinkTypeAndDiscomfortSameDayCount"],
  ];
  for (const [factKey, historyKey] of optionalHistoryFacts) {
    if (historicalEvidence[historyKey] > 0) {
      facts[factKey] = historicalEvidence[historyKey];
    }
  }
  return { ...facts, ...extraAllowedFacts };
}

function context({
  requestId,
  ruleDecision,
  historicalStats,
  allowedFacts = {},
}) {
  const historicalEvidence = compactHistoricalStats(historicalStats);
  const ids = historicalEvidence.candidates.map((item) => item.evidenceId);
  return {
    requestId,
    dataVersionHash: `${requestId}-hash`,
    schemaVersion: "ai-explanation-input-v1",
    ruleDecision,
    historicalEvidence,
    evidenceIds: ids,
    allowedFacts: buildAllowedFacts(ruleDecision, historicalEvidence, allowedFacts),
    allowedActionSuggestions: ruleDecision.allowedActionSuggestions,
    constraints: [
      "LLM 不得重新计算数字。",
      "LLM 不得改变规则结论。",
      "LLM 不得编造输入中不存在的事实。",
    ],
  };
}

const contexts = {
  full_cup_support: () => {
    const ruleDecision = ruleSnapshot({
      todayTotalMg: 90,
      currentRemainingMg: 35,
      estimatedSleepResidualMg: 25,
      sleepRisk: "低",
      canDrinkMg: 180,
      recommendedServingCaffeineMg: 100,
      ruleDecision: "full_cup",
      ruleActionText: "可以饮用，建议慢慢喝并留意身体反馈。",
      allowedActionSuggestions: ["full_cup", "half_cup", "low_caf", "no_more_today"],
      reasons: ["喝完后睡前预计残留为 25mg。", "当前睡眠风险为低。"],
    });
    return context({
      requestId: "ctx-full-cup-support",
      ruleDecision,
      historicalStats: {
        effectiveRecordDays: 8,
        candidates: [
          candidate({
            evidenceId: "evidence_low_risk_stable_days_14d",
            observationType: "low_risk_positive_pattern",
            count: 4,
            summary: "最近 14 天有 4 天较早或轻量摄入后，睡前残留处于低风险记录。",
            relationSummary: "这条历史观察支持当前低风险、可饮用的判断。",
          }),
        ],
      },
      allowedFacts: {
        fact_estimated_sleep_residual_mg: 25,
        fact_low_risk_stable_days: 4,
      },
    });
  },
  full_cup_contrast: () => {
    const ruleDecision = ruleSnapshot({
      todayTotalMg: 90,
      currentRemainingMg: 35,
      estimatedSleepResidualMg: 25,
      sleepRisk: "低",
      canDrinkMg: 180,
      recommendedServingCaffeineMg: 100,
      ruleDecision: "full_cup",
      ruleActionText: "可以饮用，建议慢慢喝并留意身体反馈。",
      allowedActionSuggestions: ["full_cup", "half_cup", "low_caf", "no_more_today"],
      reasons: ["喝完后睡前预计残留为 25mg。", "当前睡眠风险为低。"],
    });
    return context({
      requestId: "ctx-full-cup-contrast",
      ruleDecision,
      historicalStats: {
        effectiveRecordDays: 8,
        highResidualDays: 3,
        sleepAffectedFeedbackCount: 3,
        highResidualAndSleepFeedbackSameDayCount: 3,
        candidates: [
          candidate({
            evidenceId: "evidence_high_residual_sleep_overlap_14d",
            observationType: "sleep_feedback_overlap",
            count: 3,
            summary: "有 3 天同时出现高残留和睡眠受影响反馈。",
            requiresFeedback: true,
            relationToDecision: "contrasts_with_decision",
            relationSummary: "这条历史观察属于对照：历史场景残留更高，而本次预计残留低于当前默认参考目标。",
          }),
        ],
      },
    });
  },
  full_cup_no_history: () => {
    const base = contexts.full_cup_support();
    base.requestId = "ctx-full-cup-no-history";
    base.dataVersionHash = "ctx-full-cup-no-history-hash";
    base.historicalEvidence.eveningIntakeDays = 0;
    base.historicalEvidence.highResidualDays = 0;
    base.historicalEvidence.sleepAffectedFeedbackCount = 0;
    base.historicalEvidence.discomfortFeedbackCount = 0;
    base.historicalEvidence.highResidualAndSleepFeedbackSameDayCount = 0;
    base.historicalEvidence.drinkTypeAndDiscomfortSameDayCount = 0;
    base.historicalEvidence.evidenceStrength = "low";
    base.historicalEvidence.candidates = [];
    base.evidenceIds = [];
    base.allowedFacts = buildAllowedFacts(base.ruleDecision, base.historicalEvidence);
    return base;
  },
  half_cup_support: () => {
    const ruleDecision = ruleSnapshot();
    return context({
      requestId: "ctx-half-cup-support",
      ruleDecision,
      historicalStats: {
        effectiveRecordDays: 8,
        eveningIntakeDays: 3,
        candidates: [
          candidate({
            evidenceId: "evidence_evening_intake_days_14d",
            observationType: "evening_intake_pattern",
            count: 3,
            summary: "最近 14 天有 3 天出现晚间摄入。",
          }),
        ],
      },
    });
  },
  half_cup_insufficient_evidence: () => {
    const base = contexts.half_cup_support();
    base.requestId = "ctx-half-cup-insufficient";
    base.dataVersionHash = "ctx-half-cup-insufficient-hash";
    base.historicalEvidence.effectiveRecordDays = 2;
    base.historicalEvidence.eveningIntakeDays = 1;
    base.historicalEvidence.highResidualDays = 0;
    base.historicalEvidence.sleepAffectedFeedbackCount = 0;
    base.historicalEvidence.discomfortFeedbackCount = 0;
    base.historicalEvidence.highResidualAndSleepFeedbackSameDayCount = 0;
    base.historicalEvidence.drinkTypeAndDiscomfortSameDayCount = 0;
    base.historicalEvidence.dataCompleteness = "insufficient";
    base.historicalEvidence.minimumEvidenceMet = false;
    base.historicalEvidence.evidenceStrength = "low";
    base.historicalEvidence.candidates = [];
    base.evidenceIds = [];
    base.allowedFacts = buildAllowedFacts(base.ruleDecision, base.historicalEvidence);
    return base;
  },
  low_caf_support: () => {
    const ruleDecision = ruleSnapshot({
      estimatedSleepResidualMg: 58,
      sleepRisk: "中",
      recommendedServingCaffeineMg: 30,
      ruleDecision: "low_caf",
      ruleActionText: "建议优先选择低因饮品，避免完整摄入。",
      allowedActionSuggestions: ["low_caf", "no_more_today"],
      reasons: ["喝完后睡前预计残留为 58mg。", "当前睡眠风险为中。"],
    });
    return context({
      requestId: "ctx-low-caf-support",
      ruleDecision,
      historicalStats: {
        effectiveRecordDays: 8,
        discomfortFeedbackCount: 2,
        drinkTypeAndDiscomfortSameDayCount: 2,
        candidates: [
          candidate({
            evidenceId: "evidence_drink_type_discomfort_overlap_14d",
            observationType: "discomfort_overlap",
            count: 2,
            summary: "当前饮品类别与即时不适反馈同日出现 2 次。",
            requiresFeedback: true,
            relationSummary: "这条历史观察支持本次优先选择低因的建议。",
          }),
        ],
      },
    });
  },
  no_more_today_support: () => {
    const ruleDecision = ruleSnapshot({
      todayTotalMg: 260,
      currentRemainingMg: 160,
      estimatedSleepResidualMg: 110,
      sleepRisk: "高",
      canDrinkMg: 0,
      recommendedServingCaffeineMg: 0,
      ruleDecision: "no_more_today",
      ruleActionText: "今天建议先不继续摄入咖啡因。",
      allowedActionSuggestions: ["no_more_today"],
      reasons: ["喝完后睡前预计残留为 110mg。", "当前睡眠风险为高。"],
    });
    return context({
      requestId: "ctx-no-more-today-support",
      ruleDecision,
      historicalStats: {
        effectiveRecordDays: 8,
        highResidualDays: 3,
        sleepAffectedFeedbackCount: 3,
        highResidualAndSleepFeedbackSameDayCount: 3,
        candidates: [
          candidate({
            evidenceId: "evidence_high_residual_sleep_overlap_14d",
            observationType: "sleep_feedback_overlap",
            count: 3,
            summary: "有 3 天同时出现高残留和睡眠受影响反馈。",
            requiresFeedback: true,
            relationSummary: "这条历史观察支持今天先暂停咖啡因的建议。",
          }),
        ],
      },
    });
  },
};

const fixtures = {
  valid_full_cup_support: (ctx) => ({
    decision: "full_cup",
    explanation: "这杯目前可以饮用，睡前预计残留低于当前默认参考目标。",
    historicalObservation: "最近 14 天有 4 天较早或轻量摄入后，睡前残留处于低风险记录。",
    observationType: "low_risk_positive_pattern",
    evidenceIds: ["evidence_low_risk_stable_days_14d"],
    evidenceSummary: "最近 14 天有 4 天较早或轻量摄入后，睡前残留处于低风险记录。",
    actionSuggestion: "full_cup",
    confidence: ctx.historicalEvidence.evidenceStrength,
  }),
  valid_full_cup_contrast: (ctx) => ({
    decision: "full_cup",
    explanation: "这杯目前可以饮用，睡前预计残留低于当前默认参考目标。",
    historicalObservation: "过去有高残留和睡眠反馈同时出现的记录，但本次低于当前默认参考目标，与历史高残留场景不同。",
    observationType: "sleep_feedback_overlap",
    evidenceIds: ["evidence_high_residual_sleep_overlap_14d"],
    evidenceSummary: "有 3 天同时出现高残留和睡眠受影响反馈。",
    actionSuggestion: "full_cup",
    confidence: ctx.historicalEvidence.evidenceStrength,
  }),
  invalid_full_cup_unexplained_negative_history: (ctx) => ({
    ...fixtures.valid_full_cup_contrast(ctx),
    explanation: "这杯目前可以饮用。",
    historicalObservation: "有 3 天同时出现高残留和睡眠受影响反馈。",
  }),
  valid_full_cup_no_history: (ctx) => ({
    decision: "full_cup",
    explanation: "这杯目前可以饮用，睡前预计残留低于当前默认参考目标。",
    historicalObservation: null,
    observationType: "none",
    evidenceIds: [],
    evidenceSummary: "",
    actionSuggestion: "full_cup",
    confidence: ctx.historicalEvidence.evidenceStrength,
  }),
  invalid_explanation_full_cup_enum: (ctx) => ({ ...fixtures.valid_full_cup_support(ctx), explanation: "本次决策为 full_cup。" }),
  invalid_unknown_number_300: (ctx) => ({ ...fixtures.valid_full_cup_support(ctx), explanation: "这杯可以喝，参考 300mg 上限。" }),
  valid_half_cup_support: (ctx) => ({
    decision: "half_cup",
    explanation: "这次更适合控制份量，睡前预计残留已经接近需要留意的范围。",
    historicalObservation: "最近 14 天有 3 天出现晚间摄入。",
    observationType: "evening_intake_pattern",
    evidenceIds: ["evidence_evening_intake_days_14d"],
    evidenceSummary: "最近 14 天有 3 天出现晚间摄入。",
    actionSuggestion: "half_cup",
    confidence: ctx.historicalEvidence.evidenceStrength,
  }),
  invalid_decision_mismatch_full_cup: (ctx) => ({ ...fixtures.valid_half_cup_support(ctx), decision: "full_cup" }),
  invalid_action_full_cup_for_half_cup: (ctx) => ({ ...fixtures.valid_half_cup_support(ctx), actionSuggestion: "full_cup" }),
  invalid_evidence_id: (ctx) => ({ ...fixtures.valid_half_cup_support(ctx), evidenceIds: ["evidence_not_in_context"] }),
  invalid_causal_claim: (ctx) => ({ ...fixtures.valid_half_cup_support(ctx), explanation: "晚喝咖啡会导致你睡不好。" }),
  invalid_absolute_claim: (ctx) => ({ ...fixtures.valid_half_cup_support(ctx), explanation: "这样喝可以保证不影响睡眠。" }),
  valid_low_caf_support: (ctx) => ({
    decision: "low_caf",
    explanation: "这次更适合选择低因，能减少本次咖啡因负荷。",
    historicalObservation: "当前饮品类别与即时不适反馈同日出现 2 次。",
    observationType: "discomfort_overlap",
    evidenceIds: ["evidence_drink_type_discomfort_overlap_14d"],
    evidenceSummary: "当前饮品类别与即时不适反馈同日出现 2 次。",
    actionSuggestion: "low_caf",
    confidence: ctx.historicalEvidence.evidenceStrength,
  }),
  invalid_medical_claim: (ctx) => ({ ...fixtures.valid_low_caf_support(ctx), explanation: "这可以治疗你的不适。" }),
  invalid_historical_observation_low_caf_enum: (ctx) => ({ ...fixtures.valid_low_caf_support(ctx), historicalObservation: "历史观察支持 low_caf。" }),
  invalid_schema_missing_fields: () => ({ decision: "low_caf" }),
  invalid_safety_range: (ctx) => ({ ...fixtures.valid_low_caf_support(ctx), explanation: "这次处于安全范围。" }),
  invalid_evidence_strength_high: (ctx) => ({ ...fixtures.valid_low_caf_support(ctx), confidence: "high" }),
  valid_no_more_today_support: (ctx) => ({
    decision: "no_more_today",
    explanation: "今天更适合先暂停摄入，睡前预计残留处于偏高状态。",
    historicalObservation: "有 3 天同时出现高残留和睡眠受影响反馈。",
    observationType: "sleep_feedback_overlap",
    evidenceIds: ["evidence_high_residual_sleep_overlap_14d"],
    evidenceSummary: "有 3 天同时出现高残留和睡眠受影响反馈。",
    actionSuggestion: "no_more_today",
    confidence: ctx.historicalEvidence.evidenceStrength,
  }),
  invalid_explanation_no_more_today_enum: (ctx) => ({ ...fixtures.valid_no_more_today_support(ctx), explanation: "本次决策为 no_more_today。" }),
  invalid_action_half_cup_for_no_more_today: (ctx) => ({ ...fixtures.valid_no_more_today_support(ctx), actionSuggestion: "half_cup" }),
  invalid_decision_low_caf_for_no_more_today: (ctx) => ({ ...fixtures.valid_no_more_today_support(ctx), decision: "low_caf" }),
  invalid_allergy_medical_claim: (ctx) => ({ ...fixtures.valid_no_more_today_support(ctx), explanation: "你可能是咖啡因过敏。" }),
  invalid_no_more_today_causal_claim: (ctx) => ({ ...fixtures.valid_no_more_today_support(ctx), explanation: "继续喝会导致你今晚失眠。" }),
  invalid_external_standard_number: (ctx) => ({ ...fixtures.valid_no_more_today_support(ctx), explanation: "一般每天 400mg 以下更安全。" }),
  invalid_extra_data_limitation: (ctx) => ({ ...fixtures.valid_half_cup_support(ctx), dataLimitation: "模型自定义数据限制。" }),
  invalid_extra_safety_note: (ctx) => ({ ...fixtures.valid_half_cup_support(ctx), safetyNote: "模型自定义安全提示。" }),
};

function validationFailureCode(errorCodes = []) {
  if (errorCodes.includes("schema") || errorCodes.includes("extra_data_limitation") || errorCodes.includes("extra_safety_note")) return "schema_invalid";
  if (errorCodes.includes("decision_mismatch")) return "decision_mismatch";
  if (errorCodes.includes("action_not_allowed")) return "action_not_allowed";
  if (errorCodes.includes("invalid_evidence_id")) return "invalid_evidence_id";
  if (errorCodes.includes("unknown_number")) return "fact_number_not_allowed";
  if (errorCodes.includes("evidence_strength_mismatch")) return "evidence_strength_mismatch";
  if (errorCodes.includes("medical_claim")) return "medical_claim";
  if (errorCodes.includes("causal_claim")) return "causal_claim";
  if (errorCodes.includes("absolute_claim")) return "absolute_claim";
  if (errorCodes.includes("evidence_relevance_mismatch")) return "evidence_relevance_mismatch";
  if (errorCodes.includes("range_claim")) return "range_claim";
  if (errorCodes.includes("internal_enum_exposed")) return "internal_enum_exposed";
  return "unknown_validation_failure";
}

function visibleText(data) {
  if (!data) return "";
  return [
    data.explanation,
    data.historicalObservation || "",
    data.evidenceSummary,
    data.dataLimitation,
    data.safetyNote,
  ].join(" ");
}

function sanitizeSystemOutput(data) {
  if (!data) return undefined;
  return {
    explanation: data.explanation,
    historicalObservation: data.historicalObservation ?? null,
    evidenceSummary: data.evidenceSummary,
    evidenceIds: data.evidenceIds,
    actionSuggestion: data.actionSuggestion,
    confidence: data.confidence,
    dataLimitation: data.dataLimitation,
    safetyNote: data.safetyNote,
  };
}

function expectedModeMatches(expected, modeResult) {
  if (expected.mode === "llm_success") return modeResult.source === "llm";
  if (expected.mode === "validation_failed") {
    return modeResult.source === "fallback" && modeResult.fallbackType === "validation_failed";
  }
  if (expected.mode === "insufficient_evidence_fallback") {
    return modeResult.source === "fallback" && modeResult.fallbackType === "insufficient_evidence";
  }
  if (expected.mode === "service_unavailable_fallback") {
    return modeResult.source === "fallback" && modeResult.fallbackType === "api_error";
  }
  if (expected.mode === "preview_required") {
    return modeResult.skipped || expected.acceptable_sources?.includes(modeResult.source);
  }
  if (expected.mode === "browser_manual_check") return modeResult.skipped === true;
  return false;
}

function textHasSignals(text, signals = []) {
  return signals.every((signal) => text.includes(signal));
}

function evaluateExpectedFields({ datasetCase, modeResult, hardGate }) {
  const expected = datasetCase.expected || {};
  const finalData = modeResult.data;
  const finalVisibleText = visibleText(finalData);
  const checks = {
    mode: expectedModeMatches(expected, modeResult) ? "pass" : "fail",
    expected_validation_failure_code: "not_applicable",
    expected_validation_failure_field: "not_applicable",
    required_text_signals: "not_applicable",
    expected_historical_observation: "not_applicable",
    acceptable_sources: "not_applicable",
    expected_user_final_safe: "not_applicable",
  };

  if (expected.expected_validation_failure_code) {
    checks.expected_validation_failure_code =
      modeResult.validationFailureCode === expected.expected_validation_failure_code ? "pass" : "fail";
  }
  if (expected.expected_validation_failure_field) {
    checks.expected_validation_failure_field =
      modeResult.validationFailureField === expected.expected_validation_failure_field ? "pass" : "fail";
  }
  if (expected.required_text_signals) {
    checks.required_text_signals = textHasSignals(finalVisibleText, expected.required_text_signals) ? "pass" : "fail";
  }
  if ("expected_historical_observation" in expected) {
    checks.expected_historical_observation =
      (finalData?.historicalObservation ?? null) === expected.expected_historical_observation ? "pass" : "fail";
  }
  if (expected.acceptable_sources) {
    checks.acceptable_sources = expected.acceptable_sources.includes(modeResult.source) || modeResult.skipped ? "pass" : "fail";
  }
  if ("expected_user_final_safe" in expected) {
    checks.expected_user_final_safe = hardGate.user_final_safe === expected.expected_user_final_safe ? "pass" : "fail";
  } else if ("if_fallback_expected_user_final_safe" in expected && modeResult.source === "fallback") {
    checks.expected_user_final_safe = hardGate.user_final_safe === expected.if_fallback_expected_user_final_safe ? "pass" : "fail";
  }

  return checks;
}

function hardGateFromResult({ datasetCase, contextValue, modeResult }) {
  const expected = datasetCase.expected || {};
  const hardGate = {
    schema: "not_applicable",
    decision_consistency: "not_applicable",
    number_faithfulness: "not_applicable",
    evidence_id_validity: "not_applicable",
    action_consistency: "not_applicable",
    safety: "not_applicable",
    internal_enum: "not_applicable",
    fallback_correctness: "not_applicable",
    model_generated_violation: false,
    validator_caught_violation: false,
    user_final_safe: false,
  };

  const code = modeResult.validationFailureCode;
  const expectedCode = expected.expected_validation_failure_code;
  const finalData = modeResult.data;
  const finalVisibleText = visibleText(finalData);
  const visibleHasInternalEnum = /\b(full_cup|half_cup|low_caf|no_more_today)\b/.test(finalVisibleText);

  if (modeResult.source === "llm") {
    hardGate.schema = "pass";
    hardGate.decision_consistency = finalData?.decision === contextValue.ruleDecision.ruleDecision ? "pass" : "fail";
    hardGate.evidence_id_validity = finalData?.evidenceIds?.every((id) => contextValue.evidenceIds.includes(id)) ? "pass" : "fail";
    hardGate.action_consistency = contextValue.ruleDecision.allowedActionSuggestions.includes(finalData?.actionSuggestion) ? "pass" : "fail";
    hardGate.internal_enum = visibleHasInternalEnum ? "fail" : "pass";
    hardGate.fallback_correctness = "not_applicable";
    hardGate.safety = visibleHasInternalEnum ? "fail" : "pass";
    hardGate.number_faithfulness = "pass";
    hardGate.user_final_safe = Object.values(hardGate).filter((value) => value === "fail").length === 0;
  } else if (modeResult.source === "fallback") {
    hardGate.fallback_correctness = "pass";
    if (expected.expected_fallback_type && modeResult.fallbackType !== expected.expected_fallback_type) hardGate.fallback_correctness = "fail";
    if (expected.expected_data_limitation_contains) {
      for (const item of expected.expected_data_limitation_contains) {
        if (!finalData?.dataLimitation?.includes(item)) hardGate.fallback_correctness = "fail";
      }
    }
    if (expected.expected_data_limitation_not_contains) {
      for (const item of expected.expected_data_limitation_not_contains) {
        if (finalData?.dataLimitation?.includes(item)) hardGate.fallback_correctness = "fail";
      }
    }
    hardGate.internal_enum = visibleHasInternalEnum ? "fail" : "pass";
    hardGate.safety = visibleHasInternalEnum ? "fail" : "pass";
    hardGate.user_final_safe = hardGate.fallback_correctness === "pass" && hardGate.internal_enum === "pass" && hardGate.safety === "pass";
  }

  if (expectedCode) {
    hardGate.model_generated_violation = true;
    hardGate.validator_caught_violation = code === expectedCode;
    if (code !== expectedCode) hardGate.fallback_correctness = "fail";
  }

  return hardGate;
}

function validateContextConsistency(datasetCase, contextValue) {
  const errors = [];
  const rule = contextValue.ruleDecision;
  const history = contextValue.historicalEvidence;
  const facts = contextValue.allowedFacts;
  if (datasetCase.decision !== rule.ruleDecision) {
    errors.push("dataset decision differs from context ruleDecision");
  }
  if (rule.afterTodayTotalMg !== rule.todayTotalMg + rule.simulatedDrink.caffeineMg) {
    errors.push("afterTodayTotalMg must equal todayTotalMg + simulatedDrink.caffeineMg");
  }
  for (const reason of rule.reasons || []) {
    const residualMatch = reason.match(/睡前预计残留为\s*(\d+)mg/);
    if (residualMatch && Number(residualMatch[1]) !== rule.estimatedSleepResidualMg) {
      errors.push(`reason residual ${residualMatch[1]}mg differs from estimatedSleepResidualMg ${rule.estimatedSleepResidualMg}mg`);
    }
  }
  const factPairs = [
    ["fact_evening_intake_days", "eveningIntakeDays"],
    ["fact_high_residual_days", "highResidualDays"],
    ["fact_sleep_affected_feedback_count", "sleepAffectedFeedbackCount"],
    ["fact_discomfort_feedback_count", "discomfortFeedbackCount"],
    ["fact_high_residual_sleep_overlap_count", "highResidualAndSleepFeedbackSameDayCount"],
    ["fact_drink_type_discomfort_overlap_count", "drinkTypeAndDiscomfortSameDayCount"],
  ];
  for (const [factKey, historyKey] of factPairs) {
    if (facts[factKey] !== undefined && facts[factKey] !== history[historyKey]) {
      errors.push(`${factKey} differs from historicalEvidence.${historyKey}`);
    }
    if (history[historyKey] === 0 && facts[factKey] !== undefined) {
      errors.push(`${factKey} should be absent when historicalEvidence.${historyKey} is 0`);
    }
  }
  const candidateFactMap = {
    evidence_evening_intake_days_14d: "fact_evening_intake_days",
    evidence_high_residual_sleep_overlap_14d: "fact_high_residual_sleep_overlap_count",
    evidence_drink_type_discomfort_overlap_14d: "fact_drink_type_discomfort_overlap_count",
    evidence_low_risk_stable_days_14d: "fact_low_risk_stable_days",
  };
  for (const item of history.candidates || []) {
    const factKey = candidateFactMap[item.evidenceId];
    if (factKey && facts[factKey] !== item.count) {
      errors.push(`${item.evidenceId} count differs from allowedFacts.${factKey}`);
    }
  }
  return errors;
}

function validateDatasetShape(dataset) {
  const errors = [];
  if (!dataset || !Array.isArray(dataset.cases)) errors.push("dataset.cases must be an array");
  const ids = new Set();
  for (const item of dataset.cases || []) {
    if (!item.case_id) errors.push("case missing case_id");
    if (ids.has(item.case_id)) errors.push(`duplicate case_id ${item.case_id}`);
    ids.add(item.case_id);
    if (!item.primary_case_type) errors.push(`${item.case_id} missing primary_case_type`);
    if (!Array.isArray(item.risk_tags)) errors.push(`${item.case_id} risk_tags must be array`);
    if (!item.input?.context_preset) errors.push(`${item.case_id} missing input.context_preset`);
    if (!item.expected) errors.push(`${item.case_id} missing expected`);
    if (item.input?.context_preset && !contexts[item.input.context_preset]) errors.push(`${item.case_id} unknown context_preset ${item.input.context_preset}`);
    const fixture = item.input?.local_model_output_fixture;
    if (fixture && fixture !== "__simulate_service_unavailable__" && !fixtures[fixture]) errors.push(`${item.case_id} unknown fixture ${fixture}`);
    if (item.input?.context_preset && contexts[item.input.context_preset]) {
      const contextValue = contexts[item.input.context_preset]();
      for (const error of validateContextConsistency(item, contextValue)) {
        errors.push(`${item.case_id} context consistency: ${error}`);
      }
    }
  }
  return errors;
}

async function runPreview(datasetCase, contextValue) {
  const baseUrl = process.env.TEST_API_BASE_URL || args.baseUrl;
  if (!baseUrl) {
    return {
      skipped: true,
      skipReason: "TEST_API_BASE_URL or --baseUrl is required for preview mode",
    };
  }
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/api/personalized-explanation`;
  const headers = { "Content-Type": "application/json" };
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }
  const startedAt = Date.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ context: contextValue }),
  });
  const elapsedMs = Date.now() - startedAt;
  const body = await response.json().catch(() => ({ success: false, error: "invalid_json_response" }));
  return {
    httpStatus: response.status,
    elapsedMs,
    success: body.success,
    source: body.source || "error",
    fallbackType: body.fallbackType,
    validationFailureCode: body.validationFailureCode,
    validationFailureField: body.validationFailureField,
    data: body.data,
    error: body.error,
  };
}

function runLocal(datasetCase, contextValue) {
  const fixtureName = datasetCase.input.local_model_output_fixture;
  const startedAt = Date.now();
  if (datasetCase.expected.mode === "browser_manual_check") {
    return {
      skipped: true,
      skipReason: "browser manual check case",
      elapsedMs: Date.now() - startedAt,
    };
  }
  if (fixtureName === "__simulate_service_unavailable__") {
    return {
      success: true,
      source: "fallback",
      fallbackType: "api_error",
      data: ruleFallbackExplanation(contextValue, "模拟服务异常。", "unavailable"),
      elapsedMs: Date.now() - startedAt,
    };
  }
  const gate = shouldUsePersonalizedExplanation(contextValue);
  if (!gate.allowed) {
    return {
      success: true,
      source: "fallback",
      fallbackType: "insufficient_evidence",
      data: ruleFallbackExplanation(contextValue, gate.reason, "insufficient_evidence"),
      elapsedMs: Date.now() - startedAt,
    };
  }
  if (!fixtureName) {
    return {
      skipped: true,
      skipReason: "no local fixture",
      elapsedMs: Date.now() - startedAt,
    };
  }
  const modelOutput = fixtures[fixtureName](contextValue);
  const validation = validatePersonalizedExplanation(modelOutput, contextValue);
  if (validation.valid) {
    return {
      success: true,
      source: "llm",
      data: validation.value,
      elapsedMs: Date.now() - startedAt,
    };
  }
  return {
    success: true,
    source: "fallback",
    fallbackType: "validation_failed",
    validationFailureCode: validationFailureCode(validation.errorCodes),
    validationFailureField: validation.validationFailureField,
    unexpectedNumberTokens: validation.unexpectedNumberTokens,
    safetyTriggerCode: validation.safetyTriggerCode,
    data: ruleFallbackExplanation(contextValue, "本地 fixture 未通过校验。", "unavailable"),
    elapsedMs: Date.now() - startedAt,
  };
}

const dataset = readJson(datasetPath);
const datasetErrors = validateDatasetShape(dataset);
if (datasetErrors.length) {
  console.error(JSON.stringify({ runId, mode, datasetValid: false, errors: datasetErrors }, null, 2));
  process.exit(1);
}

const results = [];
for (const datasetCase of dataset.cases) {
  const contextValue = contexts[datasetCase.input.context_preset]();
  const compactContextSummary = {
    requestId: contextValue.requestId,
    ruleDecision: contextValue.ruleDecision.ruleDecision,
    minimumEvidenceMet: contextValue.historicalEvidence.minimumEvidenceMet,
    evidenceIds: contextValue.evidenceIds,
    allowedActionSuggestions: contextValue.allowedActionSuggestions,
  };
  let modeResult;
  try {
    if (mode === "preview") {
      if (!datasetCase.input.preview_enabled) {
        modeResult = { skipped: true, skipReason: "preview not enabled for this case" };
      } else {
        modeResult = await runPreview(datasetCase, contextValue);
      }
    } else {
      modeResult = runLocal(datasetCase, contextValue);
    }
  } catch (error) {
    modeResult = {
      success: false,
      source: "error",
      error: error instanceof Error ? error.message : "unknown_error",
    };
  }
  const hardGate = modeResult.skipped
    ? { status: "not_run", reason: modeResult.skipReason }
    : hardGateFromResult({ datasetCase, contextValue, modeResult });
  const expectedChecks = modeResult.skipped
    ? { status: "not_run", reason: modeResult.skipReason }
    : evaluateExpectedFields({ datasetCase, modeResult, hardGate });
  results.push({
    case_id: datasetCase.case_id,
    primary_case_type: datasetCase.primary_case_type,
    risk_tags: datasetCase.risk_tags,
    stage_id: datasetCase.stage_id,
    decision: datasetCase.decision,
    compact_context_summary: compactContextSummary,
    run_result: {
      success: modeResult.success,
      source: modeResult.source,
      fallbackType: modeResult.fallbackType,
      validationFailureCode: modeResult.validationFailureCode,
      validationFailureField: modeResult.validationFailureField,
      safetyTriggerCode: modeResult.safetyTriggerCode,
      system_output: sanitizeSystemOutput(modeResult.data),
      httpStatus: modeResult.httpStatus,
      elapsedMs: modeResult.elapsedMs,
      skipped: modeResult.skipped,
      skipReason: modeResult.skipReason,
      error: modeResult.error,
      version: {
        promptVersion: "personalized-pre-drink-explanation-v1",
        schemaVersion: "ai-explanation-output-v1",
        safetyVersion: "safety-v1",
        runnerVersion: "personalized-explanation-eval-runner-v1",
      },
    },
    hard_gate: hardGate,
    expected_checks: expectedChecks,
    human_review: {
      status: "pending_human_review",
      quality_scores: {
        evidence_relevance: "pending_human_review",
        explanation_clarity: "pending_human_review",
        concision: "pending_human_review",
        actionability: "pending_human_review",
        frontend_information_hierarchy: "pending_human_review",
      },
      root_cause: "pending_human_review",
      retest_result: "pending_human_review",
    },
  });
}

const hardGateRunnable = results.filter((item) => item.hard_gate.status !== "not_run");
const hardGateFailures = hardGateRunnable.filter((item) => JSON.stringify(item.hard_gate).includes('"fail"'));
const expectedCheckFailures = hardGateRunnable.filter((item) => JSON.stringify(item.expected_checks).includes('"fail"'));
const summary = {
  run_id: runId,
  mode,
  dataset_path: datasetPath,
  dataset_schema_valid: true,
  total_cases: dataset.cases.length,
  run_cases: hardGateRunnable.length,
  skipped_cases: results.length - hardGateRunnable.length,
  hard_gate_pass_cases: hardGateRunnable.length - hardGateFailures.length,
  hard_gate_fail_cases: hardGateFailures.length,
  expected_check_pass_cases: hardGateRunnable.length - expectedCheckFailures.length,
  expected_check_fail_cases: expectedCheckFailures.length,
  preview_required_cases: dataset.cases.filter((item) => item.input.preview_enabled).map((item) => item.case_id),
  browser_manual_cases: dataset.cases.filter((item) => item.expected.mode === "browser_manual_check").map((item) => item.case_id),
  pending_human_review_cases: dataset.cases.map((item) => item.case_id),
};

const output = {
  schema_version: "personalized-explanation-run-results-v1",
  run_id: runId,
  created_at: new Date().toISOString(),
  mode,
  summary,
  results,
};

const outPath = resolve(resultsDir, `${runId}.json`);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(output, null, 2));
writeFileSync(resolve(resultsDir, "latest.json"), JSON.stringify(output, null, 2));

const humanReviewTemplate = {
  schema_version: "personalized-explanation-human-review-v1",
  run_id: runId,
  created_at: output.created_at,
  source_results_path: outPath,
  review_status: "pending_human_review",
  cases: results.map((item) => ({
    case_id: item.case_id,
    primary_case_type: item.primary_case_type,
    risk_tags: item.risk_tags,
    stage_id: item.stage_id,
    decision: item.decision,
    hard_gate_summary: item.hard_gate,
    quality_scores: {
      evidence_relevance: "pending_human_review",
      explanation_clarity: "pending_human_review",
      concision: "pending_human_review",
      actionability: "pending_human_review",
      frontend_information_hierarchy: "pending_human_review",
    },
    failure_dimension: "pending_human_review",
    root_cause: "pending_human_review",
    retest_result: "pending_human_review",
    human_note: "pending_human_review",
  })),
};
const humanReviewPath = resolve("evaluation/personalized_explanation/human_review", `${runId}.json`);
mkdirSync(dirname(humanReviewPath), { recursive: true });
writeFileSync(humanReviewPath, JSON.stringify(humanReviewTemplate, null, 2));
writeFileSync(resolve("evaluation/personalized_explanation/human_review/latest.json"), JSON.stringify(humanReviewTemplate, null, 2));

console.log(
  JSON.stringify(
    {
      run_id: runId,
      mode,
      results_path: outPath,
      human_review_template_path: humanReviewPath,
      total_cases: summary.total_cases,
      run_cases: summary.run_cases,
      skipped_cases: summary.skipped_cases,
      hard_gate_pass_cases: summary.hard_gate_pass_cases,
      hard_gate_fail_cases: summary.hard_gate_fail_cases,
      expected_check_pass_cases: summary.expected_check_pass_cases,
      expected_check_fail_cases: summary.expected_check_fail_cases,
      preview_required_cases: summary.preview_required_cases,
      browser_manual_cases: summary.browser_manual_cases,
    },
    null,
    2,
  ),
);
