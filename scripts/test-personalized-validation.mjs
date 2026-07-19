#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const outDir = "/private/tmp/caffeine-personalized-validation-test";
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
const decisionModule = await import(pathToFileURL(`${outDir}/src/decision/caffeineDecisionEngine.js`));

const {
  PERSONALIZED_EXPLANATION_SAFETY_NOTE,
  buildPersonalizedExplanationDataLimitation,
  ruleFallbackExplanation,
  validatePersonalizedExplanation,
} = aiModule;
const { calculateRuleDecisionSnapshot } = decisionModule;

function context() {
  return {
    requestId: "validation-test",
    dataVersionHash: "validation-test-v1",
    schemaVersion: "ai-explanation-input-v1",
    ruleDecision: {
      schemaVersion: "rule-decision-v1",
      generatedAt: "2026-07-18T10:00:00.000Z",
      source: "pre_drink_simulation",
      currentTime: "2026-07-18T10:00:00.000Z",
      bedTime: "23:30",
      halfLifeHours: 5,
      safeSleepResidualMg: 30,
      adjustedSleepResidualMg: 30,
      todayTotalMg: 180,
      currentRemainingMg: 90,
      estimatedSleepResidualMg: 68,
      sleepRisk: "中",
      targetIntakeMg: 230,
      canDrinkMg: 50,
      recommendedServingCaffeineMg: 50,
      ruleDecision: "half_cup",
      ruleActionText: "建议改成半杯，或选择低因饮品。",
      allowedActionSuggestions: ["half_cup", "low_caf", "no_more_today"],
      afterTodayTotalMg: 300,
      simulatedDrink: { name: "拿铁", caffeineMg: 120, category: "coffee" },
      reasons: [],
    },
    historicalEvidence: {
      windowDays: 14,
      effectiveRecordDays: 5,
      eveningIntakeDays: 2,
      highResidualDays: 2,
      sleepAffectedFeedbackCount: 0,
      discomfortFeedbackCount: 0,
      highResidualAndSleepFeedbackSameDayCount: 0,
      drinkTypeAndDiscomfortSameDayCount: 0,
      dataCompleteness: "partial",
      minimumEvidenceMet: true,
      evidenceStrength: "medium",
      candidates: [
        {
          evidenceId: "evidence_evening_intake_days_14d",
          observationType: "evening_intake_pattern",
          count: 2,
          summary: "最近有重复晚间摄入现象。",
          requiresFeedback: false,
          relationToDecision: "supports_decision",
          relationSummary: "这条历史观察支持本次控制份量的建议。",
        },
      ],
    },
    evidenceIds: ["evidence_evening_intake_days_14d"],
    allowedFacts: {
      fact_recommended_serving_caffeine_mg: 50,
      fact_estimated_sleep_residual_mg: 68,
      fact_evening_intake_days: 2,
    },
    allowedActionSuggestions: ["half_cup", "low_caf", "no_more_today"],
    constraints: [],
  };
}

function validOutput(overrides = {}) {
  return {
    decision: "half_cup",
    explanation: "这次建议按当前建议量执行。",
    historicalObservation: "近期有重复晚间摄入现象。",
    observationType: "evening_intake_pattern",
    evidenceIds: ["evidence_evening_intake_days_14d"],
    evidenceSummary: "近期有重复晚间摄入现象。",
    actionSuggestion: "half_cup",
    confidence: "medium",
    ...overrides,
  };
}

function assert(name, condition) {
  if (!condition) throw new Error(name);
  console.log(`pass ${name}`);
}

const baseContext = context();

const allowedNumberResult = validatePersonalizedExplanation(
  validOutput({ explanation: "这次建议摄入约 50mg，并继续观察。" }),
  baseContext,
);
assert("allowed_rule_number_passes", allowedNumberResult.valid);

const unknownNumberResult = validatePersonalizedExplanation(
  validOutput({ explanation: "这次喝完可能达到 300mg。" }),
  baseContext,
);
assert("unknown_300_is_blocked", !unknownNumberResult.valid && unknownNumberResult.errorCodes.includes("unknown_number"));
assert("unknown_300_field_is_explanation", !unknownNumberResult.valid && unknownNumberResult.validationFailureField === "explanation");
assert("unknown_300_token_reported", !unknownNumberResult.valid && unknownNumberResult.unexpectedNumberTokens.includes("300"));

