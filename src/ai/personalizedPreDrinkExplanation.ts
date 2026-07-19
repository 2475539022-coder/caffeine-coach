import type { CompactEvidenceContext, EvidenceStrength, ObservationType } from "../decision/aiExplanationEvidenceBuilder.js";
import type { RuleDecision, RuleActionSuggestion } from "../decision/caffeineDecisionEngine.js";

export type PersonalizedPreDrinkExplanation = {
  decision: RuleDecision;
  explanation: string;
  historicalObservation: string | null;
  observationType: ObservationType;
  evidenceIds: string[];
  evidenceSummary: string;
  dataLimitation: string;
  actionSuggestion: RuleActionSuggestion;
  confidence: EvidenceStrength;
  safetyNote: string;
};

export type ModelPersonalizedPreDrinkExplanation = Omit<PersonalizedPreDrinkExplanation, "dataLimitation" | "safetyNote">;

export const PERSONALIZED_EXPLANATION_SAFETY_NOTE =
  "计算与风险结论由规则生成，本说明仅用于生活方式参考，不是医学诊断。";

const PERSONALIZED_EXPLANATION_DATA_LIMITATION =
  "当前解释基于近期个人记录，仅作为本次饮用建议的参考，不代表确定规律或因果关系。";
const INSUFFICIENT_EVIDENCE_DATA_LIMITATION =
  "已查看你最近14天的饮用与反馈记录，但目前还没有足够重复的现象支持个性化判断。本次建议主要依据规则计算结果。";
const UNAVAILABLE_EXPLANATION_DATA_LIMITATION =
  "个性化说明暂时不可用，当前模拟结论不受影响。";

export type PersonalizedExplanationDataLimitationSource =
  | "llm"
  | "insufficient_evidence"
  | "unavailable";

export type ExplanationValidationErrorCode =
  | "schema"
  | "decision_mismatch"
  | "action_not_allowed"
  | "invalid_evidence_id"
  | "medical_claim"
  | "causal_claim"
  | "absolute_claim"
  | "unknown_number"
  | "evidence_strength_mismatch"
  | "evidence_relevance_mismatch"
  | "range_claim"
  | "internal_enum_exposed"
  | "extra_data_limitation"
  | "extra_safety_note";

export type ExplanationValidationFailureField =
  | "explanation"
  | "historicalObservation"
  | "evidenceSummary"
  | "dataLimitation"
  | "actionSuggestion"
  | "evidenceIds"
  | "unknown";

export type SafetyTriggerCode =
  | "explicit_cause"
  | "leads_to"
  | "results_in"
  | "causes"
  | "guarantees_outcome"
  | "because_therefore_chain"
  | "recommendation_connector"
  | "unknown_causal_pattern";

export type ExplanationValidationResult =
  | { valid: true; value: PersonalizedPreDrinkExplanation }
  | {
      valid: false;
      errors: string[];
      errorCodes: ExplanationValidationErrorCode[];
      retryable: boolean;
      validationFailureField?: ExplanationValidationFailureField;
      unexpectedNumberTokens?: string[];
      safetyTriggerCode?: SafetyTriggerCode;
};

const medicalClaimPattern = /(治疗|疾病|过敏|药物|催吐)/;
const causalClaimPatterns: Array<{ code: SafetyTriggerCode; pattern: RegExp }> = [
  { code: "explicit_cause", pattern: /(造成|引发|证明了|直接造成|直接导致|直接影响|从而导致)/ },
  { code: "leads_to", pattern: /(导致|会导致|会让|会使|使得|使你)/ },
  { code: "results_in", pattern: /(带来.*(结果|问题|影响)|产生.*结果)/ },
  { code: "causes", pattern: /(因果(关系)?(成立|确定|判断|结论)|造成)/ },
  { code: "guarantees_outcome", pattern: /(必然会|一定会)/ },
  { code: "because_therefore_chain", pattern: /(因为.*所以.*(失眠|睡眠问题|心悸|焦虑)|由于.*因此.*(失眠|睡眠问题|心悸|焦虑))/ },
];
const absoluteClaimPattern = /(保证)/;
const rangeClaimPattern = /(安全范围|医学安全阈值)/;
const internalEnumPattern = /\b(full_cup|half_cup|low_caf|no_more_today)\b/;
const repetitiveDecisionPattern = /(本次决策为|当前决策为|规则层|历史证据中|建议今天)/;
const contrastDifferencePattern = /(本次|当前|这次).*(低残留|残留较低|低风险|低于.*参考目标|与.*不同|不同于)|(历史|过去).*(高残留|残留偏高).*(本次|当前|这次)/;
const allowedObservationTypes: ObservationType[] = [
  "low_risk_positive_pattern",
  "evening_intake_pattern",
  "high_residual_pattern",
  "sleep_feedback_overlap",
  "discomfort_overlap",
  "insufficient_data",
  "none",
];
const allowedConfidenceValues: EvidenceStrength[] = ["low", "medium", "high"];

