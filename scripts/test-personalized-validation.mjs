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

const fallbackOutput = ruleFallbackExplanation(baseContext, "测试 fallback。");
assert("fallback_uses_same_fixed_safety_note", fallbackOutput.safetyNote === PERSONALIZED_EXPLANATION_SAFETY_NOTE);
assert(
  "fallback_uses_rule_data_limitation",
  fallbackOutput.dataLimitation === buildPersonalizedExplanationDataLimitation({ context: baseContext, source: "fallback" }),
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