const settings = {
  bedTime: "23:30",
  wakeTime: "07:30",
  metabolism: "normal",
  goal: "energy",
  safeSleepResidualMg: 30,
  dailyBaseLimitMg: 500,
  personalDailyLimitMg: 0,
  dailyPersonalLimitMg: 0,
  strictnessMode: "balanced",
  singleComfortMg: 60,
  singleDiscomfortMg: 200,
  palpitationTriggerMg: 999,
  anxietyTriggerMg: 999,
  questionnaireSleepImpact: "none",
  questionnairePalpitation: "never",
  questionnaireAnxiety: "never",
  questionnaireLatteFeeling: "just_right",
};
const feedback = {
  effect: 3,
  sideEffect: "none",
  sleepQuality: "good",
  sleepLatency: "fast",
  afternoonIntake: "no",
  lessEffective: "no",
  palpitationToday: "no",
  anxietyToday: "no",
};
const snapshot = calculateRuleDecisionSnapshot({
  records: [],
  settings,
  feedback,
  currentTime: "2026-07-18T08:00:00.000Z",
  simulatedDrink: { name: "测试饮品", caffeineMg: 90, category: "coffee" },
});
assert("half_cup_recommendation_is_rule_calculated", snapshot.ruleDecision === "half_cup" && snapshot.recommendedServingCaffeineMg === 45);

const noNumberResult = validatePersonalizedExplanation(validOutput(), baseContext);
assert("no_number_output_passes", noNumberResult.valid);
assert(
  "server_injects_fixed_safety_note",
  noNumberResult.valid && noNumberResult.value.safetyNote === PERSONALIZED_EXPLANATION_SAFETY_NOTE,
);
assert(
  "server_injects_rule_data_limitation",
  noNumberResult.valid &&
    noNumberResult.value.dataLimitation === buildPersonalizedExplanationDataLimitation({ context: baseContext, source: "llm" }),
);

const internalEnumResult = validatePersonalizedExplanation(
  validOutput({ explanation: "本次决策为 no_more_today。" }),
  baseContext,
);
assert(
  "internal_decision_enum_is_blocked",
  !internalEnumResult.valid &&
    internalEnumResult.errorCodes.includes("internal_enum_exposed") &&
    internalEnumResult.validationFailureField === "explanation",
);

const repetitiveDecisionResult = validatePersonalizedExplanation(
  validOutput({ explanation: "本次决策为建议半杯。" }),
  baseContext,
);
assert(
  "repetitive_decision_phrase_is_blocked",
  !repetitiveDecisionResult.valid && repetitiveDecisionResult.errorCodes.includes("internal_enum_exposed"),
);

const internalProductLanguageResult = validatePersonalizedExplanation(
  validOutput({ explanation: "规则层建议这次更谨慎。" }),
  baseContext,
);
assert(
  "internal_product_language_is_blocked",
  !internalProductLanguageResult.valid && internalProductLanguageResult.errorCodes.includes("internal_enum_exposed"),
);

const fallbackOutput = ruleFallbackExplanation(baseContext, "测试 fallback。");
assert("fallback_uses_same_fixed_safety_note", fallbackOutput.safetyNote === PERSONALIZED_EXPLANATION_SAFETY_NOTE);
assert(
  "validation_failed_fallback_does_not_claim_insufficient_records",
  fallbackOutput.dataLimitation === buildPersonalizedExplanationDataLimitation({ context: baseContext, source: "unavailable" }) &&
    !fallbackOutput.dataLimitation.includes("有效记录较少"),
);

const insufficientEvidenceFallbackOutput = ruleFallbackExplanation(baseContext, "测试 insufficient evidence。", "insufficient_evidence");
assert(
  "insufficient_evidence_fallback_mentions_recent_records_but_insufficient_repetition",
  insufficientEvidenceFallbackOutput.dataLimitation ===
    buildPersonalizedExplanationDataLimitation({ context: baseContext, source: "insufficient_evidence" }) &&
    insufficientEvidenceFallbackOutput.dataLimitation.includes("最近14天") &&
    insufficientEvidenceFallbackOutput.dataLimitation.includes("没有足够重复的现象"),
);

const customDataLimitationResult = validatePersonalizedExplanation(
  validOutput({ dataLimitation: "模型自定义数据限制说明。" }),
  baseContext,
);
assert(
  "model_data_limitation_is_rejected",
  !customDataLimitationResult.valid && customDataLimitationResult.errorCodes.includes("extra_data_limitation"),
);

const customSafetyNoteResult = validatePersonalizedExplanation(
  validOutput({ safetyNote: "模型自定义安全提示。" }),
  baseContext,
);
assert(
  "model_safety_note_is_rejected",
  !customSafetyNoteResult.valid && customSafetyNoteResult.errorCodes.includes("extra_safety_note"),
);

const decisionMismatchResult = validatePersonalizedExplanation(validOutput({ decision: "full_cup" }), baseContext);
assert("decision_mismatch_still_blocked", !decisionMismatchResult.valid && decisionMismatchResult.errorCodes.includes("decision_mismatch"));

