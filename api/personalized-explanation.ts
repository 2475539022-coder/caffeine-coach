import {
  ruleFallbackExplanation,
  shouldUsePersonalizedExplanation,
  validatePersonalizedExplanation,
  type ExplanationValidationErrorCode,
  type ExplanationValidationFailureField,
  type ModelPersonalizedPreDrinkExplanation,
  type PersonalizedPreDrinkExplanation,
  type SafetyTriggerCode,
} from "../src/ai/personalizedPreDrinkExplanation.js";
import type { CompactEvidenceContext } from "../src/decision/aiExplanationEvidenceBuilder.js";

declare const process: {
  env: Record<string, string | undefined>;
};

type ApiRequest = {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  status: (statusCode: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
};

type ApiSuccess = {
  success: true;
  data: PersonalizedPreDrinkExplanation;
  source: "llm" | "fallback";
  fallbackType?: string;
  validationFailureCode?: ValidationFailureCode;
  validationFailureField?: ExplanationValidationFailureField;
  unexpectedNumberTokens?: string[];
  safetyTriggerCode?: SafetyTriggerCode;
};

type ApiFailure = {
  success: false;
  error: string;
  fallbackType: string;
};

const PROMPT_VERSION = "personalized-pre-drink-explanation-v1";
const SCHEMA_VERSION = "ai-explanation-output-v1";
const SAFETY_VERSION = "safety-v1";

type ValidationFailureCode =
  | "schema_invalid"
  | "decision_mismatch"
  | "action_not_allowed"
  | "invalid_evidence_id"
  | "fact_number_not_allowed"
  | "evidence_strength_mismatch"
  | "medical_claim"
  | "causal_claim"
  | "absolute_claim"
  | "evidence_relevance_mismatch"
  | "range_claim"
  | "internal_enum_exposed"
  | "safety_note_invalid"
  | "unknown_validation_failure";

type CausalValidationFailureField =
  | "explanation"
  | "historicalObservation"
  | "evidenceSummary"
  | "dataLimitation"
  | "actionSuggestion"
  | "unknown";

function json(res: ApiResponse, statusCode: number, body: ApiSuccess | ApiFailure) {
  res.setHeader?.("Cache-Control", "no-store");
  return res.status(statusCode).json(body);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCompactEvidenceContext(value: unknown): value is CompactEvidenceContext {
  if (!isObject(value)) return false;
  if (value.schemaVersion !== "ai-explanation-input-v1") return false;
  if (!isObject(value.ruleDecision)) return false;
  if (!isObject(value.historicalEvidence)) return false;
  if (!Array.isArray(value.evidenceIds)) return false;
  if (!isObject(value.allowedFacts)) return false;
  if (!Array.isArray(value.allowedActionSuggestions)) return false;
  return true;
}

function buildEndpoint(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

function buildSystemPrompt() {
  return [
    "你是 Caffeine Coach 的 AI 个性化喝前解释器。",
    "咖啡因计算、风险等级和本次行动建议已经由产品规则完成，你只能解释，不能改写。",
    "你必须输出 JSON，字段必须符合 schema。",
    "不得重新计算数字，不得新增事实，不得编造饮品、记录、反馈或咖啡因含量。",
    "不得在用户可见文案中输出内部枚举：full_cup、half_cup、low_caf、no_more_today。",
    "不得使用“本次决策为”“当前决策为”“规则层”“历史证据中”“建议今天”等内部或重复表达。",
    "只能在用户可见文案中使用中文自然语言，例如：可以饮用、建议半杯、建议低因、今天先不喝。",
    "不得引用任何输入中未提供的数字。",
    "不得补充每日摄入上限、医学阈值、推荐标准或通用健康知识。",
    "只能原样使用 compactContext.allowedFacts 中明确提供的数字。",
    "数字不是必要信息时，使用“当前建议量”“近期”“较高”“较低”等定性表达。",
    "explanation 只写一段：当前中文行动建议 + 最关键的规则依据 + 历史证据如何支持或对照本次建议。",
    "explanation 不要重复 ruleActionText 原句，不要以“建议今天”“本次决策为”等句式开头。",
    "historicalObservation 只描述历史事实本身，不写本次建议，不写原因推导，不写与当前建议的关系。",
    "evidenceSummary 只用一句话说明这条历史事实与当前建议的支持或对照关系，不重复完整历史事实。",
    "explanation、historicalObservation、evidenceSummary 三个字段不得机械重复同一句话。",
    "只能使用与当前行动建议相关的历史证据。",
    "优先使用 relationToDecision 为 supports_decision 的证据。",
    "如果使用 relationToDecision 为 contrasts_with_decision 的证据，必须明确说明当前场景与历史场景的关键差异。",
    "禁止在正向行动建议后直接堆叠未解释差异的负向历史证据。",
    "没有相关历史证据时，historicalObservation 必须返回 null，evidenceIds 返回 []，observationType 返回 none。",
    "confidence 必须原样返回 compactContext.historicalEvidence.evidenceStrength，不能自行判断。",
    "不得使用“安全范围”“医学安全阈值”等表达。",
    "参考目标不得归因为用户个人设置，统一称为“当前默认参考目标”。",
    "优先使用“低于当前默认参考目标”“按当前规则判定为低风险”。",
    "不得把共现写成因果，不得做医学诊断，不得承诺一定不会失眠。",
    "只能描述历史记录中的“同时出现、相关、趋势或参考信息”。",
    "描述历史事实时必须是完整自然句，例如“近期有几天同时出现较晚饮用和睡眠反馈”，不要输出缺少对象的生硬短语。",
    "不得把历史记录表达为确定的因果关系。",
    "不得说明某次饮用“导致、造成、引发、带来、使你、使得、会让、会使、从而导致、直接影响”某个结果。",
    "不得使用“因为 A，所以一定会 B”或类似确定因果链。",
    "不得根据有限历史记录下医学或生理结论。",
    "explanation 推荐固定逻辑：先说明当前中文行动建议来自本次估算；再说明一条历史现象对本次建议的支持或对照作用；最后保持克制，不写成长周报。",
    "禁止表达示例：较晚饮用会导致你睡不好；咖啡因会让你今晚失眠；晚喝咖啡会带来更严重的睡眠问题；这些记录证明咖啡因直接影响了你的睡眠。",
    "允许表达示例：近期记录中，较晚饮用与较差反馈曾同时出现；结合这些记录，本次可以优先遵循半杯建议；该现象仅作为当前建议的参考，不代表因果关系。",
    "full_cup 对照表达示例：过去高残留场景下出现过睡眠反馈，但本次睡前预计残留低于当前默认参考目标，按当前规则判定为低风险，因此这条历史记录只作为对照参考。",
    "字段示例：historicalObservation 写“近期有几天同时出现较晚饮用和睡眠反馈”；evidenceSummary 写“这支持本次控制份量的建议”。",
    "actionSuggestion 必须来自 allowedActionSuggestions。",
    "用户可见字段 explanation、historicalObservation、evidenceSummary 绝对不得出现 full_cup、half_cup、low_caf、no_more_today。",
    "JSON 字段 decision 必须与 ruleDecision.ruleDecision 完全一致，但不得把这个内部值写进 explanation、historicalObservation 或 evidenceSummary。",
  ].join("\n");
}

function buildUserPrompt(context: CompactEvidenceContext) {
  return JSON.stringify({
    task: "基于结构化证据生成本次喝前决策的个性化解释。",
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    safetyVersion: SAFETY_VERSION,
    outputSchema: {
      decision: "full_cup | half_cup | low_caf | no_more_today",
      explanation: "string",
      historicalObservation: "string | null",
      observationType:
        "low_risk_positive_pattern | evening_intake_pattern | high_residual_pattern | sleep_feedback_overlap | discomfort_overlap | insufficient_data | none",
      evidenceIds: "string[]",
      evidenceSummary: "string",
      actionSuggestion: "full_cup | half_cup | low_caf | no_more_today",
      confidence: "low | medium | high",
    },
    compactContext: context,
  });
}

async function callLlm(context: CompactEvidenceContext) {
  const hasApiKey = Boolean(process.env.LLM_API_KEY);
  const provider = process.env.LLM_PROVIDER || "qwen";
  const model = process.env.LLM_MODEL;
  const baseUrl = process.env.LLM_BASE_URL;
  if (!hasApiKey || !model || !baseUrl) {
    return { ok: false as const, fallbackType: "missing_server_env", retryable: false };
  }
  if (provider !== "qwen") {
    return { ok: false as const, fallbackType: "unsupported_provider", retryable: false };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(buildEndpoint(baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(context) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        enable_thinking: false,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false as const,
        fallbackType: `llm_http_${response.status}`,
        retryable: response.status === 429 || response.status >= 500,
      };
    }
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return { ok: false as const, fallbackType: "missing_llm_content", retryable: true };
    try {
      return { ok: true as const, output: JSON.parse(content) as ModelPersonalizedPreDrinkExplanation };
    } catch {
      return { ok: false as const, fallbackType: "invalid_json_content", retryable: true };
    }
  } catch (error) {
    return {
      ok: false as const,
      fallbackType: error instanceof DOMException && error.name === "AbortError" ? "api_timeout" : "api_error",
      retryable: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callLlmWithTechnicalRetry(context: CompactEvidenceContext) {
  const firstResult = await callLlm(context);
  if (firstResult.ok || !firstResult.retryable) return { ...firstResult, attemptCount: 1 };
  const retryResult = await callLlm(context);
  return { ...retryResult, attemptCount: 2 };
}

function classifyValidationFailure(errorCodes: ExplanationValidationErrorCode[]): ValidationFailureCode {
  if (errorCodes.includes("schema")) return "schema_invalid";
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
  if (errorCodes.includes("extra_data_limitation")) return "schema_invalid";
  if (errorCodes.includes("extra_safety_note")) return "schema_invalid";
  return "unknown_validation_failure";
}

function toCausalValidationFailureField(field?: ExplanationValidationFailureField): CausalValidationFailureField {
  if (
    field === "explanation" ||
    field === "historicalObservation" ||
    field === "evidenceSummary" ||
    field === "dataLimitation" ||
    field === "actionSuggestion"
  ) {
    return field;
  }
  return "unknown";
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const startedAt = Date.now();
  if (req.method !== "POST") {
    return json(res, 405, { success: false, error: "Method not allowed", fallbackType: "method_not_allowed" });
  }
  const context = isObject(req.body) && "context" in req.body ? (req.body as { context?: unknown }).context : req.body;
  if (!isCompactEvidenceContext(context)) {
    return json(res, 400, { success: false, error: "Invalid compact evidence context", fallbackType: "invalid_context" });
  }
  const gate = shouldUsePersonalizedExplanation(context);
  if (!gate.allowed) {
    return json(res, 200, {
      success: true,
      source: "fallback",
      fallbackType: "insufficient_evidence",
      data: ruleFallbackExplanation(context, gate.reason, "insufficient_evidence"),
    });
  }
  const llmResult = await callLlmWithTechnicalRetry(context);
  if (!llmResult.ok) {
    return json(res, 200, {
      success: true,
      source: "fallback",
      fallbackType: llmResult.fallbackType,
      data: ruleFallbackExplanation(context, "个性化解释暂不可用，已展示规则型解释。", "unavailable"),
    });
  }
  let validation = validatePersonalizedExplanation(llmResult.output, context);
  let attemptCount = llmResult.attemptCount;
  if (!validation.valid && "retryable" in validation && validation.retryable) {
    const retryResult = await callLlm(context);
    attemptCount += 1;
    if (retryResult.ok) validation = validatePersonalizedExplanation(retryResult.output, context);
  }
  if (!validation.valid) {
    const validationFailureCode = "errorCodes" in validation
      ? classifyValidationFailure(validation.errorCodes)
      : "unknown_validation_failure";
    const factNumberDiagnostics =
      validationFailureCode === "fact_number_not_allowed" && "unexpectedNumberTokens" in validation
        ? {
            validationFailureField: validation.validationFailureField || "unknown",
            unexpectedNumberTokens: validation.unexpectedNumberTokens || [],
          }
        : {};
    const causalDiagnostics =
      validationFailureCode === "causal_claim" && "safetyTriggerCode" in validation
        ? {
            validationFailureField: toCausalValidationFailureField(validation.validationFailureField),
            safetyTriggerCode: validation.safetyTriggerCode || "unknown_causal_pattern",
          }
        : {};
    const internalEnumDiagnostics =
      validationFailureCode === "internal_enum_exposed" && "validationFailureField" in validation
        ? {
            validationFailureField: validation.validationFailureField || "unknown",
          }
        : {};
    console.warn(
      [
        "personalized_explanation_validation_failed",
        `requestId=${context.requestId}`,
        `validationFailureCode=${validationFailureCode}`,
        `attemptCount=${attemptCount}`,
        `latencyMs=${Date.now() - startedAt}`,
        `model=${process.env.LLM_MODEL || "not_configured"}`,
      ].join(" "),
    );
    return json(res, 200, {
      success: true,
      source: "fallback",
      fallbackType: "validation_failed",
      validationFailureCode,
      ...factNumberDiagnostics,
      ...causalDiagnostics,
      ...internalEnumDiagnostics,
      data: ruleFallbackExplanation(context, "个性化解释未通过安全或事实校验，已展示规则型解释。", "unavailable"),
    });
  }
  return json(res, 200, {
    success: true,
    source: "llm",
    data: validation.value,
  });
}