function validationFailure(
  issues: Array<{ code: ExplanationValidationErrorCode; message: string }>,
  diagnostics?: {
    validationFailureField?: ExplanationValidationFailureField;
    unexpectedNumberTokens?: string[];
    safetyTriggerCode?: SafetyTriggerCode;
  },
): ExplanationValidationResult {
  return {
    valid: false,
    errors: issues.map((issue) => issue.message),
    errorCodes: issues.map((issue) => issue.code),
    retryable: issues.every(
      (issue) => issue.code === "schema" || issue.code === "extra_data_limitation" || issue.code === "extra_safety_note",
    ),
    ...diagnostics,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeNumberToken(token: string) {
  const value = Number(token);
  return Number.isFinite(value) ? String(value) : token;
}

export function buildPersonalizedExplanationDataLimitation(input: {
  context: CompactEvidenceContext;
  source: PersonalizedExplanationDataLimitationSource;
}) {
  if (input.source === "insufficient_evidence") return INSUFFICIENT_EVIDENCE_DATA_LIMITATION;
  if (input.source === "unavailable") return UNAVAILABLE_EXPLANATION_DATA_LIMITATION;
  return PERSONALIZED_EXPLANATION_DATA_LIMITATION;
}

function findCausalClaim(textFields: Array<{ field: ExplanationValidationFailureField; value: string }>) {
  for (const item of textFields) {
    const match = causalClaimPatterns.find((entry) => entry.pattern.test(item.value));
    if (match) return { field: item.field, safetyTriggerCode: match.code };
  }
  return undefined;
}

function findInternalEnumExposure(textFields: Array<{ field: ExplanationValidationFailureField; value: string }>) {
  for (const item of textFields) {
    if (internalEnumPattern.test(item.value) || repetitiveDecisionPattern.test(item.value)) return { field: item.field };
  }
  return undefined;
}

function candidateRelationById(context: CompactEvidenceContext, evidenceId: string) {
  return context.historicalEvidence.candidates.find((candidate) => candidate.evidenceId === evidenceId)?.relationToDecision;
}

export function ruleFallbackExplanation(
  context: CompactEvidenceContext,
  reason: string,
  dataLimitationSource: Exclude<PersonalizedExplanationDataLimitationSource, "llm"> = "unavailable",
): PersonalizedPreDrinkExplanation {
  return {
    decision: context.ruleDecision.ruleDecision,
    explanation: context.ruleDecision.ruleActionText,
    historicalObservation: "",
    observationType: "none",
    evidenceIds: [],
    evidenceSummary: "当前展示规则型解释，暂未使用 AI 个性化解释。",
    dataLimitation: buildPersonalizedExplanationDataLimitation({ context, source: dataLimitationSource }),
    actionSuggestion: context.ruleDecision.allowedActionSuggestions[0],
    confidence: "low",
    safetyNote: PERSONALIZED_EXPLANATION_SAFETY_NOTE,
  };
}

export function shouldUsePersonalizedExplanation(context: CompactEvidenceContext) {
  if (!context.historicalEvidence.minimumEvidenceMet) {
    return {
      allowed: false,
      reason: "数据还不够稳定，继续记录后再生成 AI 个性化解释。",
    };
  }
  if (!context.historicalEvidence.candidates.length) {
    return {
      allowed: false,
      reason: "暂未发现足够重复的历史观察，先展示规则型解释。",
    };
  }
  return { allowed: true, reason: "已达到 AI 个性化解释的最低证据门槛。" };
}

export function mockGeneratePersonalizedExplanation(context: CompactEvidenceContext): ModelPersonalizedPreDrinkExplanation {
  const gate = shouldUsePersonalizedExplanation(context);
  if (!gate.allowed) {
    const { dataLimitation: _dataLimitation, safetyNote: _safetyNote, ...fallback } = ruleFallbackExplanation(context, gate.reason);
    return fallback;
  }
  const candidate = context.historicalEvidence.candidates[0];
  const decision = context.ruleDecision.ruleDecision;
  const actionSuggestion = context.ruleDecision.allowedActionSuggestions[0];
  return {
    decision,
    explanation:
      decision === "full_cup"
        ? "这杯目前可以饮用，近期记录没有提示需要额外收紧。"
        : "这次更适合谨慎一点，主要是本次睡前残留或今日累计已经接近需要留意的范围。",
    historicalObservation: candidate.summary,
    observationType: candidate.observationType,
    evidenceIds: [candidate.evidenceId],
    evidenceSummary: candidate.relationSummary,
    actionSuggestion,
    confidence: context.historicalEvidence.evidenceStrength,
  };
}

function withServerGeneratedFields(
  output: ModelPersonalizedPreDrinkExplanation,
  context: CompactEvidenceContext,
): PersonalizedPreDrinkExplanation {
  return {
    ...output,
    dataLimitation: buildPersonalizedExplanationDataLimitation({ context, source: "llm" }),
    safetyNote: PERSONALIZED_EXPLANATION_SAFETY_NOTE,
  };
}

export function validatePersonalizedExplanation(
  output: unknown,
  context: CompactEvidenceContext,
): ExplanationValidationResult {
  const issues: Array<{ code: ExplanationValidationErrorCode; message: string }> = [];
  if (!isRecord(output)) {
    return validationFailure([{ code: "schema", message: "输出不是有效 JSON 对象。" }]);
  }
  if (typeof output.decision !== "string") issues.push({ code: "schema", message: "decision 缺失或类型错误。" });
  if (typeof output.explanation !== "string") issues.push({ code: "schema", message: "explanation 缺失或类型错误。" });
  if (typeof output.historicalObservation !== "string" && output.historicalObservation !== null) {
    issues.push({ code: "schema", message: "historicalObservation 缺失或类型错误。" });
  }
  if (typeof output.observationType !== "string" || !allowedObservationTypes.includes(output.observationType as ObservationType)) {
    issues.push({ code: "schema", message: "observationType 缺失或不在允许枚举内。" });
  }
  if (!Array.isArray(output.evidenceIds) || !output.evidenceIds.every((item) => typeof item === "string")) {
    issues.push({ code: "schema", message: "evidenceIds 缺失或类型错误。" });
  }
  if (typeof output.evidenceSummary !== "string") issues.push({ code: "schema", message: "evidenceSummary 缺失或类型错误。" });
  if (typeof output.actionSuggestion !== "string") issues.push({ code: "schema", message: "actionSuggestion 缺失或类型错误。" });
  if (typeof output.confidence !== "string" || !allowedConfidenceValues.includes(output.confidence as EvidenceStrength)) {
    issues.push({ code: "schema", message: "confidence 缺失或不在允许枚举内。" });
  }
  if ("dataLimitation" in output) issues.push({ code: "extra_data_limitation", message: "模型输出不能包含 dataLimitation。" });
  if ("safetyNote" in output) issues.push({ code: "extra_safety_note", message: "模型输出不能包含 safetyNote。" });
  if (issues.length) return validationFailure(issues);

  const typedOutput = output as ModelPersonalizedPreDrinkExplanation;
  if (typedOutput.decision !== context.ruleDecision.ruleDecision) {
    issues.push({ code: "decision_mismatch", message: "decision 与规则层结论不一致。" });
  }
  if (!context.ruleDecision.allowedActionSuggestions.includes(typedOutput.actionSuggestion)) {
    issues.push({ code: "action_not_allowed", message: "actionSuggestion 不在规则层允许的行动白名单内。" });
  }
  if (typedOutput.confidence !== context.historicalEvidence.evidenceStrength) {
    issues.push({ code: "evidence_strength_mismatch", message: "confidence 必须与规则层证据强度一致。" });
  }
  for (const evidenceId of typedOutput.evidenceIds) {
    if (!context.evidenceIds.includes(evidenceId)) {
      issues.push({ code: "invalid_evidence_id", message: `evidenceId 不存在于输入证据中：${evidenceId}` });
    }
  }
  const textFields: Array<{ field: ExplanationValidationFailureField; value: string }> = [
    { field: "explanation", value: typedOutput.explanation },
    { field: "historicalObservation", value: typedOutput.historicalObservation || "" },
    { field: "evidenceSummary", value: typedOutput.evidenceSummary },
  ];
  const text = textFields.map((item) => item.value).join(" ");
  const internalEnumExposure = findInternalEnumExposure(textFields);
  if (internalEnumExposure) {
    issues.push({ code: "internal_enum_exposed", message: "输出包含不允许展示给用户的内部枚举或内部语言。" });
  }
  if (medicalClaimPattern.test(text)) issues.push({ code: "medical_claim", message: "输出包含不允许的医学化表达。" });
  const causalClaim = findCausalClaim(textFields);
  if (causalClaim) issues.push({ code: "causal_claim", message: "输出包含不允许的因果化表达。" });
  if (absoluteClaimPattern.test(text)) issues.push({ code: "absolute_claim", message: "输出包含不允许的绝对化表达。" });
  if (rangeClaimPattern.test(text)) issues.push({ code: "range_claim", message: "输出包含不建议使用的安全范围类表达。" });
  const usesContrastEvidence = typedOutput.evidenceIds.some((evidenceId) => candidateRelationById(context, evidenceId) === "contrasts_with_decision");
  if (context.ruleDecision.ruleDecision === "full_cup" && usesContrastEvidence && !contrastDifferencePattern.test(text)) {
    issues.push({ code: "evidence_relevance_mismatch", message: "正向建议引用对照证据时，必须说明本次低残留场景与历史高残留场景不同。" });
  }
  const allowedNumberStrings = new Set(
    Object.values(context.allowedFacts)
      .filter((value) => typeof value === "number")
      .map((value) => String(value)),
  );
  let numberDiagnostics:
    | { validationFailureField: ExplanationValidationFailureField; unexpectedNumberTokens: string[] }
    | undefined;
  const unknownNumberByField = textFields
    .map((item) => {
      const numericTokens = item.value.match(/\d+(?:\.\d+)?/g) || [];
      return {
        field: item.field,
        tokens: numericTokens.filter((token) => !allowedNumberStrings.has(token)),
      };
    })
    .find((item) => item.tokens.length > 0);
  if (unknownNumberByField) {
    const normalizedUnexpectedTokens = [...new Set(unknownNumberByField.tokens.map(normalizeNumberToken))];
    issues.push({ code: "unknown_number", message: `输出包含未在 allowedFacts 中声明的数字：${normalizedUnexpectedTokens.join(", ")}` });
    numberDiagnostics = {
      validationFailureField: unknownNumberByField.field,
      unexpectedNumberTokens: normalizedUnexpectedTokens,
    };
  }
  if (issues.length) {
    return validationFailure(issues, {
      ...numberDiagnostics,
      ...(causalClaim
        ? {
            validationFailureField: causalClaim.field,
            safetyTriggerCode: causalClaim.safetyTriggerCode,
          }
        : {}),
      ...(internalEnumExposure
        ? {
            validationFailureField: internalEnumExposure.field,
          }
        : {}),
    });
  }
  const finalOutput = withServerGeneratedFields(typedOutput, context);
  if (finalOutput.dataLimitation !== buildPersonalizedExplanationDataLimitation({ context, source: "llm" })) {
    return validationFailure([{ code: "extra_data_limitation", message: "服务端数据限制说明不一致。" }]);
  }
  if (finalOutput.safetyNote !== PERSONALIZED_EXPLANATION_SAFETY_NOTE) {
    return validationFailure([{ code: "extra_safety_note", message: "服务端安全提示不一致。" }]);
  }
  return { valid: true, value: finalOutput };
}

export function getValidatedMockExplanation(context: CompactEvidenceContext) {
  const output = mockGeneratePersonalizedExplanation(context);
  const validation = validatePersonalizedExplanation(output, context);
  if (validation.valid) return validation;
  const validationErrors = "errors" in validation ? validation.errors.join("；") : "个性化解释校验未通过。";
  const { dataLimitation: _dataLimitation, safetyNote: _safetyNote, ...fallback } = ruleFallbackExplanation(context, validationErrors);
  return validatePersonalizedExplanation(fallback, context);
}