const invalidEvidenceResult = validatePersonalizedExplanation(validOutput({ evidenceIds: ["bad_evidence"] }), baseContext);
assert("invalid_evidence_id_still_blocked", !invalidEvidenceResult.valid && invalidEvidenceResult.errorCodes.includes("invalid_evidence_id"));

const schemaResult = validatePersonalizedExplanation({ decision: "half_cup" }, baseContext);
assert("schema_validation_still_active", !schemaResult.valid && schemaResult.errorCodes.includes("schema"));

const safetyResult = validatePersonalizedExplanation(validOutput({ explanation: "这可以保证睡眠。" }), baseContext);
assert("safety_validation_still_active", !safetyResult.valid && safetyResult.errorCodes.includes("absolute_claim"));

const causalLeadsToResult = validatePersonalizedExplanation(validOutput({ explanation: "晚喝咖啡导致失眠。" }), baseContext);
assert(
  "explicit_leads_to_is_causal_claim",
  !causalLeadsToResult.valid &&
    causalLeadsToResult.errorCodes.includes("causal_claim") &&
    causalLeadsToResult.validationFailureField === "explanation" &&
    causalLeadsToResult.safetyTriggerCode === "leads_to",
);

const causalCauseResult = validatePersonalizedExplanation(validOutput({ explanation: "晚喝咖啡一定会造成睡眠问题。" }), baseContext);
assert(
  "guaranteed_cause_is_causal_claim",
  !causalCauseResult.valid &&
    causalCauseResult.errorCodes.includes("causal_claim") &&
    causalCauseResult.validationFailureField === "explanation",
);

const causalWillMakeResult = validatePersonalizedExplanation(validOutput({ explanation: "晚间饮用会让你睡不好。" }), baseContext);
assert(
  "will_make_sleep_worse_is_causal_claim",
  !causalWillMakeResult.valid &&
    causalWillMakeResult.errorCodes.includes("causal_claim") &&
    causalWillMakeResult.validationFailureField === "explanation",
);

const coOccurrenceResult = validatePersonalizedExplanation(
  validOutput({ explanation: "近期记录中晚间饮用与较差反馈同时出现。" }),
  baseContext,
);
assert("co_occurrence_language_passes", coOccurrenceResult.valid);

const recommendationConnectorResult = validatePersonalizedExplanation(
  validOutput({ explanation: "基于近期记录，因此建议选择半杯。" }),
  baseContext,
);
assert("therefore_recommendation_connector_passes", recommendationConnectorResult.valid);

const referenceNotCausalResult = validatePersonalizedExplanation(
  validOutput({ explanation: "这些记录仅作为当前建议的参考，不代表因果关系。" }),
  baseContext,
);
assert("reference_not_causal_language_passes", referenceNotCausalResult.valid);

const medicalResult = validatePersonalizedExplanation(validOutput({ explanation: "这可以治疗睡眠问题。" }), baseContext);
assert("medical_claim_still_blocked", !medicalResult.valid && medicalResult.errorCodes.includes("medical_claim"));

function fullCupContrastContext() {
  return {
    ...baseContext,
    ruleDecision: {
      ...baseContext.ruleDecision,
      estimatedSleepResidualMg: 25,
      sleepRisk: "低",
      canDrinkMg: 180,
      recommendedServingCaffeineMg: 120,
      ruleDecision: "full_cup",
      ruleActionText: "可以饮用，建议慢慢喝并留意身体反馈。",
      allowedActionSuggestions: ["full_cup", "half_cup", "low_caf", "no_more_today"],
      afterTodayTotalMg: 120,
    },
    historicalEvidence: {
      ...baseContext.historicalEvidence,
      candidates: [
        {
          evidenceId: "evidence_high_residual_sleep_overlap_14d",
          observationType: "sleep_feedback_overlap",
          count: 3,
          summary: "有 3 天同时出现高残留和睡眠受影响反馈。",
          requiresFeedback: true,
          relationToDecision: "contrasts_with_decision",
          relationSummary: "这条历史观察属于对照：历史场景残留更高，而本次预计残留低于当前默认参考目标。",
        },
      ],
    },
    evidenceIds: ["evidence_high_residual_sleep_overlap_14d"],
    allowedFacts: {
      fact_estimated_sleep_residual_mg: 25,
      fact_safe_sleep_residual_mg: 30,
      fact_high_residual_sleep_overlap_count: 3,
      fact_decision: "full_cup",
      fact_sleep_risk: "低",
    },
    allowedActionSuggestions: ["full_cup", "half_cup", "low_caf", "no_more_today"],
  };
}

function fullCupOutput(overrides = {}) {
  return {
    decision: "full_cup",
    explanation: "本次睡前预计残留低于当前默认参考目标，按当前规则判定为低风险，可以饮用。",
    historicalObservation: "过去有高残留和睡眠反馈同时出现的记录，但本次低于当前默认参考目标，与历史高残留场景不同。",
    observationType: "sleep_feedback_overlap",
    evidenceIds: ["evidence_high_residual_sleep_overlap_14d"],
    evidenceSummary: "有 3 天同时出现高残留和睡眠受影响反馈。",
    actionSuggestion: "full_cup",
    confidence: "medium",
    ...overrides,
  };
}

const fullCupContrastResult = validatePersonalizedExplanation(fullCupOutput(), fullCupContrastContext());
assert("full_cup_contrast_history_explains_difference", fullCupContrastResult.valid);

const fullCupUnexplainedNegativeResult = validatePersonalizedExplanation(
  fullCupOutput({
    explanation: "本次可以饮用。",
    historicalObservation: "有 3 天同时出现高残留和睡眠受影响反馈。",
  }),
  fullCupContrastContext(),
);
assert(
  "full_cup_unexplained_negative_history_is_blocked",
  !fullCupUnexplainedNegativeResult.valid && fullCupUnexplainedNegativeResult.errorCodes.includes("evidence_relevance_mismatch"),
);

const fullCupNoHistoryContext = {
  ...fullCupContrastContext(),
  historicalEvidence: { ...fullCupContrastContext().historicalEvidence, candidates: [] },
  evidenceIds: [],
};
const fullCupNoHistoryResult = validatePersonalizedExplanation(
  fullCupOutput({
    historicalObservation: null,
    observationType: "none",
    evidenceIds: [],
    evidenceSummary: "",
  }),
  fullCupNoHistoryContext,
);
assert("full_cup_no_relevant_history_can_return_null_observation", fullCupNoHistoryResult.valid);

const noMoreTodaySupportContext = {
  ...baseContext,
  ruleDecision: {
    ...baseContext.ruleDecision,
    ruleDecision: "no_more_today",
    ruleActionText: "今天建议先不继续摄入咖啡因。",
    allowedActionSuggestions: ["no_more_today"],
    estimatedSleepResidualMg: 110,
    sleepRisk: "高",
    recommendedServingCaffeineMg: 0,
  },
  historicalEvidence: {
    ...baseContext.historicalEvidence,
    candidates: [
      {
        evidenceId: "evidence_high_residual_sleep_overlap_14d",
        observationType: "sleep_feedback_overlap",
        count: 3,
        summary: "有 3 天同时出现高残留和睡眠受影响反馈。",
        requiresFeedback: true,
        relationToDecision: "supports_decision",
        relationSummary: "这条历史观察支持今天先暂停咖啡因的建议。",
      },
    ],
  },
  evidenceIds: ["evidence_high_residual_sleep_overlap_14d"],
  allowedFacts: {
    fact_estimated_sleep_residual_mg: 110,
    fact_high_residual_sleep_overlap_count: 3,
  },
  allowedActionSuggestions: ["no_more_today"],
};
const noMoreTodaySupportResult = validatePersonalizedExplanation(
  {
    ...validOutput({
      decision: "no_more_today",
      explanation: "本次建议先暂停摄入。",
      historicalObservation: "近期有高残留和睡眠反馈同时出现的记录。",
      observationType: "sleep_feedback_overlap",
      evidenceIds: ["evidence_high_residual_sleep_overlap_14d"],
      evidenceSummary: "有 3 天同时出现高残留和睡眠受影响反馈。",
      actionSuggestion: "no_more_today",
    }),
  },
  noMoreTodaySupportContext,
);
assert("no_more_today_negative_history_can_support_decision", noMoreTodaySupportResult.valid);
assert(
  "structured_decision_enum_is_allowed",
  noMoreTodaySupportResult.valid && noMoreTodaySupportResult.value.decision === "no_more_today",
);
assert(
  "structured_action_suggestion_enum_is_allowed",
  noMoreTodaySupportResult.valid && noMoreTodaySupportResult.value.actionSuggestion === "no_more_today",
);

const visibleTextForNoMoreToday = noMoreTodaySupportResult.valid
  ? [
      noMoreTodaySupportResult.value.explanation,
      noMoreTodaySupportResult.value.historicalObservation || "",
      noMoreTodaySupportResult.value.evidenceSummary,
      noMoreTodaySupportResult.value.dataLimitation,
      noMoreTodaySupportResult.value.safetyNote,
    ].join(" ")
  : "";
assert("llm_success_visible_text_has_no_internal_enum", !/\b(full_cup|half_cup|low_caf|no_more_today)\b/.test(visibleTextForNoMoreToday));

const safetyRangeResult = validatePersonalizedExplanation(validOutput({ explanation: "这次处于安全范围。" }), baseContext);
assert("safety_range_wording_is_blocked", !safetyRangeResult.valid && safetyRangeResult.errorCodes.includes("range_claim"));
